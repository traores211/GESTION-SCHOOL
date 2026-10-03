#!/bin/sh
# Restore test: the latest backup is restored into a throw-away database, then checked (tables and
# row counts). Run monthly by cron; a failure exits non-zero and leaves /backups/last-verify untouched.
set -eu
: "${PGHOST:=postgres}" "${PGUSER:?}" "${PGDATABASE:?}" "${BACKUP_PASSPHRASE:?}"
DIR=${BACKUP_DIR:-/backups}
TEST_DB="restore_check_$(date -u +%Y%m%d%H%M%S)"
STAMP=$(ls -1 "$DIR"/db-*.dump.enc | sed 's/.*db-\(.*\)\.dump\.enc/\1/' | sort | tail -1)

cleanup() { dropdb --if-exists "$TEST_DB" >/dev/null 2>&1 || true; }
trap cleanup EXIT

( cd "$DIR" && sha256sum -c "sums-$STAMP.sha256" )
createdb "$TEST_DB"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE < "$DIR/db-$STAMP.dump.enc" \
  | pg_restore --no-owner --no-privileges --dbname="$TEST_DB"

SCHOOLS=$(psql -d "$TEST_DB" -tAc 'select count(*) from "School"')
STUDENTS=$(psql -d "$TEST_DB" -tAc 'select count(*) from "Student"')
LIVE=$(psql -d "$PGDATABASE" -tAc 'select count(*) from "Student"')
echo "Sauvegarde $STAMP : $SCHOOLS établissement(s), $STUDENTS élève(s) (base en service : $LIVE)"
[ "$SCHOOLS" -gt 0 ] || { echo "Sauvegarde vide ou illisible" >&2; exit 1; }

date -u +%FT%TZ > "$DIR/last-verify"
echo "Test de restauration réussi."
