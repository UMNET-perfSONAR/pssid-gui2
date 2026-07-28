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
#
# What it does, per probe: copy pssid_config.json over SSH to a temporary file,
# then move it into place in a single atomic step, so a probe never reads a
# half-written config even if the transfer dies mid-way.
#
# What it deliberately does NOT do: restart the daemon, or verify that the probe
# adopted the file. Nothing here can observe that, so nothing here claims it. The
# result recorded for the GUI says the file was DELIVERED, which is the only
# thing this side can honestly know.
set -uo pipefail

OUTPUT_DIR="${PSSID_OUTPUT_DIR:-/var/lib/pssid/output}"
SSH_USER="${PSSID_SSH_USER:-root}"
SSH_KEY="${PSSID_SSH_KEY:-}"
DEST="${PSSID_CONFIG_DEST:-/etc/pssid/pssid_config.json}"
LIMIT=""
DRY_RUN=false
SSH_OPTS_EXTRA="${PSSID_SSH_OPTS:-}"

while [ $# -gt 0 ]; do
  case "$1" in
    --limit=*)      LIMIT="${1#*=}" ;;
    --limit)        shift; LIMIT="${1:-}" ;;
    --output-dir=*) OUTPUT_DIR="${1#*=}" ;;
    --ssh-key=*)    SSH_KEY="${1#*=}" ;;
    --user=*)       SSH_USER="${1#*=}" ;;
    --dest=*)       DEST="${1#*=}" ;;
    --dry-run)      DRY_RUN=true ;;
    -h|--help)      sed -n '2,28p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)              echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

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

# ── Record the outcome where the GUI can see it ──────────────────────────────
# The output directory is bind-mounted into the server container, so this file is
# readable from the application side. It records DELIVERY only -- see the header.
if ! $DRY_RUN; then
  RESULT="$OUTPUT_DIR/last-delivery.json"
  {
    printf '{\n'
    printf '  "delivered_at": "%s",\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf '  "scope": "%s",\n' "$SCOPE"
    printf '  "destination": "%s",\n' "$DEST"
    printf '  "delivered": [%s],\n' "$(printf '%s' "$ok_list" | awk '{for(i=1;i<=NF;i++) printf "%s\"%s\"", (i>1?", ":""), $i}')"
    printf '  "failed": [%s],\n' "$(printf '%s' "$fail_list" | awk '{for(i=1;i<=NF;i++) printf "%s\"%s\"", (i>1?", ":""), $i}')"
    printf '  "note": "Delivery only. Whether the daemon adopted this file is not observable from the controller."\n'
    printf '}\n'
  } > "$RESULT" 2>/dev/null || echo "warning: could not write $RESULT" >&2
fi

echo ""
if [ -n "${fail_list// /}" ]; then
  echo "Delivered to:$ok_list"
  echo "FAILED:$fail_list" >&2
  echo "" >&2
  echo "Check that this host can reach each probe as ${SSH_USER} with the key in use:" >&2
  echo "  ssh ${SSH_OPTS[*]} ${SSH_USER}@<probe> true" >&2
  exit 1
fi

echo "Delivered to every target:$ok_list"
echo "The daemon picks the file up by its own mechanism; that is not visible from here."
