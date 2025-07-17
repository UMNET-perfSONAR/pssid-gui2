#!/bin/bash

# backs up the data in the database (as a .gz file)
TIMESTAMP=$(date +%F-%H-%M)
BACKUP_DIR="/data/backups"
DB_CONTAINER="pssid-gui2_mongo_1"
DB_NAME="pssid_db"

mkdir -p $BACKUP_DIR
docker exec $DB_CONTAINER mongodump --archive --gzip --db=$DB_NAME > $BACKUP_DIR/backup-$TIMESTAMP.gz
