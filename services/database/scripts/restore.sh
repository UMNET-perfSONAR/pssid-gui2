#!/bin/bash

BACKUP_DIR="/data/backups"
DB_CONTAINER="pssid-gui2_mongo_1"

# List available backups
echo "Available backups:"
select BACKUP_FILE in "$BACKUP_DIR"/*.gz; do
  if [[ -n "$BACKUP_FILE" && -f "$BACKUP_FILE" ]]; then
    echo "You selected: $BACKUP_FILE"
    break
  else
    echo "Invalid selection. Try again."
  fi
done

# Confirm restore
read -p "Are you sure you want to restore this backup? This will DROP the current database. (y/n): " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo "Restore cancelled."
  exit 0
fi

# Perform restore
cat "$BACKUP_FILE" | docker exec -i $DB_CONTAINER mongorestore --archive --gzip --drop

echo "✅ Restore complete."
