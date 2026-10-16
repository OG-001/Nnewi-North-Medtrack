# Backup and restore runbook

> A backup that has never been restored is a guess, not a backup. Rehearse the
> restore on a schedule, not only when something has already gone wrong.

## Which model applies to you

There are two deployment models and they need different backup designs. Read the
right one.

| Model                                 | Backups covered by |
|---------------------------------------|--------------------|
| Self-hosted, `infra/docker-compose.prod.yml` | Sections 1 to 6, below |
| Managed Postgres, Cloudflare Containers      | Section 0, immediately below |

---

## 0. Managed Postgres and Cloudflare Containers

**Status: proposed, not implemented, and not rehearsed.** This section exists for review.
Nothing described here has been built, and the rehearsal record in section 6 covers only
the self-hosted design.

### Why the existing design cannot be carried over

The sidecar in sections 1 to 6 runs `pg_dump` inside a container and writes the encrypted
file to a mounted volume. On Cloudflare Containers both halves of that fail:

- **There is no durable disk.** Cloudflare states that a container's local disk is
  temporary working space and that data on it can be lost when the container stops or
  restarts. An encrypted dump written there is discarded, and a backup that silently
  vanishes is worse than none, because the logs will say it succeeded.
- **The container is not always on.** It wakes on request and sleeps when idle, so a
  fixed interval inside the process does not fire on a schedule.

### What the provider gives you, and what it does not

A managed Postgres offers point-in-time recovery within a retention window, and on Neon,
branching, which makes spinning up a copy to test a restore genuinely cheap.

That covers operational accidents: a bad migration, a mistaken bulk update, a dropped
table. It is the right first layer and you should rely on it for those.

It is **not** an off-host backup, and section 3 of this runbook requires one. The provider's
recovery data lives inside the same account as the database. One compromised credential,
one billing lapse, one account closure and both are gone together. It is also outside your
control for retention: the window is whatever the plan says, not whatever the NDPA storage
limitation obliges you to keep.

### So: two layers

| Layer | Purpose | Mechanism |
|-------|---------|-----------|
| Operational recovery | Bad migration, wrong delete | Provider point-in-time recovery |
| Independent custody | Vendor loss, account loss, retention | Encrypted `pg_dump` held elsewhere |

The second layer is the one that needs building.

### Where the second layer should run

It needs somewhere always-on that can hold a credential and run a binary. Three options
were considered.

**A small always-on VM, reusing `infra/scripts/backup.sh`. Recommended.** The script is
already written, already encrypts before writing, already checks `pg_dump`'s exit status
rather than trusting a pipeline, and has been rehearsed once. Pointing it at a remote
database over TLS is a small change to a known-good script. That is worth far more than a
new mechanism, and it keeps the restore procedure in sections 4 and 5 valid.

**A scheduled Cloudflare Container streaming to object storage.** Technically viable if the
dump is streamed to object storage and never touches disk. Rejected for now: it introduces
a second deployment unit to maintain and gains nothing over the VM, while the whole
pipeline would be new and unrehearsed.

**A scheduled CI job.** Rejected on compliance grounds, not convenience. It would route the
entire patient database through a third party's build runners and require the database
credential and backup passphrase to be held there. That adds a processor and probably a
jurisdiction, for a saving of a few dollars a month.

### Changes required

1. `infra/scripts/backup.sh` connects to the local container. It needs to take a DSN and
   require TLS, so it can reach the managed endpoint.
2. It must use the **direct** endpoint, not the pooled one. `pg_dump` holds a session-level
   connection, which a transaction-mode pooler will not carry.
3. Off-host copy per section 3 still applies, and now matters more: the dump and the
   database must not share a vendor account.
4. `BACKUP_PASSPHRASE` moves to wherever the job runs. Rotating it makes every existing
   archive unreadable, so it is held, not regenerated.
5. **Rehearse before go-live.** Section 6's record is for the self-hosted design and does
   not transfer. Until a restore from this pipeline has been completed and verified, treat
   the deployment as having no backup.

### What remains uncovered either way

Clinical data on a device that has not synced is not in any backup, because it has never
reached the hub. That is unchanged by the move and is why the sync-backlog alert in
[`observability.md`](observability.md) matters.

---

## Sections 1 to 6: the self-hosted model

**Applies to:** the production stack in `infra/docker-compose.prod.yml`.

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
