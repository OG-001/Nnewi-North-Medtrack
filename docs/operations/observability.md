# Observability and alerting

**Applies to:** the production stack. Read with
[`backup-and-restore.md`](backup-and-restore.md) and
[`incident-response.md`](incident-response.md).

---

## 1. Health endpoints

| Endpoint                   | Answers                          | Auth |
|----------------------------|----------------------------------|------|
| `/api/v1/system/health`    | Is the process alive             | none |
| `/api/v1/system/ready`     | Should traffic be sent here      | none |
| `/api/v1/system/metrics`   | Operational counters             | admin |
| `/healthz` (web container) | Is nginx serving                 | none |

Liveness and readiness are different questions. A hub whose database is
unreachable is **alive but not ready**: `/ready` returns 503 so the proxy stops
sending it clinic traffic, while the container is left running rather than being
restart-looped.

`/metrics` carries counts only. No patient identifier appears in it, because a
metrics endpoint ends up in dashboards and log stores with looser access control
than the clinical data itself.

## 2. What to alert on

Four things matter enough to wake someone.

### Sync backlog

```
sync.devices_stale_24h > 0
```

A device that has not synced in 24 hours may be recording care that nobody else
can see, and that is not covered by the database backup. Investigate the
facility's connectivity before assuming the device is faulty.

### Backup failure

```
log line matching "ALERT backup failed"
```

The backup sidecar prints this and keeps running rather than exiting, so a
container that dies on one bad night does not stop backing up altogether. Treat
two consecutive failures as urgent: the window of unrecoverable data is growing.

Also alert if **no** backup file has appeared in
`infra/backups/` in 25 hours. A silent absence is the failure mode a
log-based alert misses.

### Unresolved conflicts

```
sync.open_conflicts > 0 for more than 48 hours
```

Every entry is a patient record where two devices disagreed on an
identity-critical field. Clinical work continues on the latest value, so this is
not an emergency, but it is a correctness debt that only a human can settle.

### SMS failures

```
sms.failed_24h > 10
```

Usually a provider credential or balance problem. Note that
`skipped_no_consent_24h` is **not** an alert: it is the consent gate working.
Watch it for a sudden jump, which would suggest consent is not being captured at
registration.

## 3. Logs

Both the API and Caddy log JSON to stdout, so the container runtime collects
them. Ship them to in-country storage with the same retention discipline as the
database.

**Logs are treated as containing personal data.** Access to them is controlled
like access to the clinical store. The API logs a `traceId` rather than
identifying data, and never logs a token, a PIN, or an SMS body next to a
patient identifier.

## 4. What is not built

There is no metrics scraper, dashboard, or alert manager in this repository. The
endpoints and log lines above are the interface a Prometheus, Grafana, or hosted
monitor would consume, and wiring one up is a deployment task rather than a code
change. **Do not describe alerting as live until that is configured**: the
signals exist, the alerting does not.
