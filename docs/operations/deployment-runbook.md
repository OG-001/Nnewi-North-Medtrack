# Deployment and rollback runbook

**Applies to:** `infra/docker-compose.prod.yml`.

> Phase 10 is a production release touching real patient data. Every command
> here is confirmation-required: the owner approves each one, for that exact
> command, at the time it is run.

---

## 1. Before the first deployment

Do not start until all of these are true.

| Check | Why |
|-------|-----|
| ~~Hosting target chosen~~ | **Decided: Nigerian VPS.** See below (Q6) |
| ~~Controller and DPO named~~ | **Decided: Ogechukwu Eleodimuo**, in `infra/.env` (Q9) |
| ~~Retention policy set~~ | **Decided**, in `infra/.env` (Q7) |
| ~~DPA with the SMS provider~~ | **Not needed: SMS is switched off** |
| `PHC_DPO_CONTACT` set to a monitored address | A data subject has to be able to reach the DPO |
| Immunization schedule verified vs NPHCDA | Children are scheduled against it (Q2) |
| Igbo SMS templates reviewed by a native speaker | Patients read them |
| `infra/.env` filled, every REQUIRED value set | The stack refuses to start otherwise |
| `bash infra/scripts/secret-scan.sh` clean | No credential in the repo |
| DNS points at the host | Caddy needs it to obtain a certificate |

### Hosting: a Nigerian VPS, not on-premises at the LGA

Decided 2026-09-23, resolving Q6.

The PHCs reach the hub over the internet either way, so putting the hardware at
the LGA office buys them no connectivity. What it does buy is grid power,
hardware failure, physical security and patching, landing on an office with no
dedicated IT staff. The system is offline-first, so hub downtime delays sync
rather than stopping care, which further weakens the case for local custody.

Requirements for the VPS:

- **Hosted in Nigeria.** Data residency is a locked decision and it covers
  backups.
- **4 GB memory and 4 vCPU minimum.** The container limits total about 2.7 GB
  and 3 CPUs. 8 GB is comfortable.
- **Encrypted disk.** Encryption at rest is the host's responsibility, not the
  application's.
- **Snapshots**, which are not a substitute for the encrypted logical backups.
- **Separate backup storage, also in Nigeria**, reachable over SSH.

Revisit only if the LGA requires physical custody of the hardware as policy.

## 2. Deploy

```bash
mkdir -p infra/backups && sudo chown 70:70 infra/backups

docker compose -f infra/docker-compose.prod.yml --env-file infra/.env build
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env up -d

docker compose -f infra/docker-compose.prod.yml ps
curl -fsS https://$PHC_DOMAIN/api/v1/system/health
curl -fsS https://$PHC_DOMAIN/api/v1/system/ready
```

Database migrations run automatically on API start, via `prisma migrate deploy`,
which only applies committed migrations and never generates or resets one.

### Seeding the facility registry

On a **new** database only:

```bash
docker compose -f infra/docker-compose.prod.yml exec api \
  sh -c "cd apps/api && npx prisma db seed"
```

The seed creates the 76 LGA facilities and the demo staff accounts. **Remove or
re-credential the demo accounts before real patients are registered.** Their PINs
are published in `RUNNING.md`.

## 3. Verify after deploying

1. TLS: the certificate is valid and HSTS is present.
   `curl -sI https://$PHC_DOMAIN | grep -i strict-transport-security`
2. The database is not reachable from outside: `nc -zv $PHC_DOMAIN 5432` must
   fail. It publishes no host port.
3. Sign in through the PWA at a real facility.
4. Register a test patient offline, reconnect, confirm it reaches the hub.
5. Confirm a backup file appears within the interval.

## 4. Upgrading

```bash
# 1. Back up first, and verify the file exists.
docker compose -f infra/docker-compose.prod.yml exec backup /scripts/backup.sh /backups

# 2. Note the current image, so a rollback has a target.
docker compose -f infra/docker-compose.prod.yml images

# 3. Build and restart.
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env up -d --build

# 4. Verify, per section 3.
```

## 5. Rollback

**Code only**, where the database schema did not change:

```bash
git checkout <previous-tag>
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env up -d --build
```

**Code and schema**, where a migration ran:

1. Stop the API: `docker compose ... stop api`.
2. Restore the pre-upgrade backup, per
   [`backup-and-restore.md`](backup-and-restore.md) section 4.
3. Check out the previous tag and rebuild.
4. Verify, per section 3.
5. Tell the facilities what window of data was rolled back. Devices still
   holding those rows will re-push them on the next sync.

> A Prisma migration has no automatic down-migration here. **The rollback path
> for a schema change is restore-from-backup**, which is why the backup in step
> 4.1 is not optional.

## 6. Pilot rollout

Per the master plan, one or two PHCs first, then the LGA.

1. Deploy, and verify.
2. **Capture the success-metric baselines before the system changes anything.**
   Master plan section 6. Once staff start using it, the paper baseline is gone.
3. Train the pilot staff. Keep paper running in parallel throughout.
4. Reconcile digital records against the paper register daily for the first
   week. Any row on paper and absent digitally is an incident to investigate,
   not a statistic.
5. Monitor the four alerts in [`observability.md`](observability.md).
6. Review with the owner, then decide on LGA-wide rollout.

## 7. Commands that need explicit approval, every time

| Command | Consequence |
|---------|-------------|
| `docker compose down -v` | Destroys the `pgdata` volume. All hub data. |
| `docker system prune` | Removes images and volumes |
| `prisma migrate reset` | Drops and recreates the schema |
| `restore.sh` with `PHC_CONFIRM_RESTORE=yes` | Overwrites the live database |
| Rotating `JWT_SECRET` | Signs everyone out |
| Setting `SMS_ENABLED=true` | Sends real messages to real patients, and bills for them. Needs a provider agreement and consent collection first. |
