# Phase 10: deployment and hardening (engineering deliverables)

| Field  | Value                                  |
|--------|----------------------------------------|
| Date   | 2026-08-24                             |
| Time   | 15:52 WAT                              |
| Author | Implementation                         |
| Phase  | 10, Deployment, hardening and rollout  |
| Module | n/a, cross-cutting                     |

## Summary

Phase 10 is the production release. It splits into engineering work that can be
built and verified here, and release actions that require a real environment, a
real device, and named people.

**This entry covers the engineering half. The release did not happen and Phase 10
is not complete.** Section "What this does not do" is the important part of this
record.

What shipped:

- **Production stack** (`infra/docker-compose.prod.yml`): Caddy terminating TLS
  with automatic certificates, the API served **same-origin** under `/api`,
  resource limits, restart policies, and healthchecks. Postgres and Redis
  publish **no host ports**: they are reachable only on the internal network.
  Every secret is required with no default, so the stack refuses to start rather
  than coming up insecure.
- **Hardened images**: both containers run as non-root, the web image on
  `nginx-unprivileged` with a read-only filesystem.
- **Security headers**: full CSP, HSTS, frame and referrer policy on the PWA;
  a deny-all CSP, `no-store` and `nosniff` on API responses.
- **Request limits**: a 2 MB body cap, and body-parser failures now map to
  proper status codes rather than 500.
- **Encrypted backups with a rehearsed restore**, plus retention and an
  off-host procedure.
- **Observability**: readiness separated from liveness, and an operational
  metrics endpoint carrying counts only, no patient identifier.
- **Dependency scan and triage**: 20 advisories down to 4.
- **Secret scanner** over tracked files, for CI and pre-release.
- **Runbooks**: deployment and rollback, backup and restore, incident and breach
  response, observability, records of processing, and a per-role UAT script.

## Decisions taken

1. **The API is same-origin under `/api` in production.** The PWA then makes no
   cross-origin request at all: CORS is unused, and `connect-src 'self'` is a
   materially tighter CSP than a split origin would allow.

2. **The stack refuses to start without secrets.** Every required variable uses
   `${VAR:?message}` rather than a default. A deployment that silently comes up
   with a development JWT secret is worse than one that fails loudly.

3. **A backup verifies itself before it is kept.** It decrypts the archive and
   tests the gzip stream, then moves it into place. An encrypted backup nobody
   can open is worse than no backup, because it is trusted.

4. **Restore refuses the live database by default.** The usual reason to restore
   is that something has already gone wrong, and a second mistake at that moment
   is expensive. Overwriting production needs `PHC_CONFIRM_RESTORE=yes`.

5. **Transitive advisories were pinned rather than majors upgraded.** `pnpm`
   overrides patch `body-parser`, `qs`, `js-yaml`, `lodash`, `file-type` and
   `multer` without moving our direct majors. Upgrading NestJS 10 to 11 and
   React Router 6 to 7 in a hardening pass, unprompted, would risk more than it
   fixes.

## Two defects found while building this

**The backup sidecar could never have encrypted anything.** The compose file used
`postgres:16-alpine`, which does not ship `openssl`. It was caught by actually
running the backup rather than by reading the script. `infra/Dockerfile.backup`
now adds it, and exists solely for that reason.

**A failed `pg_dump` would have produced a valid encrypted archive of nothing.**
The original script piped `pg_dump | gzip | openssl`, and in a shell pipeline the
exit status is the **last** command's. A dump failure was therefore invisible,
and the result was a well-formed backup file containing no data. The script now
dumps to a file, checks the status, refuses anything under 1 KB, and verifies
the archive decrypts before keeping it.

Both are the kind of fault that stays hidden until the day someone needs the
backup.

## Dependency triage

| Before | After |
|--------|-------|
| 7 high, 12 moderate, 1 low | 0 high, 4 moderate, 0 low |

The four that remain need a major upgrade and are recorded, not ignored:

| Advisory | Assessment |
|----------|------------|
| `@nestjs/core`, patched in 11.1.18 | Needs NestJS 10 to 11. Scheduled, not urgent. |
| `react-router` open redirect, patched in 7.18.0 | Needs React Router 6 to 7. Reachability is low: the app navigates only to internal paths built from its own record ids, never from user input. |
| `react-router` constructor injection | Same upgrade, same reachability. |
| `react-router-dom` open redirect to XSS | Same upgrade. |

The seven high-severity findings were all in `multer`, `lodash` and `js-yaml`.
The `multer` ones were additionally unreachable: the API has **no file-upload
endpoint**. They are fixed regardless.

## What this does NOT do

This is the part that matters, and it is why Phase 10 is not signed off.

**Not done, because no production environment exists here:**

- No deployment. Nothing was pushed, no image published, no certificate issued.
- The restore rehearsal used **development data on a development host**. A
  production rehearsal against the real deployment is still required, and it is
  an exit criterion.
