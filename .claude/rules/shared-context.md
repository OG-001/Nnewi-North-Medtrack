# Shared project context

The context every agent needs before acting. Read this once per task, before touching code.

---

## 1. What the system is

**PHC-Track**, working name "Nnewi North PHC Digital Health Platform", is an offline-first
Progressive Web App for Primary Health Centres in Nnewi North Local Government Area,
Anambra State, Nigeria. It runs on low-end Android devices in clinics where the network is
unreliable, so the device is the system of record during a session and the central hub is
eventually consistent.

The design stance, quoted from `docs/architecture/offline-sync-design.md`:

> Care never waits for the network; the network catches up to care.

It holds real patient health data. Under the Nigeria Data Protection Act 2023 that is
**sensitive personal data**, which is why the constraints in `CLAUDE.md` are not negotiable.

---

## 2. Technology stack

| Layer            | Technology                                                  |
|------------------|--------------------------------------------------------------|
| Frontend         | React 18, TypeScript 5.5, Vite 5, Tailwind 3, React Router 6  |
| Local store      | Dexie 4 over IndexedDB, plus `dexie-react-hooks`              |
| Offline shell    | `vite-plugin-pwa` and `workbox-window` service worker         |
| Validation       | Zod on the client, class-validator or Zod in the future API   |
| Backend (planned)| NestJS, modular monolith, REST under `/api/v1`                |
| Database (planned)| PostgreSQL 16, with Redis 7 and BullMQ for background jobs   |
| Packaging        | pnpm 9 workspaces, Node 20 or newer                           |
| Container        | Docker and Docker Compose, nginx serving the built PWA        |

The `apps/api/` NestJS hub **does not exist yet**. `infra/docker-compose.yml` already starts
`postgres` and `redis` ready for it, and the `api` service is a commented placeholder.

---

## 3. The 10 modules and their phases

| # | Module                    | Built in                          |
|---|---------------------------|------------------------------------|
| 1 | Patient Registration      | Phase 2                            |
| 2 | Electronic Medical Records| Phase 2                            |
| 3 | Maternal Health           | Phase 4                            |
| 4 | Immunization Tracking     | Phase 5                            |
| 5 | Reporting and Analytics   | Phase 8                            |
| 6 | Queue Management          | Phase 6                            |
| 7 | Staff Management          | Phase 1 accounts, Phase 9 admin UI |
| 8 | SMS Notification          | Phase 7                            |
| 9 | Offline Sync Engine       | Phase 3, designed in Phase 0       |
| 10| Admin Dashboard           | Phase 9                            |

Phase index and dependency graph: `docs/implementation/README.md`. The minimum viable
product is phases 0, 1, 2, 3, and 6.

---

## 4. The seven roles

Defined in `docs/product/user-roles-and-permissions.md`, implemented in
`packages/shared/src/permissions.ts` and `packages/shared/src/enums.ts`.

| Role identifier   | Who they are                                     |
|-------------------|---------------------------------------------------|
| `records_clerk`   | Front-desk registration staff                     |
| `nurse_midwife`   | Clinical nursing staff                            |
| `chew`            | Community Health Extension Worker                 |
| `doctor`          | Physician or Medical Officer, where present       |
| `facility_admin`  | Officer-in-charge of one PHC                      |
| `lga_authority`   | LGA oversight and monitoring, reads all facilities|
| `system_admin`    | Technical operator, no clinical edits by default  |

A person may hold several roles; permissions are the union. Full matrix and the data-scope
rules are in [`rbac-and-scope.md`](rbac-and-scope.md).

---

## 5. What is built and what is not

**Working today, in `apps/web/`:** the facility-selection door screen listing all 76 Nnewi
North LGA facilities, facility-scoped authentication, patient registration and EMR,
maternal and antenatal care, immunization, queue, NHMIS reporting with DHIS2 and CSV
export, the admin screens, RBAC, offline persistence with an outbox and audit trail, the
installable PWA shell, and the dark-green theme.

**Not built, deferred by the plan:** the NestJS and PostgreSQL sync hub, server-side scope
enforcement, live SMS dispatch, and production hardening.

Two demo facilities are provisioned in `apps/web/src/db/seed.ts`: Primary Health Centre
Umuenem Otolo Nnewi (`04/14/1/1/0062`) and Obiagu Health Post, Uruagu, Nnewi
(`04/14/1/1/0060`). Demo logins are listed in `RUNNING.md`. Every other facility opens empty
until an admin provisions staff.

**Never describe a deferred capability as if it works.** The most common way to mislead the
owner on this project is to report the third isolation layer (server-side sync scope) as
enforced when only the first two are.

---

## 6. Cross-facility data isolation, the three layers

This is the highest-risk correctness surface in the system.

| Layer                    | Status              |
|--------------------------|----------------------|
| Scoped authentication    | Enforced now         |
| Client-side data scope   | Enforced now         |
| Server-side sync scope   | Deferred to Phase 3  |

Layer 1 lives in `apps/web/src/lib/session.tsx`: an account only signs in at a facility
listed in its `facility_ids`. Layer 2 lives in `apps/web/src/lib/scope.ts`: every read is
filtered by the signed-in `facility_id`, and soft-deleted rows never reach the UI. Layer 3
is the production guarantee and does not exist yet.

---

## 7. Practical notes

- **Package manager is pnpm, never npm or yarn.** Run `corepack enable` once.
- **Always run commands from the repo root** unless a rule says otherwise. The root
  `package.json` scripts filter into `@phc/web`.
- **`packages/shared` is imported as `@phc/shared`**, a workspace dependency. Domain logic
  that the future API will also need belongs there, not in `apps/web`.
- **The local store is not encrypted.** IndexedDB is plaintext on the device. Mitigations
  are auto-lock, minimal scope, and purge on logout. See
  [`ndpa-compliance.md`](ndpa-compliance.md).
- **Do not trust device clocks for ordering.** `rev` and `server_seq` are the ordering
  signals, not wall-clock time.
- **Facility codes** follow the national format `04/14/T/O/NNNN` and live in
  `packages/shared/src/facilities.ts`.
- **Phone numbers are E.164** (`+234...`). Timestamps are ISO-8601 UTC.

---

## 8. Git baseline

- Remote: `github.com/OG-001/Nnewi-North-Medtrack`. Default branch: `main`.
- Feature work uses `feature/<feature-name>`; phase work may use `phase-<n>-<short-title>`.
- **Never commit directly to `main`.**
- Full workflow in [`concurrent-sessions.md`](concurrent-sessions.md) and the `git-workflow`
  agent definition.
