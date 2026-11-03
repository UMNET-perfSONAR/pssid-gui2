#!/bin/bash
# Deliver the generated pSSID configuration to the probes.
#
# Runs on the CONTROLLER HOST, not inside a container, and that is the whole
# point. The server container has no ssh or scp, runs as uid 1000 with a
# read-only root filesystem and every capability dropped, so it cannot deliver
# anything -- and it should not be able to. This step needs a key with root on
# every probe, and the one process that must never hold that key is the
# internet-facing web application: a single RCE there would otherwise become root
# on the whole fleet. The GUI generates and validates; this script delivers.
#
#   sudo scripts/provision-probes.sh                 # every probe in the inventory
#   sudo scripts/provision-probes.sh --limit rpi4    # one group
#   sudo scripts/provision-probes.sh --limit 10.0.0.5
#   sudo scripts/provision-probes.sh --dry-run       # show the plan, touch nothing
#   sudo scripts/provision-probes.sh --wait 120      # wait up to 2 min for adoption
#
# What it does, per probe: copy pssid_config.json over SSH to a temporary file,
# then move it into place in a single atomic step, so a probe never reads a
# half-written config even if the transfer dies mid-way.
#
# Then it asks each probe whether it ADOPTED the file. pssid-daemon 2.0+ picks a
# new file up by itself, between runs, and publishes the sha256 of the config it
# runs (and of any it refused, with why) in /run/pssid/status.json. Each probe
# is reported as adopted, refused, pending (still in a run, or not noticed yet;
# waited for up to --wait seconds, default 30) or unknown (an older daemon, which
# publishes nothing: there, delivered is all this side can know).
set -uo pipefail

OUTPUT_DIR="${PSSID_OUTPUT_DIR:-/var/lib/pssid/output}"
SSH_USER="${PSSID_SSH_USER:-root}"
SSH_KEY="${PSSID_SSH_KEY:-}"
DEST="${PSSID_CONFIG_DEST:-/etc/pssid/pssid_config.json}"
LIMIT=""
DRY_RUN=false
SSH_OPTS_EXTRA="${PSSID_SSH_OPTS:-}"
WAIT_SECONDS="${PSSID_ADOPTION_WAIT:-30}"
STATUS_PATH="${PSSID_STATUS_PATH:-/run/pssid/status.json}"

while [ $# -gt 0 ]; do
  case "$1" in
    --limit=*)      LIMIT="${1#*=}" ;;
    --limit)        shift; LIMIT="${1:-}" ;;
    --output-dir=*) OUTPUT_DIR="${1#*=}" ;;
    --ssh-key=*)    SSH_KEY="${1#*=}" ;;
    --user=*)       SSH_USER="${1#*=}" ;;
    --dest=*)       DEST="${1#*=}" ;;
    --wait=*)       WAIT_SECONDS="${1#*=}" ;;
    --wait)         shift; WAIT_SECONDS="${1:-}" ;;
    --dry-run)      DRY_RUN=true ;;
    -h|--help)      sed -n '2,31p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)              echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

case "$WAIT_SECONDS" in
  ''|*[!0-9]*) echo "error: --wait takes a whole number of seconds" >&2; exit 2 ;;
esac

CONFIG="$OUTPUT_DIR/pssid_config.json"
INVENTORY="$OUTPUT_DIR/hosts.ini"

for f in "$CONFIG" "$INVENTORY"; do
  if [ ! -r "$f" ]; then
    echo "error: $f is missing or unreadable." >&2
    echo "Generate it first: Settings > Configuration > Generate in the GUI." >&2
    exit 1
  fi
done

# Refuse to ship a config the daemon would reject. The GUI validates before
# writing, but this script can be run against whatever is on disk -- including a
# file edited by hand -- and a probe that gets malformed JSON stops testing until
# someone notices.
#
# The interpreter is PROVEN to work before its verdict is trusted. `command -v`
# is not enough: a stub that exists but cannot run (Windows' python3 shim is one,
# and a broken venv shebang is another) would fail the check and make this script
# refuse to deliver a perfectly good config -- turning a missing tool into a
# false accusation about the file. No usable interpreter means the check is
# skipped, not failed.
if command -v python3 >/dev/null 2>&1 && python3 -c 'pass' >/dev/null 2>&1; then
  if ! python3 -c 'import json,sys; json.load(open(sys.argv[1]))' "$CONFIG" 2>/dev/null; then
    echo "error: $CONFIG is not valid JSON. Refusing to deliver it." >&2
    exit 1
  fi
elif command -v node >/dev/null 2>&1; then
  if ! node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' "$CONFIG" 2>/dev/null; then
    echo "error: $CONFIG is not valid JSON. Refusing to deliver it." >&2
    exit 1
  fi
fi

