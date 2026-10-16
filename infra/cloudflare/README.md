# Cloudflare Containers deployment for the sync hub

**Status: written, never deployed.** Produced from Cloudflare's documentation. No account
has run it, so nothing here is verified against the platform. Expect to adjust on the first
deploy, in particular `instance_type`.

This directory is **not** a pnpm workspace member, deliberately. It carries `wrangler`,
which is large and only needed at deploy time, and keeping it out means a broken dependency
here cannot fail `pnpm lint`, `pnpm typecheck` or `pnpm build` for the application. Install
it on its own:

```bash
cd infra/cloudflare
npm install
```

## Why a container and not a Worker

The hub cannot run as a Cloudflare Worker, and this is settled by its dependencies rather
than by preference. Cloudflare lists native C/C++ addons as unsupported in Workers, and the
hub hashes every staff PIN with `argon2`, a compiled native module. Node's `http` module is
also unsupported, and NestJS reaches it through Express. Running on Workers would mean
replacing both the web framework and the password hashing, which is a rewrite of the two
pieces least worth rewriting.

A container runs the same Node process as everywhere else, so `infra/Dockerfile.api` is
reused unchanged.

## What the Worker does

Almost nothing. A container is reached through a Durable Object, so something must hold the
binding and forward the request. Routing, authentication and facility-scope enforcement all
stay in the NestJS hub, which is where they are tested.

## Shape of the deployment

| Piece          | Where it runs                                  |
|----------------|------------------------------------------------|
| PWA            | Cloudflare Pages, static build of `apps/web`   |
| Hub            | Cloudflare Containers, EU jurisdiction          |
| PostgreSQL     | Managed Postgres, Frankfurt                     |

Compute is pinned to the EU jurisdiction so it stays beside the database. Without that
constraint Cloudflare places a container near the request, so a push from Nnewi could run
in a container far from Frankfurt and pay that distance on every query in a sync cycle.

## Secrets

Never in this directory. `wrangler.jsonc` is committed, so it carries no credential
(Global Constraint 2). Set them per environment:

```bash
npx wrangler secret put DATABASE_URL     # the POOLED endpoint
npx wrangler secret put JWT_SECRET
```

`DIRECT_DATABASE_URL` is deliberately withheld from the Worker. The hub never migrates;
migrations run from CI or an operator machine with `pnpm db:deploy`. A hub that cannot
reach the direct endpoint cannot alter the schema even if it is compromised.

## Before the first deploy

1. Create the managed Postgres project in **Frankfurt**. The region cannot be changed
   afterwards on Neon, so this is a one-way door.
2. Apply the schema from your machine against the direct endpoint: `pnpm db:deploy`.
3. Load the facility registry: `pnpm db:seed`.
4. Set the two secrets above.
5. `npm run deploy` from this directory.
6. Confirm the hub answers: `GET https://<worker>/api/v1/system/health`.

## Known gaps

- **`instance_type` is a guess.** `lite`, the default, is 1/16 vCPU and 256 MiB and will not
  hold a NestJS process. `standard-1` is a starting point, not a measurement.
- **Backups are not solved by this file.** The container's local disk is temporary working
  space that Cloudflare discards on restart, so the encrypted `pg_dump` sidecar in
  `infra/docker-compose.prod.yml` has nowhere to write. See
  `docs/operations/backup-and-restore.md`.
- **The reminder scan runs on an in-process interval.** An instance that sleeps will not
  fire it. Harmless while SMS is switched off; a real defect if SMS is ever enabled.
