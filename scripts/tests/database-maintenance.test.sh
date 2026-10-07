#!/usr/bin/env bash
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf -- "$WORK"' EXIT
mkdir "$WORK/bin"
cat > "$WORK/bin/docker" <<'MOCK'
#!/usr/bin/env bash
set -eu
if [ "$1" = compose ]; then
  [ "$*" = 'compose ps -q mongo' ] || exit 90
  printf '%s' "${MOCK_CONTAINER:-}"
elif [ "$1" = exec ]; then
  shift
  if [ "$1" = -i ]; then shift; fi
  [ "$1" = "${EXPECTED_CONTAINER:-project-mongo}" ] || exit 91
  if [ "${MOCK_FAIL:-false}" = true ]; then echo partial; exit 1; fi
  echo archive
else
  exit 92
fi
MOCK
chmod +x "$WORK/bin/docker"
export PATH="$WORK/bin:$PATH"
cd "$WORK"
export MOCK_CONTAINER=project-mongo
bash "$REPO/scripts/backup.sh"
bash "$REPO/scripts/backup.sh"
shopt -s nullglob
archives=(mongo-backups/*.gz)
[ "${#archives[@]}" = 2 ]
MOCK_FAIL=true bash "$REPO/scripts/backup.sh" && exit 93
partial=(mongo-backups/*.partial)
[ "${#partial[@]}" = 0 ]
MOCK_CONTAINER='' bash "$REPO/scripts/backup.sh" && exit 94
MOCK_CONTAINER=$'one\ntwo' bash "$REPO/scripts/backup.sh" && exit 95
PSSID_DB_CONTAINER=explicit EXPECTED_CONTAINER=explicit bash "$REPO/scripts/backup.sh"
bash "$REPO/scripts/restore.sh" "${archives[0]##*/}"
echo 'Database maintenance regression checks passed.'