# ── Which probes ─────────────────────────────────────────────────────────────
# buildIniContent writes every host first, one per line, then one [group] section
# per host group. So: the bare lines at the top are the full fleet, and a named
# section is a group. A regex-only group renders as a "#Regex" comment with no
# members (Ansible cannot expand a pattern), which is why those lines are skipped
# rather than treated as hosts.
all_hosts() {
  awk '/^\[/{exit} /^[[:space:]]*#/{next} /^[[:space:]]*$/{next} {print $1}' "$INVENTORY"
}
group_hosts() { # group_hosts <name>
  awk -v want="[$1]" '
    $0 == want {inside=1; next}
    /^\[/ {inside=0}
    inside && !/^[[:space:]]*#/ && NF {print $1}
  ' "$INVENTORY"
}

if [ -z "$LIMIT" ] || [ "$LIMIT" = "*" ] || [ "$LIMIT" = "all" ]; then
  TARGETS="$(all_hosts)"
  SCOPE="every probe"
elif grep -q "^\[$LIMIT\]" "$INVENTORY" 2>/dev/null; then
  TARGETS="$(group_hosts "$LIMIT")"
  SCOPE="group '$LIMIT'"
else
  # A single host: only accept it if the inventory actually lists it, so a typo
  # fails here rather than silently provisioning nothing.
  if all_hosts | grep -qx -- "$LIMIT"; then
    TARGETS="$LIMIT"
    SCOPE="probe '$LIMIT'"
  else
    echo "error: '$LIMIT' is neither a host nor a group in $INVENTORY." >&2
    echo "Known hosts: $(all_hosts | tr '\n' ' ')" >&2
    exit 1
  fi
fi

if [ -z "${TARGETS//[[:space:]]/}" ]; then
  echo "Nothing to do: $SCOPE resolves to no probes."
  echo "(A group whose members are matched only by regex has no entries in the"
  echo " inventory -- Ansible cannot expand a pattern, so the daemon does that"
  echo " matching itself on the probe.)"
  exit 0
fi

SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new)
[ -n "$SSH_KEY" ] && SSH_OPTS+=(-i "$SSH_KEY")
# shellcheck disable=SC2206  # deliberate word splitting: caller-supplied ssh flags
[ -n "$SSH_OPTS_EXTRA" ] && SSH_OPTS+=($SSH_OPTS_EXTRA)

echo "Delivering $(basename "$CONFIG") to $SCOPE"
echo "  source : $CONFIG"
echo "  dest   : ${SSH_USER}@<probe>:${DEST}"
$DRY_RUN && echo "  MODE   : dry run, nothing will be copied"
echo ""

ok_list=""; fail_list=""
for host in $TARGETS; do
  if $DRY_RUN; then
    printf "  would deliver -> %s\n" "$host"
    ok_list="$ok_list $host"
    continue
  fi

  tmp="${DEST}.incoming.$$"
  dest_dir="$(dirname "$DEST")"
  # Create the destination directory BEFORE the copy: scp cannot write into a
  # directory that does not exist, and on a probe where pSSID has not run yet
  # /etc/pssid is absent -- so doing this afterwards failed every first delivery
  # with "dest open ...: No such file or directory".
  #
  # Then copy to a temporary name and move it into place in one step, so a probe
  # reading its config while this runs sees either the old file or the new one,
  # never a truncated one.
  if ssh "${SSH_OPTS[@]}" -- "${SSH_USER}@${host}" "mkdir -p '$dest_dir'" >/dev/null 2>&1 \
     && scp "${SSH_OPTS[@]}" -- "$CONFIG" "${SSH_USER}@${host}:${tmp}" >/dev/null 2>&1 \
     && ssh "${SSH_OPTS[@]}" -- "${SSH_USER}@${host}" "mv -f '$tmp' '$DEST'" >/dev/null 2>&1; then
    printf "  ok       %s\n" "$host"
    ok_list="$ok_list $host"
  else
    printf "  FAILED   %s\n" "$host"
    fail_list="$fail_list $host"
    # Best effort: do not leave the partial file behind on a probe.
    ssh "${SSH_OPTS[@]}" -- "${SSH_USER}@${host}" "rm -f '$tmp'" >/dev/null 2>&1 || true
  fi
done

# ── Did each probe adopt it? ─────────────────────────────────────────────────
# Asked of pssid-daemon itself: the sha256 of the config it runs, and of any it
# refused, from its status file. It adopts a new file between runs, so a probe
# in the middle of a long batch stays "pending" for a while.
adopted_list=""; pending_list=""; unknown_list=""; refused_lines=""

