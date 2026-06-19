# Architecture — Tech Stack Recommendation & Verdict

**Date:** 2026-06-09
**Author:** Solution architecture (planning)
**Status:** Decided (locked)
**Reads with:** `system-architecture.md`, `offline-sync-design.md`

---

## 1. Decision summary (locked)

| Layer | Choice |
|---|---|
| **App type** | Offline-first **Progressive Web App** (installable) |
| **Frontend** | **React 18 + TypeScript**, built with **Vite** |
| **UI** | Tailwind CSS + a headless/accessible component library (e.g. Radix/shadcn-style); mobile-first |
| **Local store** | **IndexedDB via Dexie.js**; **service worker** (Workbox) for app-shell caching + background sync |
| **Client state / data** | TanStack Query for server cache + a thin local-first repository over Dexie |
| **Forms / validation** | React Hook Form + **Zod** (schemas shared with backend) |
| **Backend** | **NestJS** (Node.js 22 + TypeScript), modular monolith |
| **API** | REST + OpenAPI; Zod/DTO validation; JWT auth |
| **Database** | **PostgreSQL 16** |
| **ORM / migrations** | Prisma (or TypeORM) with versioned migrations |
| **Sync engine** | Custom change-log / pull-push protocol over REST (see `offline-sync-design.md`) |
| **SMS** | Provider-agnostic service; **Africa's Talking** + **Termii** adapters |
| **Background jobs** | BullMQ + Redis (SMS dispatch, report generation, reminder scheduling) |
| **Auth** | JWT access + refresh; bcrypt/argon2 password+PIN; offline token cache |
| **Packaging** | **Docker** + Docker Compose; single in-country deploy |
| **CI** | GitHub Actions (lint, typecheck, test, build, image) |
| **Monorepo** | pnpm workspaces (`apps/web`, `apps/api`, `packages/shared`) |
| **Testing** | Vitest (unit), Playwright (e2e incl. offline), supertest (API) |

The rationale below is recorded so the build does **not** re-open these choices.

---

## 2. Why these choices (against the constraints)

The binding constraints from `../master-plan.md`: **low/no connectivity**,
**low-end Android devices**, **multi-facility within one LGA**, **sensitive
health data in Nigeria**, **NHMIS/DHIS2 reporting**, **maintainable by a small
team / local talent**.

### Why a PWA (not native, not a thin web page)

- **Offline-first is the whole point.** A PWA with a service worker + IndexedDB
  runs and stores data on-device with no network — exactly the requirement.
- **No app-store friction / instant updates.** Critical for an LGA pilot:
  install via browser "Add to Home Screen"; push fixes without store review.
- **One codebase, low-end friendly.** Runs on the cheap Android phones/tablets
  PHCs actually have; installable, full-screen, works like an app.
- **Cheaper to build and maintain** than native iOS+Android, with a larger local
  web-developer talent pool.

### Why React + TypeScript + Vite

- Largest ecosystem and talent pool; TypeScript catches errors in a data-heavy
  clinical app; Vite gives fast builds and small, code-split bundles (protects
  the performance budget below).
- Mature offline/PWA tooling (Workbox, Dexie, vite-plugin-pwa).

### Why Dexie + service worker (not raw IndexedDB, not SQLite-WASM)

- Dexie is a small, reliable wrapper over IndexedDB (the only broadly-available
  persistent store in browsers) with good query ergonomics and migration
  support. SQLite-WASM/OPFS is powerful but heavier and less universally stable
  on low-end Android browsers — kept as a **future option**, not v1.

### Why NestJS (not Express bare, not a different language)

- **Same language (TypeScript) end-to-end** → shared validation schemas (Zod),
  shared types, one talent pool, less context-switching for a small team.
- NestJS gives **structure** (modules, DI, guards) that suits a multi-module
  health system and makes RBAC guards + audit interceptors clean and consistent.
- A **modular monolith** (not microservices) is the right size: simpler to
  deploy in-country, easier to operate, splits later if ever needed.

### Why PostgreSQL

