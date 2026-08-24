# Backup and restore runbook

**Applies to:** the production stack in `infra/docker-compose.prod.yml`.

> A backup that has never been restored is a guess, not a backup. Rehearse the
> restore on a schedule, not only when something has already gone wrong.

---

## 1. What is backed up

A logical dump of the whole PHC-Track database: facilities, staff accounts,
every synced clinical row, the change ledger, monthly reports, the SMS send log,
and the audit trail.

Backups are **encrypted before they are written**, with AES-256 and a passphrase
from `BACKUP_PASSPHRASE`. Patient health data is sensitive personal data under
the NDPA 2023, so an unencrypted dump must never exist on disk.

**Not covered by this:** the clinical data still sitting on a device that has not
synced. That is protected by the device's own store, not by this backup, which is
one reason the sync-backlog alert in [`observability.md`](observability.md)
matters.

## 2. How it runs

The `backup` service runs `infra/scripts/backup.sh` every
`BACKUP_INTERVAL_SECONDS` (default 24 hours) and writes to `infra/backups/`.

Each run does the following, and abandons the attempt if any step fails:

1. `pg_dump` to a temporary file, checking the exit status. A dump is never
   piped straight into compression: in a pipeline the exit status is the last
   command's, so a failed dump would produce a valid encrypted archive of
   nothing.
2. Refuses to store a dump smaller than 1 KB.
3. Compresses and encrypts.
4. **Decrypts the result and verifies it**, before keeping it.
5. Moves it to its final name only once verified, so a partial file is never
   mistaken for a usable backup.

### First-time setup

The sidecar runs as uid 70. Create the directory and give it ownership, or every
backup fails on permissions:

```bash
mkdir -p infra/backups && sudo chown 70:70 infra/backups
```

## 3. Off-host copy (required)

Backups on the same host as the database do not survive the loss of the host.
Ship them to separate storage **inside Nigeria** (NDPA data residency). For
example, hourly:

```bash
rsync -az --remove-source-files \
  infra/backups/ backup-user@backup-host.ng:/srv/phc-track-backups/
```

`BACKUP_PASSPHRASE` must **not** travel with the backups. Keep it in the secret
manager. An encrypted backup with its passphrase beside it is not encrypted in
any way that matters.

## 4. Restoring

```bash
BACKUP_PASSPHRASE='...' infra/scripts/restore.sh <backup-file> [target_database]
```

The script refuses to overwrite the configured live database unless
`PHC_CONFIRM_RESTORE=yes` is set, and it verifies the passphrase and the archive
**before** touching the target. The usual reason to restore is that something has
already gone wrong, and a second mistake at that moment is expensive.

### Restoring into the live database

1. Stop the API so nothing writes during the restore:
   `docker compose -f infra/docker-compose.prod.yml stop api`
2. Restore with `PHC_CONFIRM_RESTORE=yes`.
3. Start the API. Migrations run on start and are idempotent.
4. Verify, per section 5.
5. **Tell the facilities.** Any change made after the backup's timestamp is
   gone from the hub. Devices still holding those rows in their outbox will
   re-push them on the next sync, which is the offline design working as
   intended, but a device that had already been acknowledged will not.

## 5. Verifying a restore

Compare the restored copy against what you expect:

```sql
SELECT count(*) FROM facility;         -- 76 for the full LGA registry
SELECT count(*) FROM synced_entity;
SELECT count(*) FROM change_log;
SELECT max(at) FROM audit_event;       -- how recent the restored state is
```

Then sign in through the PWA as a demo account and open a patient record. A row
count proves the data landed; a sign-in proves the system works.

## 6. Rehearsal record

| Date       | Restored from     | Into                     | Result |
|------------|-------------------|--------------------------|--------|
| 2026-08-24 | Encrypted `pg_dump` of the development database | `phc_restore_rehearsal` | Passed |

The 2026-08-24 rehearsal verified all seven tables matched the source exactly
(facility 76, app_user 12, synced_entity 4285, change_log 4346, monthly_report 5,
sms_message 36, audit_event 237), and confirmed that the script refuses a live
target without confirmation and rejects a wrong passphrase without touching the
target.

**This rehearsal used development data on a development host.** A production
rehearsal against the real deployment is still required before go-live, and it is
a Phase 10 exit criterion.
