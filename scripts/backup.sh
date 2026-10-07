#!/bin/bash
# Backs up the MongoDB 'gui' database as a compressed archive to ./mongo-backups.
#
# Set BACKUP_RETENTION_DAYS=N to prune archives older than N days after a
# successful backup (0 or unset keeps everything). The scheduled nightly backup
# installed by the Ansible role uses this.
set -euo pipefail

# To the second: two backups in the same minute (make upgrade, then a manual
# `make backup`) used to share a name, and the second silently replaced the first.
TIMESTAMP=$(date +%F-%H-%M-%S)
BACKUP_DIR="./mongo-backups"
DB_NAME="gui"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-0}"

mkdir -p "$BACKUP_DIR"

# shellcheck source=lib/database-container.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/database-container.sh"
DB_CONTAINER="$(resolve_database_container)"

# Authentication is taken from the selected container; credentials never need
# to be read from a different project's .env on the host.
#
# It used to be, and was then interpolated into the `docker exec ... sh -c "..."`
# command line below -- which put the MongoDB root password into the argv of a
# process on the host, readable by any local user with `ps aux` for as long as
# the dump ran. The mongo container already holds the same credentials in its own
# environment (docker-compose.yml sets MONGO_INITDB_ROOT_* from this same .env),
# so the script below is SINGLE-quoted and expands them inside the container,
# where /proc/<pid>/environ is not world-readable.
BACKUP_FILE="$(mktemp "$BACKUP_DIR/backup-$TIMESTAMP-XXXXXX.gz.partial")"
trap 'rm -f -- "$BACKUP_FILE"' EXIT

# Publish the archive only after mongodump succeeds. The unique suffix also
# prevents concurrent backups within one second from overwriting each other.
# "$DB_NAME" is passed as a positional argument (not interpolated) so the
# container script stays single-quoted; a database name is not a secret, but
# keeping one substitution style avoids a quoting mistake later.
docker exec "$DB_CONTAINER" sh -c '
  if [ -n "${MONGO_INITDB_ROOT_PASSWORD:-}" ]; then
    exec mongodump -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" \
      --authenticationDatabase admin --archive --gzip --db="$1"
  fi
  exec mongodump --archive --gzip --db="$1"
' _ "$DB_NAME" > "$BACKUP_FILE"
mv -- "$BACKUP_FILE" "${BACKUP_FILE%.partial}"

echo "Backup created: ${BACKUP_FILE%.partial}"

# Prune old archives only after this backup succeeded.
if [ "$RETENTION_DAYS" -gt 0 ] 2>/dev/null; then
  find "$BACKUP_DIR" -name 'backup-*.gz' -type f -mtime "+$RETENTION_DAYS" -print -delete \
    | sed 's/^/Pruned: /'
fi
