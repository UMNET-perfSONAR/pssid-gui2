#!/usr/bin/env bash
# provision-probes.sh: delivery, then adoption as each probe's daemon reports it.
# ssh and scp are mocks; each fake probe is a directory, and its status.json is
# what pssid-daemon 2.0+ would publish (or nothing, for an older daemon).
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf -- "$WORK"' EXIT
mkdir -p "$WORK/bin" "$WORK/output" "$WORK/probes"

# ssh [opts] -- user@host "command": runs the command against that probe's directory.
cat > "$WORK/bin/ssh" <<'MOCK'
#!/usr/bin/env bash
set -u
while [ "$1" != "--" ]; do shift; done
shift
host="${1#*@}"; shift
root="$PROBES/$host"
[ -d "$root" ] || exit 255
cmd="$*"
case "$cmd" in
  "mkdir -p "*) exit 0 ;;
  "mv -f "*)
    cp "$root/incoming" "$root/delivered"
    exit 0 ;;
  "rm -f "*) exit 0 ;;
  "cat "*)
    # A probe that adopts after a few polls (it was in the middle of a run).
    if [ -f "$root/adopts_after" ]; then
      n=$(( $(cat "$root/polls" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$root/polls"
      if [ "$n" -ge "$(cat "$root/adopts_after")" ]; then
        sed "s/OLD_DIGEST/$(sha256sum "$root/delivered" | cut -d' ' -f1)/" "$root/status.template"
      else
        cat "$root/status.template"
      fi
      exit 0
    fi
    [ -f "$root/status.json" ] || exit 1
    sed "s/DELIVERED_DIGEST/$(sha256sum "$root/delivered" | cut -d' ' -f1)/" "$root/status.json"
    exit 0 ;;
esac
exit 97
MOCK
# scp [opts] -- file user@host:path
cat > "$WORK/bin/scp" <<'MOCK'
#!/usr/bin/env bash
set -u
while [ "$1" != "--" ]; do shift; done
shift
host="${2#*@}"; host="${host%%:*}"
[ -d "$PROBES/$host" ] || exit 1
cp "$1" "$PROBES/$host/incoming"
MOCK
chmod +x "$WORK/bin/ssh" "$WORK/bin/scp"
export PATH="$WORK/bin:$PATH" PROBES="$WORK/probes"

printf '{"hosts": []}\n' > "$WORK/output/pssid_config.json"
printf 'adopts\nrefuses\nslow\nold\nunreachable\n' > "$WORK/output/hosts.ini"
mkdir "$WORK/probes/adopts" "$WORK/probes/refuses" "$WORK/probes/slow" "$WORK/probes/old"
printf '{"config": {"digest": "DELIVERED_DIGEST", "rejected": null}}\n' > "$WORK/probes/adopts/status.json"
printf '{"config": {"digest": "abc", "rejected": {"digest": "DELIVERED_DIGEST", "errors": ["batch \\"b\\" > job \\"j\\": is not defined"]}}}\n' \
  > "$WORK/probes/refuses/status.json"
printf '{"config": {"digest": "OLD_DIGEST", "rejected": null}}\n' > "$WORK/probes/slow/status.template"
echo 2 > "$WORK/probes/slow/adopts_after"

set +e
out="$(PSSID_ADOPTION_WAIT=10 bash "$REPO/scripts/provision-probes.sh" --output-dir="$WORK/output" 2>&1)"
code=$?
set -e
echo "$out"
[ "$code" = 1 ] || { echo "expected exit 1 (one refused, one unreachable), got $code"; exit 90; }

result="$WORK/output/last-delivery.json"
python3 - "$result" <<'CHECK'
import json, sys
r = json.load(open(sys.argv[1]))
assert r["delivered"] == ["adopts", "refuses", "slow", "old"], r["delivered"]
assert r["failed"] == ["unreachable"], r["failed"]
assert r["adopted"] == ["adopts", "slow"], r["adopted"]
assert r["pending"] == [], r["pending"]
assert r["unknown"] == ["old"], r["unknown"]
assert r["refused"] == [{"host": "refuses", "error": 'batch "b" > job "j": is not defined'}], r["refused"]
CHECK
grep -q 'refuses: batch "b" > job "j": is not defined' <<< "$out" || exit 91
grep -q 'adoption unknown (pssid-daemon before 2.0 does not say): old' <<< "$out" || exit 92

# A probe still busy when the wait runs out is reported as pending.
rm -f "$WORK/probes/slow/polls"; echo 99 > "$WORK/probes/slow/adopts_after"
printf 'slow\n' > "$WORK/output/hosts.ini"
out="$(bash "$REPO/scripts/provision-probes.sh" --output-dir="$WORK/output" --wait 0)"
grep -q 'not adopted yet' <<< "$out" || exit 93
python3 -c 'import json,sys; assert json.load(open(sys.argv[1]))["pending"] == ["slow"]' "$result"

bash "$REPO/scripts/provision-probes.sh" --output-dir="$WORK/output" --wait=soon 2>/dev/null && exit 94
echo 'provision-probes adoption checks passed.'
