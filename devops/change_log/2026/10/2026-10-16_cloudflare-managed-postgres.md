# Cloudflare Containers and managed Postgres: configuration

| Field     | Value                          |
|-----------|--------------------------------|
| Date      | 2026-10-16                     |
| Time      | 18:40 WAT                      |
| Author    | OG-001                         |
| Phase     | 10                             |
| Module    | n/a (deployment)               |

## Summary

The owner chose Cloudflare for production hosting, with the database in a managed Postgres
in Frankfurt. This change prepares the repository for that target. **Nothing is deployed,
and none of the Cloudflare configuration has been exercised against the platform.**

Four pieces: a pooled and a direct database URL, migrations taken out of the container
entrypoint, a Cloudflare deployment unit, and a backup design for review.

## Decisions taken

### Two database URLs

`DATABASE_URL` is now the pooled endpoint used by the running hub, and `DIRECT_DATABASE_URL`
bypasses the pooler for migrations. A transaction-mode pooler will not carry the advisory
locks and session-level statements `prisma migrate` and `pg_dump` need, and the failure mode
is confusing rather than clear. On the local stack there is no pooler, so the generator
writes the same value twice.

Verified that the running hub does not need the new variable: Prisma uses `directUrl` only
for CLI operations, and a live query succeeded with it unset. So this does not break an
existing environment that has only `DATABASE_URL`, though `prisma validate` and
`prisma migrate` will refuse until it is set.

### Migrations leave the container entrypoint

`infra/Dockerfile.api` ran `prisma migrate deploy` on every start. That is safe for exactly
one always-on container and unsafe otherwise:

- Several instances starting together race on the same database. Prisma takes an advisory
  lock, so one proceeds and the rest block, turning a cold start into a timeout.
- On a platform whose instances wake on demand, it runs on every wake, so the cost is paid
  forever rather than once.
- It cannot work at all through a pooled endpoint.

Migrations are now a deliberate step, `pnpm db:deploy`, run from CI or an operator machine
against the direct endpoint. `RUN_MIGRATIONS_ON_START=true` restores the old behaviour for a
single-container local stack, and the Dockerfile says never to set it on a multi-instance
deployment.

A security benefit falls out of this: `DIRECT_DATABASE_URL` is deliberately never given to
the Worker, so a compromised hub cannot alter the schema.

### Containers, not Workers

Settled by dependencies rather than preference. Cloudflare lists native C/C++ addons and
Node's `http` module as unsupported in Workers. The hub hashes every staff PIN with
`argon2`, a compiled native module, and reaches HTTP through NestJS on Express. Workers
would require replacing both the web framework and the password hashing. A container runs
the existing Node process and reuses `infra/Dockerfile.api` unchanged.

### Compute pinned to the EU jurisdiction

Cloudflare places a container near the incoming request by default. With the database in
Frankfurt, a push from Nnewi could run in a container far from it and pay that distance on
every query in a sync cycle, and a sync push issues several. `constraints.jurisdiction: "eu"`
keeps compute beside the data. Cloudflare rejects a config pairing that jurisdiction with a
non-European region, so a mistake fails the deploy rather than quietly misplacing patient
data.

Note for the record: pinning compute to Africa was never available. Cloudflare lists an
`AFR` region but states it has limited capacity and cannot be used exclusively without
contacting support.

### One named container instance

The Worker routes every request to a single instance rather than one per session. One
connection pool against Postgres instead of one per session, no geography to spread across
since every user is in one LGA, and no in-memory state worth isolating because sync
ordering is decided by `server_seq` in Postgres. The code records that sharding, if ever
needed, should be on `facility_id` so a facility's pushes stay serialised and the conflict
rules keep a consistent view.

### Not a pnpm workspace member

`infra/cloudflare/` installs on its own. It carries `wrangler`, which is large and needed
only at deploy time, and keeping it outside the workspace means a dependency problem there
cannot fail `pnpm lint`, `pnpm typecheck` or `pnpm build` for the application. Confirmed:
the full gate is clean with the directory present.

### Backups: proposed, not built

The existing sidecar cannot be carried over. It writes an encrypted dump to a mounted
volume, and Cloudflare states a container's local disk is temporary working space lost on
restart, so the dump would be silently discarded while the logs reported success. The
container also sleeps, so a fixed interval inside the process does not fire.

