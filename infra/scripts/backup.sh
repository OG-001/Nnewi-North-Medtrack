#!/bin/sh
# Encrypted logical backup of the PHC-Track database.
#
# Patient health data is sensitive personal data under the NDPA 2023, so a
# backup is encrypted before it is written, never after. The passphrase comes
# from the environment and is never stored beside the backup.
#
#   BACKUP_PASSPHRASE=... ./backup.sh [output_dir]
#
# Restore with restore.sh. A backup that has never been restored is a guess,
# not a backup: rehearse it (docs/operations/backup-and-restore.md).
set -eu

OUT_DIR="${1:-/backups}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is required}"
: "${PGDATABASE:?PGDATABASE is required}"

mkdir -p "$OUT_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET="$OUT_DIR/phc-track-${STAMP}.sql.gz.enc"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

echo "[backup] dumping ${PGDATABASE} at ${STAMP}"

RAW="$(mktemp)"
trap 'rm -f "$TMP" "$RAW"' EXIT

# Dump to a file first rather than piping straight into gzip and openssl. In a
# pipeline the exit status is the LAST command's, so a pg_dump failure would be
# masked and we would write a perfectly valid encrypted archive of nothing.
# --clean --if-exists so the dump can be restored over an existing database.
if ! pg_dump --no-owner --no-privileges --clean --if-exists > "$RAW"; then
  echo "[backup] FAILED: pg_dump did not succeed" >&2
  exit 1
fi

RAW_SIZE="$(wc -c < "$RAW")"
if [ "$RAW_SIZE" -lt 1024 ]; then
  echo "[backup] FAILED: dump is only ${RAW_SIZE} bytes, refusing to store it" >&2
  exit 1
fi

if ! gzip -9 -c "$RAW" \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE \
  > "$TMP"; then
  echo "[backup] FAILED: compression or encryption did not succeed" >&2
  exit 1
fi

# Prove the archive decrypts before it is kept. An encrypted backup nobody can
# open is worse than none, because it is trusted.
if ! openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE \
     -in "$TMP" | gzip -t 2>/dev/null; then
  echo "[backup] FAILED: verification of the encrypted archive did not pass" >&2
  exit 1
fi

# Moved to its final name only once complete and verified, so a partial file is
# never mistaken for a usable backup.
mv "$TMP" "$TARGET"
rm -f "$RAW"
trap - EXIT
chmod 600 "$TARGET"

SIZE="$(wc -c < "$TARGET")"
echo "[backup] wrote ${TARGET} (${SIZE} bytes, from ${RAW_SIZE} bytes of SQL)"

# Retention. Clinical retention policy is a separate question (Q7); this only
# prunes local copies once they are off-host.
RETENTION="${BACKUP_RETENTION_DAYS:-30}"
find "$OUT_DIR" -name 'phc-track-*.sql.gz.enc' -type f -mtime "+${RETENTION}" -print -delete 2>/dev/null || true

echo "[backup] done"
