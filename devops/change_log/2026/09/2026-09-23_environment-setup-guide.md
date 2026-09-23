# Environment setup guide and documentation index

| Field  | Value                          |
|--------|--------------------------------|
| Date   | 2026-09-23                     |
| Time   | 17:34 WAT                      |
| Author | Implementation                 |
| Phase  | n/a, documentation             |
| Module | n/a                            |

## Summary

Two documents, for a reader who has never seen the project.

- `docs/operations/environment-setup.md`: every dependency and how to set each
  one up, from a bare machine to a working app, with a verification pass and the
  traps that actually bite.
- `docs/README.md`: an index of the whole documentation set, plus the glossary.

The existing runbook covers deploying to a server and assumes the tooling is
already there. Nothing covered the step before that, which is what someone
setting up a machine actually starts from.

## Decisions taken

1. **The guide says Redis is not needed.** It appears in both Compose files and
   in the architecture notes because background jobs were planned for it, but
   **nothing in the hub reads it**: no `REDIS_URL` in the code, no BullMQ
   dependency. With SMS switched off there is no job to run. Telling someone to
   stand up a service that does nothing costs them memory, patching and attack
   surface for no return, so the guide says to skip it.

   Left in the Compose files rather than removed, because the locked stack names
   Redis for jobs and removing it is the owner's call, not a documentation one.
   Raised here instead.

2. **The guide states that the PWA alone needs none of this.** It is
   offline-first and runs entirely in the browser against its own store.
   PostgreSQL and the hub exist so devices can sync with each other. Someone who
   only wants to see the app can do three of the ten steps.

3. **Every command in the guide was run, not recalled.** That is how the port
   collision below was found.

4. **`docs/README.md` was missing.** `CLAUDE.md` cites it three times as the
   source of the locked decisions and the "full glossary", and the file did not
   exist. The index now carries the glossary and fills that dangling reference.

## A trap found by running the guide

`pnpm db:migrate` failed with `Authentication failed ... credentials for "phc"
are not valid`, which reads like a wrong password. It was not. An unrelated
project on the same machine held port 5432, so the migration was talking to a
**different PostgreSQL** that has no `phc` user. Against the right port the same
command succeeded immediately.

The troubleshooting section now names this symptom and gives the two commands
that identify it, because the error message points at the wrong cause.

## Deviations from the plan

None. Documentation only.

## Open questions surfaced

- **New:** should Redis be removed from `infra/docker-compose.yml` and
  `infra/docker-compose.prod.yml`? Nothing uses it. Keeping it costs a container,
  256 MB of limit and an attack surface; removing it touches a locked stack
  decision. Owner's call.
- The demo database has accumulated test data across sessions: the seed now
  reports 89 facilities and 98 users against an expected 76 and 12. It needs
  truncating before it is used for anything but development. Previously
  recorded, restated because the setup guide sends people to `pnpm db:seed`.

## Files changed

| File                                      | Change type |
|-------------------------------------------|-------------|
| `docs/operations/environment-setup.md`    | added       |
| `docs/README.md`                          | added       |

## Change details

### `docs/operations/environment-setup.md`

New. Ten numbered steps from Node to a verified end-to-end run, then the test
tiers, then troubleshooting. The sections that carry information not written
down anywhere else:

- Redis is not required (section 1).
- The PWA alone needs no backend at all (section 1).
- "Authentication failed" often means a port collision, not a bad password
  (section 13).
- The shared package needs its CommonJS build before the hub will start
  (section 13).
- The hub must not be run through `tsx`, because esbuild does not emit the
  decorator metadata NestJS needs for dependency injection (section 13).
- The live-hub tests need `RATE_LIMIT_PER_WINDOW` raised, and the offline tests
  run against the production build because the service worker only exists after
  `vite build` (section 12).

### `docs/README.md`

New. Index, glossary, and a pointer to the three places the built-versus-not
position is maintained.

## Verification

| Check | Result |
|-------|--------|
| Every relative link in both documents | resolves |
| `pnpm db:migrate`, `pnpm db:seed` | run successfully against the correct port |
| `pnpm --filter @phc/shared build` | exits clean |
| `pnpm typecheck` | clean across three workspaces |
| `infra/scripts/secret-scan.sh` | clean over 382 tracked files |

Testing: skipped, documentation change with no behavioural effect.
