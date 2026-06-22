#!/bin/bash
# Restores the MongoDB 'gui' database from a .gz archive in ./mongo-backups.
set -euo pipefail

BACKUP_DIR="./mongo-backups"
DB_NAME="gui"

# Find the running mongo container (works with both compose v1 and v2 names).
DB_CONTAINER="$(docker ps --filter "name=mongo" --format '{{.Names}}' | head -n1)"
if [ -z "$DB_CONTAINER" ]; then
  echo "Could not find a running mongo container." >&2
  exit 1
fi

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

# Use credentials from .env when database authentication is enabled.
AUTH=""
if [ -f .env ] && grep -q '^MONGO_PASSWORD=' .env; then
  MONGO_USERNAME="$(sed -n 's/^MONGO_USERNAME=//p' .env)"
  MONGO_PASSWORD="$(sed -n 's/^MONGO_PASSWORD=//p' .env)"
  if [ -n "$MONGO_PASSWORD" ]; then
    AUTH="-u $MONGO_USERNAME -p $MONGO_PASSWORD --authenticationDatabase admin"
  fi
fi

echo "Restoring from backup: $BACKUP_FILE"
cat "$BACKUP_DIR/$BACKUP_FILE" \
  | docker exec -i "$DB_CONTAINER" sh -c "mongorestore $AUTH --archive --gzip --drop --db=$DB_NAME"

echo "Restore complete."
