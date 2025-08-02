#!/bin/bash

# Backs up the MongoDB database as a compressed archive (.gz) to host
TIMESTAMP=$(date +%F-%H-%M)
BACKUP_DIR="./mongo-backups"   # Mounted to /data/backups in container
DB_CONTAINER="pssid-gui2_mongo_1"
DB_NAME="gui"

mkdir -p "$BACKUP_DIR"

docker exec "$DB_CONTAINER" \
  sh -c "mongodump --archive --gzip --db=$DB_NAME" \
  > "$BACKUP_DIR/backup-$TIMESTAMP.gz"

if [ $? -eq 0 ]; then
  echo "✅ Backup created: $BACKUP_DIR/backup-$TIMESTAMP.gz"
else
  echo "❌ Backup failed"
fi