- Battle-tested, free, self-hostable, strong relational integrity for clinical
  data, excellent for the reporting/aggregation the NHMIS summaries need, and
  supports JSONB for flexible fields. Runs well on modest in-country hardware.

### Why provider-agnostic SMS with Africa's Talking + Termii

- Both are **Nigeria-focused** gateways with good coverage of MTN/Glo/Airtel/
  9mobile and sensible pricing; an abstraction lets the owner switch on cost or
  reliability without code changes (Open question Q5). Twilio remains a possible
  third adapter.

### Why Docker, in-country

- **NDPA 2023**: patient health data is sensitive personal data; keeping it on a
  **Nigeria-region VPS or on-prem LGA server** simplifies the legal posture.
  Docker Compose runs identically on a VPS or a local server (Open question Q6),
  with backups under operator control.

---

## 3. Alternatives considered (and why not, for v1)

| Alternative | Why not for v1 |
|---|---|
| **Native Android (Kotlin/Flutter)** | Best offline/device integration, but higher build cost, store friction, smaller local talent overlap with the web backend, two stacks. Revisit only if PWA hits a hard device limit. |
| **Next.js full-stack** | Fine, but offline-first is bolted on rather than first-class; SSR adds little when the app must run offline anyway. (Was offered and not chosen.) |
| **Laravel/PHP + MySQL** | Cheap hosting and local talent, but server-rendered + weak offline story conflicts with the #1 constraint. (Was offered and not chosen.) |
| **Microservices backend** | Operational overkill for one LGA on one server; harder to deploy/operate in-country. Modular monolith instead. |
| **CouchDB/PouchDB sync** | Genuinely strong offline sync out of the box, and a credible alternative. Not chosen because the relational reporting + RBAC + audit needs fit Postgres better, and a custom change-log sync keeps one database and full control of conflict policy. **Documented as a fallback** if the custom sync proves too costly. |
| **SQLite-WASM/OPFS on client** | Powerful local SQL, but heavier and less stable on low-end Android browsers today; revisit post-v1. |
| **Firebase / managed BaaS** | Fast to start and has offline, but data-residency (NDPA) and lock-in concerns for sensitive health data; prefer self-hostable. |

---

## 4. Performance & device budget (release-blocking for key journeys)

Target devices: mid/low-range Android, 2–4 GB RAM, slow/intermittent 3G.

| Metric | Budget |
|---|---|
| Initial JS (gzipped, app shell) | ≤ ~200 KB; route-level code splitting |
| Time to interactive (mid device, cached) | ≤ ~3 s warm / works instantly offline |
| Patient search over local store | < 300 ms |
| Patient summary (full history) load | < 1 s |
| Largest Contentful Paint (first load) | ≤ 2.5 s on target network where online |
| Interaction (INP) | ≤ 200 ms for common actions |
| Local DB size per facility device | bounded by facility scope; archive old data |

Protect these with: code splitting, list virtualisation, indexed Dexie queries,
image compression on capture, and avoiding heavy client libraries.

---

## 5. Monorepo layout (target)

```text
<repo>/
├── apps/
│   ├── web/        # React PWA (Vite)
│   └── api/        # NestJS API + sync hub
├── packages/
│   └── shared/     # Zod schemas, TS types, enums (EPI/ANC), constants — shared client+server
├── infra/          # Docker, compose, deploy, backup scripts
├── docs/           # this plan set, moved in
└── devops/
    └── change_log/ # per-phase entries (see implementation/README.md)
```

The `packages/shared` workspace is important: clinical enums, the immunization/
ANC schedule **types**, validation schemas, and DTOs are defined once and used by
both the PWA and the API — preventing client/server drift in a health system
where a mismatch is a data-integrity risk.

---

## 6. Version pinning & upgrades

- Pin Node 22 LTS (matches container runtime) and lock dependency versions.
- Prefer well-maintained, widely-used libraries; avoid niche packages on the
  critical offline/sync path.
- Keep the dependency surface small to protect the bundle budget and audit-
  ability (security review in Phase 10).