The proposal is two layers: provider point-in-time recovery for operational accidents, and
an independent encrypted `pg_dump` held outside the provider's account for vendor loss and
for the retention obligation. The provider's own recovery data is not an off-host backup,
which section 3 of the runbook requires: it lives in the same account as the database, so
one compromised credential or lapsed subscription loses both.

Recommended host for the second layer is a small always-on VM reusing
`infra/scripts/backup.sh`, because that script already encrypts before writing, already
checks `pg_dump`'s exit status rather than trusting a pipeline, and has been rehearsed once.
A scheduled CI job was rejected on compliance grounds rather than convenience: it would
route the whole patient database through a third party's build runners and hold the
database credential and backup passphrase there, adding a processor and probably a
jurisdiction.

## Deviations from the plan

None. The owner asked for the connection strings, the container constraint, the migration
relocation, and a backup approach for review. All four are here, with the backup explicitly
marked as a proposal.

## Open questions surfaced

- **`instance_type` is unverified.** `lite`, the default, is 1/16 vCPU and 256 MiB and will
  not hold a NestJS process. `standard-1` is a starting point, not a measurement.
- **The backup pipeline is unrehearsed.** The rehearsal record covers the self-hosted
  design only and does not transfer. Until a restore from the new pipeline is completed and
  verified, the deployment has no backup.
- **The reminder scan runs on an in-process interval** and will not fire on an instance that
  sleeps. Harmless while SMS is off, a real defect if it is ever enabled.
- **`PHC_DPO_CONTACT` is still unset.**
- **The Neon region is a one-way door.** Their documentation states a project's region
  cannot be changed after selection.

## Files changed

| File                                      | Change type |
|-------------------------------------------|-------------|
| `apps/api/prisma/schema.prisma`           | modified    |
| `infra/Dockerfile.api`                    | modified    |
| `infra/scripts/init-env.sh`               | modified    |
| `package.json`                            | modified    |
| `infra/cloudflare/wrangler.jsonc`         | added       |
| `infra/cloudflare/src/index.ts`           | added       |
| `infra/cloudflare/package.json`           | added       |
| `infra/cloudflare/README.md`              | added       |
| `docs/operations/backup-and-restore.md`   | modified    |

## Change details

### `apps/api/prisma/schema.prisma`

```diff
 datasource db {
   provider = "postgresql"
   url      = env("DATABASE_URL")
+  directUrl = env("DIRECT_DATABASE_URL")
 }
```

### `infra/Dockerfile.api`

```diff
-CMD ["sh", "-c", "cd apps/api && npx prisma migrate deploy && node dist/src/main.js"]
+CMD ["sh", "-c", "cd apps/api && \
+  if [ \"$RUN_MIGRATIONS_ON_START\" = \"true\" ]; then npx prisma migrate deploy; fi && \
+  node dist/src/main.js"]
```

### `package.json`

```diff
     "db:migrate": "pnpm --filter @phc/api prisma:migrate",
+    "db:deploy": "pnpm --filter @phc/api exec prisma migrate deploy",
```

### `infra/scripts/init-env.sh`

Writes `DIRECT_DATABASE_URL` alongside `DATABASE_URL`, identical on the local stack.

### `infra/cloudflare/`

New, standalone. `wrangler.jsonc` defines the container, the Durable Object binding and the
EU jurisdiction constraint, and carries no secret. `src/index.ts` forwards requests to one
named instance and does no application work. `README.md` records the status, the reasoning
and the known gaps.

### `docs/operations/backup-and-restore.md`

A new section 0 covering the managed-Postgres model, and a header table directing the reader
to the right model. The existing sections are relabelled as the self-hosted design rather
than rewritten.

## Verification

`pnpm lint`, `pnpm typecheck` and `pnpm build` clean with the new directory present.

The hub test suite passes 130 with 12 skipped. Four sync tests failed on the first run with
the hub on its default rate limit, which is the documented condition requiring
`RATE_LIMIT_PER_WINDOW=100000`; restarting the hub as `RUNNING.md` instructs cleared all
four, confirming the failures were environmental rather than caused by this change.

A live Prisma query succeeded against the running database with `DIRECT_DATABASE_URL`
unset, confirming the schema change does not break an existing environment at runtime.

Testing: no automated test added. The Cloudflare configuration cannot be tested without an
account, which is why it is marked unexercised rather than claimed to work.
