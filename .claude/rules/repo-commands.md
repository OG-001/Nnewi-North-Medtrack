# Build, run, test, and deploy commands

Every path is relative to the git root. Agents read this instead of rediscovering commands.

---

## 1. Environment

- **Node 20 or newer**, declared in the root `package.json` `engines` field.
- **pnpm 9.15.0**, pinned by the root `packageManager` field. Enable it with
  `corepack enable`. Never use `npm` or `yarn`: they will produce a second lockfile and
  break the workspace.
- Workspace members come from `pnpm-workspace.yaml`: `apps/*` and `packages/*`. Today that
  resolves to `apps/web` (`@phc/web`) and `packages/shared` (`@phc/shared`).

```bash
corepack enable
pnpm install
```

**If a command fails with a missing module, run `pnpm install` from the repo root first.**
That is the single most common cause, especially after a branch switch.

---

## 2. Day-to-day commands

Run these from the repo root.

| Command          | What it does                                             |
|------------------|-----------------------------------------------------------|
| `pnpm dev`       | Vite dev server for the PWA on `http://localhost:5173`    |
| `pnpm build`     | Typecheck then Vite build, output in `apps/web/dist`      |
| `pnpm preview`   | Serve the built PWA on `http://localhost:4173`            |
| `pnpm typecheck` | `tsc --noEmit` across every workspace package             |
| `pnpm lint`      | ESLint over `apps/web`, `--max-warnings 0`                |

Inside `apps/web/` the same scripts exist unprefixed (`pnpm dev`, `pnpm build`,
`pnpm typecheck`, `pnpm lint`, `pnpm preview`).

Note that `pnpm build` in `apps/web` runs `tsc --noEmit && vite build`, so a type error
fails the build. That is deliberate.

---

## 3. Tests

**The test tooling is installed and running.** `pnpm test` runs the Vitest suites across
`packages/shared`, `apps/api` and `apps/web`; `pnpm e2e` runs the Playwright offline suite
against the production build.

| Tier               | Location                              | Needs             |
|--------------------|---------------------------------------|-------------------|
| Domain unit        | `packages/shared/test/`               | Nothing           |
| Conflict rules     | `apps/api/test/conflict.test.ts`      | Nothing           |
| Client durability  | `apps/web/src/lib/__tests__/`         | Nothing           |
| Live hub           | `apps/api/test/*-integration.test.ts` | Hub plus Postgres |
| Protocol smoke     | `apps/api/test/e2e-sync.sh`           | Hub plus Postgres |
| Offline end to end | `apps/web/e2e/`                       | Built PWA on 4173 |

The live-hub suites **skip themselves** when no hub answers, so `pnpm test` runs with no
infrastructure. The Playwright suite runs against the **production build**, never the dev
server: offline behaviour comes from the service worker, which only exists after
`vite build`.

**The offline harness is mandatory infrastructure**, not a nice-to-have. Definition of Done
item 3 in `docs/implementation/README.md` requires an offline end-to-end test for any clinic
workflow before its phase exits. Build it once in Phase 0 and reuse it every phase.

Pick **one** tier per change. Do not overtest.

---

## 4. Definition of Done gate

Definition of Done item 2 requires all four to be green for the touched workspaces:

```bash
pnpm lint
pnpm typecheck
pnpm test        # once Vitest is wired up
pnpm build
```

The `system-testing` agent runs exactly this sequence, in this order, stopping at the first
failure.

---

## 5. Docker and self-hosting

Compose file: `infra/docker-compose.yml`. Image: `infra/Dockerfile.web`. Web server config:
`infra/nginx.conf`. Environment template: `infra/.env.example`.

```bash
# Full stack: PWA on :8080, PostgreSQL on :5432, Redis on :6379
docker compose -f infra/docker-compose.yml up --build

# Dependencies only, for local API work
docker compose -f infra/docker-compose.yml up -d postgres redis

# PostgreSQL shell
docker exec -it $(docker compose -f infra/docker-compose.yml ps -q postgres) \
  psql -U phc -d phc_track
```

The credentials in the Compose file (`phc` / `phc_dev_only`) are **development only**. A
real deployment supplies them from the environment or a secret store, never from a committed
file.

**Confirmation-required operations**, routed through the `deployment` agent and never run
without explicit owner approval for that exact command: `docker compose down -v` (destroys
the `pgdata` volume), `docker system prune`, `docker push`, any production deploy, and any
certificate issuance.

---

## 6. Where a running system writes state

| Thing                | Where it lives                                        |
|----------------------|--------------------------------------------------------|
| Clinic data (offline)| IndexedDB in the browser profile, via Dexie            |
| Outbox and sync meta | The same IndexedDB database, see `apps/web/src/db/db.ts` |
| Device identifier    | Local storage, see `apps/web/src/lib/device.ts`        |
| Hub data (planned)   | The `pgdata` Docker volume                             |

To inspect the local store during debugging, use the browser DevTools Application panel.
There is no server-side log to read yet, because there is no server yet.
