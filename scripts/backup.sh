#!/bin/bash
# Backs up the MongoDB 'gui' database as a compressed archive to ./mongo-backups.
#
# Set BACKUP_RETENTION_DAYS=N to prune archives older than N days after a
# successful backup (0 or unset keeps everything). The scheduled nightly backup
# installed by the Ansible role uses this.
set -euo pipefail

TIMESTAMP=$(date +%F-%H-%M)
BACKUP_DIR="./mongo-backups"
DB_NAME="gui"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-0}"

mkdir -p "$BACKUP_DIR"

# Find the running mongo container (works with both compose v1 and v2 names).
DB_CONTAINER="$(docker ps --filter "name=mongo" --format '{{.Names}}' | head -n1)"
if [ -z "$DB_CONTAINER" ]; then
  echo "Could not find a running mongo container." >&2
  exit 1
fi

# Is database authentication enabled? The .env decides; the PASSWORD ITSELF is
# never read here.
#
# It used to be, and was then interpolated into the `docker exec ... sh -c "..."`
# command line below -- which put the MongoDB root password into the argv of a
# process on the host, readable by any local user with `ps aux` for as long as
# the dump ran. The mongo container already holds the same credentials in its own
# environment (docker-compose.yml sets MONGO_INITDB_ROOT_* from this same .env),
# so the script below is SINGLE-quoted and expands them inside the container,
# where /proc/<pid>/environ is not world-readable.
NEEDS_AUTH=false
if [ -f .env ] && grep -q '^MONGO_PASSWORD=.\+' .env; then
  NEEDS_AUTH=true
fi

# "$DB_NAME" is passed as a positional argument (not interpolated) so the
# container script stays single-quoted; a database name is not a secret, but
# keeping one substitution style avoids a quoting mistake later.
docker exec "$DB_CONTAINER" sh -c '
  if [ -n "${MONGO_INITDB_ROOT_PASSWORD:-}" ] && [ "$2" = "true" ]; then
    exec mongodump -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" \
      --authenticationDatabase admin --archive --gzip --db="$1"
  fi
  exec mongodump --archive --gzip --db="$1"
' _ "$DB_NAME" "$NEEDS_AUTH" \
  > "$BACKUP_DIR/backup-$TIMESTAMP.gz"

echo "Backup created: $BACKUP_DIR/backup-$TIMESTAMP.gz"

# Prune old archives only after this backup succeeded.
if [ "$RETENTION_DAYS" -gt 0 ] 2>/dev/null; then
  find "$BACKUP_DIR" -name 'backup-*.gz' -type f -mtime "+$RETENTION_DAYS" -print -delete \
    | sed 's/^/Pruned: /'
fi
