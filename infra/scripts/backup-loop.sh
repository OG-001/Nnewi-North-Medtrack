#!/bin/sh
# Backup sidecar: runs backup.sh on an interval.
#
# A failure is loud on stdout so the log-based alert in
# docs/operations/observability.md fires. It does NOT exit, because a container
# that dies on one bad night stops backing up altogether.
set -eu
INTERVAL="${BACKUP_INTERVAL_SECONDS:-86400}"
echo "[backup-loop] every ${INTERVAL}s"
while true; do
  if /scripts/backup.sh /backups; then
    echo "[backup-loop] ok"
  else
    echo "[backup-loop] ALERT backup failed" >&2
  fi
  sleep "$INTERVAL"
done