adoption_of() { # adoption_of <host> -> adopted | refused<TAB>why | pending | unknown
  local status answer
  # No status file: a daemon older than 2.0 (or none at all) -- it cannot say.
  status="$(ssh "${SSH_OPTS[@]}" -- "${SSH_USER}@$1" "cat '$STATUS_PATH'" 2>/dev/null)" || { echo "unknown"; return; }
  answer="$(printf '%s' "$status" | python3 -c '
import json, sys
want = sys.argv[1]
try:
    config = json.load(sys.stdin).get("config") or {}
except (ValueError, AttributeError):
    sys.exit()
refused = config.get("rejected") or {}
if config.get("digest") == want:
    print("adopted")
elif refused.get("digest") == want:
    print("refused\t" + (refused.get("errors") or ["see the daemon log on the probe"])[0])
else:
    print("pending")
' "$WANT" 2>/dev/null)"
  echo "${answer:-unknown}"
}

if ! $DRY_RUN && [ -n "${ok_list// /}" ]; then
  if command -v python3 >/dev/null 2>&1 && python3 -c 'pass' >/dev/null 2>&1; then
    WANT="$(sha256sum "$CONFIG" | awk '{print $1}')"
    echo ""
    echo "Asking each probe whether it adopted the file (waiting up to ${WAIT_SECONDS}s)"
    deadline=$(( $(date +%s) + WAIT_SECONDS ))
    waiting="$ok_list"
    while :; do
      still=""
      for host in $waiting; do
        answer="$(adoption_of "$host")"
        case "$answer" in
          adopted)  adopted_list="$adopted_list $host" ;;
          refused*) refused_lines="${refused_lines}${host}"$'\t'"${answer#refused$'\t'}"$'\n' ;;
          unknown)  unknown_list="$unknown_list $host" ;;
          *)        still="$still $host" ;;
        esac
      done
      waiting="$still"
      if [ -z "${waiting// /}" ] || [ "$(date +%s)" -ge "$deadline" ]; then break; fi
      sleep 5
    done
    pending_list="$waiting"
  else
    unknown_list="$ok_list"  # no python3 on this host to read the probes' status
  fi
fi

# ── Record the outcome where the GUI can see it ──────────────────────────────
# The output directory is bind-mounted into the server container, so this file is
# readable from the application side.
json_list() { printf '%s' "$1" | awk '{for(i=1;i<=NF;i++) printf "%s\"%s\"", (i>1?", ":""), $i}'; }
json_text() { local s="${1//\\/\\\\}"; s="${s//\"/\\\"}"; printf '"%s"' "$s"; }
refused_json() {
  local sep="" host why
  while IFS=$'\t' read -r host why; do
    [ -n "$host" ] || continue
    printf '%s{"host": %s, "error": %s}' "$sep" "$(json_text "$host")" "$(json_text "$why")"
    sep=", "
  done <<< "$refused_lines"
}

if ! $DRY_RUN; then
  RESULT="$OUTPUT_DIR/last-delivery.json"
  {
    printf '{\n'
    printf '  "delivered_at": "%s",\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf '  "scope": "%s",\n' "$SCOPE"
    printf '  "destination": "%s",\n' "$DEST"
    printf '  "delivered": [%s],\n' "$(json_list "$ok_list")"
    printf '  "failed": [%s],\n' "$(json_list "$fail_list")"
    printf '  "adopted": [%s],\n' "$(json_list "$adopted_list")"
    printf '  "pending": [%s],\n' "$(json_list "$pending_list")"
    printf '  "refused": [%s],\n' "$(refused_json)"
    printf '  "unknown": [%s],\n' "$(json_list "$unknown_list")"
    printf '  "note": "adopted: the probe runs this file. pending: delivered, not adopted yet (the daemon adopts between runs). refused: the probe found errors and keeps its previous config. unknown: a daemon older than 2.0, which does not say."\n'
    printf '}\n'
  } > "$RESULT" 2>/dev/null || echo "warning: could not write $RESULT" >&2
fi

echo ""
$DRY_RUN && { echo "Dry run: would deliver to:$ok_list"; exit 0; }
[ -n "${adopted_list// /}" ] && echo "Adopted by:$adopted_list"
[ -n "${pending_list// /}" ] && echo "Delivered, not adopted yet (the daemon adopts between runs; check again with: pssid-daemon.py --status):$pending_list"
[ -n "${unknown_list// /}" ] && echo "Delivered; adoption unknown (pssid-daemon before 2.0 does not say):$unknown_list"
status=0
if [ -n "$refused_lines" ]; then
  echo "REFUSED (the probe keeps its previous config):" >&2
  while IFS=$'\t' read -r host why; do
    [ -n "$host" ] && echo "  $host: $why" >&2
  done <<< "$refused_lines"
  echo "Fix the config in the GUI and generate it again." >&2
  status=1
fi
if [ -n "${fail_list// /}" ]; then
  echo "FAILED to deliver:$fail_list" >&2
  echo "" >&2
  echo "Check that this host can reach each probe as ${SSH_USER} with the key in use:" >&2
  echo "  ssh ${SSH_OPTS[*]} ${SSH_USER}@<probe> true" >&2
  status=1
fi
exit "$status"
