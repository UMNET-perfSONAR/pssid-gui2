#!/bin/bash

# Restores MongoDB database from a .gz backup archive
BACKUP_DIR="./mongo-backups"
DB_CONTAINER="pssid-gui2_mongo_1"
DB_NAME="gui"

# Check for backups
BACKUP_FILES=("$BACKUP_DIR"/*.gz)
if [ ${#BACKUP_FILES[@]} -eq 0 ]; then
  echo "❌ No backup files found in $BACKUP_DIR"
  exit 1
fi

# If no argument given, show interactive selection
if [ -z "$1" ]; then
  echo "📦 Available backups:"
  select FILE in "${BACKUP_FILES[@]##*/}"; do
    if [ -n "$FILE" ]; then
      BACKUP_FILE="$FILE"
      break
    else
      echo "❌ Invalid selection. Try again."
    fi
  done
else
  BACKUP_FILE="$1"
fi

# Validate selected file
if [ ! -f "$BACKUP_DIR/$BACKUP_FILE" ]; then
  echo "❌ Backup file not found: $BACKUP_DIR/$BACKUP_FILE"
  exit 1
fi

echo "⚙️  Restoring from backup: $BACKUP_FILE..."

cat "$BACKUP_DIR/$BACKUP_FILE" | docker exec -i "$DB_CONTAINER" mongorestore --archive --gzip --drop --db="$DB_NAME"

if [ $? -eq 0 ]; then
  echo "✅ Restore complete!"
else
  echo "❌ Restore failed."
fi
