#!/bin/bash
# Restores the MongoDB 'gui' database from a .gz archive in ./mongo-backups.
set -euo pipefail

BACKUP_DIR="./mongo-backups"
DB_NAME="gui"

# shellcheck source=lib/database-container.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/database-container.sh"
DB_CONTAINER="$(resolve_database_container)"

# Check for backups.
shopt -s nullglob
BACKUP_FILES=("$BACKUP_DIR"/*.gz)
if [ ${#BACKUP_FILES[@]} -eq 0 ]; then
  echo "No backup files found in $BACKUP_DIR" >&2
  exit 1
fi

# If no argument is given, show an interactive selection.
if [ -z "${1:-}" ]; then
  echo "Available backups:"
  select FILE in "${BACKUP_FILES[@]##*/}"; do
    if [ -n "$FILE" ]; then
      BACKUP_FILE="$FILE"
      break
    else
      echo "Invalid selection. Try again."
    fi
  done
else
  BACKUP_FILE="$1"
fi

if [ ! -f "$BACKUP_DIR/$BACKUP_FILE" ]; then
  echo "Backup file not found: $BACKUP_DIR/$BACKUP_FILE" >&2
  exit 1
fi

# Authentication comes from the selected container, not the host .env.
# The password is never read here -- see scripts/backup.sh. Interpolating it into the
# command line below published the MongoDB root password to every local user via
# `ps aux`; the container already has the same credentials in its environment.

echo "Restoring from backup: $BACKUP_FILE"
cat "$BACKUP_DIR/$BACKUP_FILE" \
  | docker exec -i "$DB_CONTAINER" sh -c '
      if [ -n "${MONGO_INITDB_ROOT_PASSWORD:-}" ]; then
        exec mongorestore -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" \
          --authenticationDatabase admin --archive --gzip --drop --db="$1"
      fi
      exec mongorestore --archive --gzip --drop --db="$1"
    ' _ "$DB_NAME"

echo "Restore complete."
