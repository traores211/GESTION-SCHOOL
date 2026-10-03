#!/bin/sh
# Restores a backup made by backup.sh.
#   restore.sh <STAMP|latest> [--files]
# The database named by PGDATABASE is REPLACED (objects dropped then recreated): stop the API first.
# With --files, /data/uploads is replaced by the archived files as well.
set -eu
: "${PGHOST:=postgres}" "${PGUSER:?}" "${PGDATABASE:?}" "${BACKUP_PASSPHRASE:?}"
DIR=${BACKUP_DIR:-/backups}
STAMP=${1:-latest}
if [ "$STAMP" = "latest" ]; then
  STAMP=$(ls -1 "$DIR"/db-*.dump.enc 2>/dev/null | sed 's/.*db-\(.*\)\.dump\.enc/\1/' | sort | tail -1)
fi
[ -n "$STAMP" ] || { echo "Aucune sauvegarde trouvée dans $DIR" >&2; exit 1; }

( cd "$DIR" && sha256sum -c "sums-$STAMP.sha256" )
decrypt() { openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE; }

echo "Restauration de la base depuis db-$STAMP…"
decrypt < "$DIR/db-$STAMP.dump.enc" | pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$PGDATABASE"

if [ "${2:-}" = "--files" ] && [ -f "$DIR/files-$STAMP.tar.gz.enc" ]; then
  echo "Restauration des fichiers…"
  rm -rf /data/uploads.restore && mkdir -p /data/uploads.restore
  decrypt < "$DIR/files-$STAMP.tar.gz.enc" | tar -C /data/uploads.restore -xzf -
  rm -rf /data/uploads.old && mv /data/uploads /data/uploads.old 2>/dev/null || true
  mv /data/uploads.restore/uploads /data/uploads && rm -rf /data/uploads.restore
fi
echo "Restauration $STAMP terminée."
