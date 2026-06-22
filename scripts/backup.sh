#!/bin/bash
# Backs up the MongoDB 'gui' database as a compressed archive to ./mongo-backups.
set -euo pipefail

TIMESTAMP=$(date +%F-%H-%M)
BACKUP_DIR="./mongo-backups"
DB_NAME="gui"

mkdir -p "$BACKUP_DIR"

# Find the running mongo container (works with both compose v1 and v2 names).
DB_CONTAINER="$(docker ps --filter "name=mongo" --format '{{.Names}}' | head -n1)"
if [ -z "$DB_CONTAINER" ]; then
  echo "Could not find a running mongo container." >&2
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

docker exec "$DB_CONTAINER" sh -c "mongodump $AUTH --archive --gzip --db=$DB_NAME" \
  > "$BACKUP_DIR/backup-$TIMESTAMP.gz"

echo "Backup created: $BACKUP_DIR/backup-$TIMESTAMP.gz"
