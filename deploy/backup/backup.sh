#!/bin/sh
# Encrypted backup of the database and the uploaded files (scanned documents, images).
#   - PostgreSQL: pg_dump custom format, AES-256 encrypted with BACKUP_PASSPHRASE
#   - Files: tar.gz of /data/uploads, encrypted the same way
#   - Retention: BACKUP_RETENTION_DAYS (default 30)
#   - Off-site copy: if RCLONE_REMOTE is set (e.g. "s3:school-erp-backups"), files are copied there
# Writes /backups/last-success on success (watched by monitoring) and exits non-zero on failure.
set -eu

: "${PGHOST:=postgres}" "${PGUSER:?PGUSER requis}" "${PGDATABASE:?PGDATABASE requis}" "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE requis}"
DIR=${BACKUP_DIR:-/backups}
KEEP=${BACKUP_RETENTION_DAYS:-30}
STAMP=$(date -u +%Y%m%d-%H%M%S)
mkdir -p "$DIR"

encrypt() { openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE; }

echo "[$(date -u +%FT%TZ)] database dump…"
pg_dump --format=custom --no-owner --no-privileges | encrypt > "$DIR/db-$STAMP.dump.enc.part"
mv "$DIR/db-$STAMP.dump.enc.part" "$DIR/db-$STAMP.dump.enc"

if [ -d /data/uploads ]; then
  echo "[$(date -u +%FT%TZ)] uploaded files…"
  tar -C /data -czf - uploads | encrypt > "$DIR/files-$STAMP.tar.gz.enc.part"
  mv "$DIR/files-$STAMP.tar.gz.enc.part" "$DIR/files-$STAMP.tar.gz.enc"
fi

# Checksums let the restore detect a truncated or corrupted file.
( cd "$DIR" && sha256sum "db-$STAMP.dump.enc" $( [ -f "files-$STAMP.tar.gz.enc" ] && echo "files-$STAMP.tar.gz.enc" ) > "sums-$STAMP.sha256" )

find "$DIR" -maxdepth 1 -type f \( -name 'db-*' -o -name 'files-*' -o -name 'sums-*' \) -mtime +"$KEEP" -delete

if [ -n "${RCLONE_REMOTE:-}" ]; then
  echo "[$(date -u +%FT%TZ)] off-site copy to $RCLONE_REMOTE…"
  rclone copy "$DIR" "$RCLONE_REMOTE" --include "*-$STAMP.*" --include "sums-$STAMP.sha256"
fi

date -u +%FT%TZ > "$DIR/last-success"
echo "[$(date -u +%FT%TZ)] backup $STAMP done ($(du -ch "$DIR"/*-"$STAMP".* | tail -1 | cut -f1))"
