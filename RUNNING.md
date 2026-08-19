# Running PHC-Track (the web app)

This repo contains a working **offline-first Progressive Web App** built from
the blueprint in [`docs/`](docs/). It runs fully on-device (IndexedDB) — no
backend required for the clinic workflows.

## Prerequisites

- Node 20+ and pnpm 9+ (`corepack enable`)

## Install & run (dev)

```bash
pnpm install
pnpm dev            # Vite dev server → http://localhost:5173
```

## Production build / preview

```bash
pnpm build          # typecheck + Vite build (outputs apps/web/dist)
pnpm preview        # serve the built PWA → http://localhost:4173
```

## Self-host with Docker

```bash
docker compose -f infra/docker-compose.yml up --build   # PWA on http://localhost:8080
```

---

## First-run flow: selecting your PHC

The very first screen is a **facility-selection door screen**. The complete list
of all health facilities in Nnewi North LGA is shown, sorted alphabetically,
with national facility codes (`04/14/T/O/NNNN`) and Public/Private/Primary filters.

1. Search or scroll to your facility.
2. Tap it — you are taken to the sign-in screen for *that* facility only.
3. Sign in with your username and PIN.
4. A **"Change PHC"** link on the sign-in screen lets you go back and pick a
   different facility.

Your last-used facility is remembered offline so returning staff land directly on
the sign-in screen; switching facilities is always one tap away.

---

## Demo logins (PIN-based, local/offline)

The two fully-provisioned demo facilities are:

| Facility | National code |
|---|---|
| Primary Health Centre Umuenem Otolo Nnewi | `04/14/1/1/0062` |
| Obiagu Health Post, Uruagu, Nnewi | `04/14/1/1/0060` |

Select either of these from the door screen, then sign in with:

| Username   | PIN  | Role |
|------------|------|------|
| `nurse`    | 2222 | Nurse / Midwife |
| `clerk`    | 1111 | Records Clerk |
| `chew`     | 3333 | CHEW |
| `doctor`   | 4444 | Doctor / Medical Officer |
| `admin`    | 5555 | Facility Administrator |
| `lga`      | 6666 | LGA Health Authority / M&E (cross-facility access) |
| `sysadmin` | 0000 | System Admin (cross-facility access) |

Sign in at each of the two provisioned PHCs with the same credentials — you will
see **different patients** at each one. Every other facility in the list opens
empty until an admin provisions staff for it.

---

## How cross-facility data isolation works

Each PHC's data is kept separate in three layers:

| Layer | What it does | Status |
|---|---|---|
| **Scoped authentication** | Clinical staff accounts are provisioned for a single facility (`facility_ids`). The login step only accepts accounts whose `facility_ids` includes the selected PHC — a nurse at facility A cannot sign in at facility B. | **Enforced now** |
| **Client-side data-scope** | Every database read in the app is filtered by the signed-in `facility_id`. Deleted/foreign rows are never returned to the UI. LGA and System Admin roles are the deliberate cross-facility exception for oversight. | **Enforced now** |
| **Server-side sync scope** | The NestJS sync hub ships a facility's rows only to that facility's device: a pull naming an out-of-scope facility returns `OUT_OF_SCOPE`, and a push carrying a foreign `facility_id` is rejected. A tampered client cannot request another facility's data. | **Enforced now** (hub) |

All three layers are implemented. The first two are active in the offline PWA on
its own; the third applies whenever the app is pointed at a running sync hub.

---

## Try the offline guarantee

1. Open the app, register a patient or record a visit.
2. In DevTools → Network, switch to **Offline** (or toggle device airplane mode).
3. Keep working — everything reads/writes the local store; the sync indicator
   shows **Offline** then **Pending (n)**.
4. Go back online → it drains to **Synced**. Reload anytime: nothing is lost.

---

## What's implemented vs. deferred

**Implemented (frontend):** facility-selection door screen (all 76 Nnewi North
LGA facilities, alphabetical), facility-scoped authentication, patient
registration + EMR, maternal/ANC, immunization, queue, NHMIS reporting +
DHIS2/CSV export, admin (facilities/staff/audit/health), RBAC, offline
persistence with outbox + audit, installable PWA, dark-green theme.

**Implemented (backend):** the NestJS + PostgreSQL **sync hub** (`apps/api`) —
facility-scoped auth, the push/pull change-log protocol, conflict resolution with
an admin escalation queue, and server-side scope enforcement.

**Deferred (per the plan):** live **SMS** dispatch (Phase 7), the relational
reporting projection (Phase 8), and production hardening (Phase 10). See the
change-log under [`devops/change_log/`](devops/change_log/) — the Phase 3 entry
records what is still open before that phase's exit gate can be signed off.

---

## Layout

```
apps/web/         offline-first PWA (React + TS + Vite + Tailwind + Dexie)
apps/api/         NestJS sync hub (Prisma + PostgreSQL): auth, sync, conflicts
packages/shared/  domain logic shared with the future API (enums, RBAC, MRN,
                  EDD, EPI + ANC schedule engines, app config, facility registry)
infra/            Docker / compose / env example for self-hosting
devops/           per-phase change log
docs/             the build blueprint (read this for the full plan)
```

---

## Running the sync hub (optional)

The PWA works without it. Start the hub when you want devices to reconcile with
each other.

```bash
docker compose -f infra/docker-compose.yml up -d postgres   # or your own Postgres
cp apps/api/.env.example apps/api/.env                      # then set JWT_SECRET
pnpm db:migrate                                             # create the schema
pnpm db:seed                                                # facilities + demo staff
pnpm dev:api                                                # hub on :3000/api/v1
```

Point the PWA at it with `VITE_API_BASE_URL` (defaults to
`http://localhost:3000/api/v1`), or run the whole stack with
`docker compose -f infra/docker-compose.yml up --build`.

> **Port note:** `3000` is a common default and may already be taken on your
> machine. Set `PORT` for the hub and `VITE_API_BASE_URL` for the PWA to match.

### Tests

```bash
pnpm test                          # unit + live-hub tests (34: 27 api, 7 web)
pnpm e2e                           # offline browser tests (7) — builds + previews the PWA
pnpm test:all                      # both of the above
bash apps/api/test/e2e-sync.sh     # protocol tests against a running hub (18)
```

`pnpm test` runs with or without infrastructure: the live-hub tests (resumable
pull, replay, poison isolation, baseline volume/perf) skip themselves when no
hub answers, and the 21 conflict-resolution tests plus 7 client durability tests
always run.

The browser tests run against the **production build**, not the dev server: the
offline guarantee comes from the PWA service worker, which only exists after
`vite build`. The first run takes a minute or so because it builds.
