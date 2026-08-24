#!/bin/sh
# Restore an encrypted PHC-Track backup.
#
#   BACKUP_PASSPHRASE=... ./restore.sh <backup-file> [target_database]
#
# This OVERWRITES the target database. It refuses to run against the configured
# production database unless PHC_CONFIRM_RESTORE=yes is set, because the usual
# reason to restore is that something has already gone wrong and a second
# mistake is expensive.
set -eu

BACKUP_FILE="${1:?usage: restore.sh <backup-file> [target_database]}"
TARGET_DB="${2:-${PGDATABASE:?PGDATABASE or a target database is required}}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is required}"

[ -f "$BACKUP_FILE" ] || { echo "[restore] no such file: $BACKUP_FILE" >&2; exit 1; }

if [ "$TARGET_DB" = "${PGDATABASE:-}" ] && [ "${PHC_CONFIRM_RESTORE:-}" != "yes" ]; then
  echo "[restore] REFUSING: '$TARGET_DB' is the configured live database." >&2
  echo "[restore] Rehearse into a scratch database, or set PHC_CONFIRM_RESTORE=yes." >&2
  exit 2
fi

echo "[restore] decrypting $BACKUP_FILE into $TARGET_DB"

# Verify the passphrase and the archive before touching the target database.
if ! openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE \
     -in "$BACKUP_FILE" | gzip -t 2>/dev/null; then
  echo "[restore] FAILED: wrong passphrase or corrupt archive. Target untouched." >&2
  exit 1
fi

psql --dbname=postgres -v ON_ERROR_STOP=1 -c "SELECT 1 FROM pg_database WHERE datname = '$TARGET_DB'" \
  | grep -q 1 || psql --dbname=postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$TARGET_DB\""

openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$BACKUP_FILE" \
  | gunzip \
  | psql --dbname="$TARGET_DB" -v ON_ERROR_STOP=1 --quiet

echo "[restore] restored into $TARGET_DB"
echo "[restore] now verify: row counts, the newest audit_event, and a sign-in."