- No performance or offline verification on **real low-end Android devices** at
  pilot scale. The automated offline suite runs in headless Chromium on a
  developer machine, which is not the same claim.
- Alerting is **not live**. The endpoints and log lines exist; no scraper,
  dashboard, or alert manager is configured.
- Volume-level encryption at rest is a deployment responsibility and is not
  configured here.

**Not done, because they are not engineering tasks:**

- Data controller and DPO are still unnamed (Q9). **The pilot cannot lawfully
  begin without them.**
- No data processing agreement with an SMS provider.
- Retention policy unset (Q7). Hosting target unchosen (Q6).
- No staff training, no UAT execution, no sign-off. The script exists; nobody
  has run it.
- No pilot. No baselines captured.

**Known residual risks, stated rather than papered over:**

- The device's local store is **not encrypted**. IndexedDB is plaintext. The
  mitigations are device-level encryption, auto-lock, minimal scope and purge on
  logout.
- The audit trail is append-only **by convention**, not by cryptographic
  tamper-evidence. Someone with direct database access could alter it.
- The seed creates demo accounts whose PINs are published in `RUNNING.md`. They
  must be removed or re-credentialled before real patients are registered.

## Open questions surfaced

- Q6 (hosting), Q7 (retention), Q9 (controller and DPO) are now **blocking**
  rather than merely open: each is an exit criterion.
- **New:** should the audit trail get hash chaining for tamper-evidence? It is a
  documented residual risk the DPO will have to accept or fund.

## Files changed

| File                                        | Change type |
|---------------------------------------------|-------------|
| `infra/docker-compose.prod.yml`             | added       |
| `infra/Caddyfile`                           | added       |
| `infra/Dockerfile.backup`                   | added       |
| `infra/Dockerfile.web`                      | modified    |
| `infra/Dockerfile.api`                      | modified    |
| `infra/nginx.conf`                          | modified    |
| `infra/.env.example`                        | modified    |
| `infra/scripts/backup.sh`                   | added       |
| `infra/scripts/restore.sh`                  | added       |
| `infra/scripts/backup-loop.sh`              | added       |
| `infra/scripts/secret-scan.sh`              | added       |
| `apps/api/.env.example`                     | modified    |
| `apps/api/src/main.ts`                      | modified    |
| `apps/api/src/system/system.controller.ts`  | modified    |
| `apps/api/src/common/filters/api-exception.filter.ts` | modified |
| `package.json`                              | modified    |
| `docs/operations/*.md`                      | added       |

## Change details

### `apps/api/src/common/filters/api-exception.filter.ts`

An oversized body returned 500. Body-parser errors are plain `Error`s carrying a
status, not `HttpException`, so they fell through to the generic branch and a
client that merely sent too much data was told the server had broken.

```diff
@@ -55,6 +68,21 @@
       code = status === 404 ? "NOT_FOUND" : status < 500 ? "VALIDATION_ERROR" : "INTERNAL";
+    } else if (isStatusCarryingError(exception)) {
+      status = exception.status ?? exception.statusCode ?? HttpStatus.BAD_REQUEST;
+      if (status === HttpStatus.PAYLOAD_TOO_LARGE) {
+        code = "PAYLOAD_TOO_LARGE";
```

Verified: a 3 MB body now returns `413 PAYLOAD_TOO_LARGE`, malformed JSON returns
`400 VALIDATION_ERROR`.

### `infra/scripts/backup.sh`

```diff
-pg_dump --no-owner --no-privileges --clean --if-exists \
-  | gzip -9 \
-  | openssl enc -aes-256-cbc ... > "$TMP"
+# In a pipeline the exit status is the LAST command's, so a pg_dump failure
+# would be masked and we would write a valid encrypted archive of nothing.
+if ! pg_dump --no-owner --no-privileges --clean --if-exists > "$RAW"; then
+  echo "[backup] FAILED: pg_dump did not succeed" >&2
+  exit 1
+fi
```

## Verification

| Check | Result |
|-------|--------|
| `pnpm lint`, `pnpm typecheck`, `pnpm build` | clean |
| Unit and integration (shared 52, api 70, web 11) | 133 passed |
| Playwright offline | 7 passed |
| `apps/api/test/e2e-sync.sh` | 18 passed |
| `infra/scripts/secret-scan.sh` | clean over 301 tracked files |
| Secret scanner catches a planted token | confirmed |
| Production compose refuses to start with no secrets | confirmed |
| Postgres and Redis publish no host ports | confirmed |
| Backup, encrypt, verify, restore, row-count match | confirmed, 7 of 7 tables |
| Restore refuses live target without confirmation | confirmed |
| Restore rejects a wrong passphrase, target untouched | confirmed |
| API security headers present, `X-Powered-By` removed | confirmed |
| Readiness returns 200 ready, 503 when the database is down | confirmed |
| Rate limiting | confirmed, 429 after 120 requests per minute |
| `/system/metrics` requires a privileged role | confirmed, 401 unauthenticated |
