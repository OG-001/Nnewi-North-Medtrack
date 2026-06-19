# Phase 0 — Foundation & Scaffold

**Date:** 2026-06-09
**Author:** Solution architecture (planning)
**Phase:** 0 — Foundation & scaffold
**Depends on:** none
**Status:** Planned

---

## 1. Objective

Stand up an empty-but-correct **monorepo** containing a buildable offline-capable
**React + TS PWA** (`apps/web`), a buildable **NestJS API** (`apps/api`), a
shared **`packages/shared`** workspace (Zod schemas, types, clinical enums), and
the **Docker** dev environment (Postgres + Redis) — wired with type checking,
linting, unit + e2e test runners, CI, and the **offline patterns** (service
worker app-shell cache, Dexie store, repository + outbox skeleton, sync-status
shell) — so every later phase builds on a reviewed, reproducible foundation with
no clinical features yet.

## 2. Prerequisites / entry criteria

- Stack is locked (`../architecture/tech-stack-recommendation.md`).
- Monorepo layout approved (same doc §5).
- Node 22 LTS + pnpm + Docker available locally.
- Working name / config-driven app naming agreed (final name is Open question
  Q8; use codename **PHC-Track** via one config value).

## 3. Scope

**In scope**

- Monorepo init: pnpm workspaces — `apps/web`, `apps/api`, `packages/shared`,
  `infra/`, `devops/`.
- `apps/web`: Vite + React + TS + Tailwind; **PWA** (vite-plugin-pwa/Workbox),
  service worker registering an app-shell cache; **Dexie** store bootstrap; the
  **repository + outbox** skeleton (no real entities yet) and a **sync-status**
  UI shell; routing; base layout; centralised app config (name, API base URL).
- `apps/api`: NestJS bootstrap; health endpoint; global validation pipe; config
  module (env-driven, no secrets in repo); ORM (Prisma/TypeORM) connected to
  Postgres with a first migration; structured logging; OpenAPI setup.
- `packages/shared`: Zod schema + TS type scaffolding; **clinical enums**
  placeholders (antigen, role, encounter type) ready for later phases.
- `infra/`: `docker-compose.yml` for dev (postgres, redis, api, web, worker
  stub); `.env.example` documenting required vars.
- Tooling: ESLint + Prettier, `tsc`/`astro`-equivalent typecheck, **Vitest**
  (unit), **Playwright** (e2e incl. offline harness), **supertest** (API).
- CI (GitHub Actions): install, lint, typecheck, test, build, build images.

**Out of scope**

- Any clinical feature, auth logic, or real entity (Phases 1+).
- The real sync protocol implementation (Phase 3 — only the *shell* here).
- Production deploy / hardening (Phase 10).
- Branding/visual design beyond a minimal accessible base (final name Q8).

## 4. Task breakdown

1. **Monorepo** — pnpm workspaces; root scripts (`dev`, `build`, `lint`,
   `typecheck`, `test`, `e2e`); shared tsconfig base.
2. **`packages/shared`** — set up Zod + types; export a couple of placeholder
   enums/schemas consumed by both apps to prove the wiring.
3. **`apps/api`** — NestJS app; `GET /api/v1/system/health`; env config; ORM +
   Postgres connection + initial migration; OpenAPI; structured logger; global
   validation/exception filter implementing the error model
   (`../architecture/api-design.md` §3).
4. **`apps/web`** — Vite React TS + Tailwind; router + `AppShell` layout;
   centralised config; **PWA**: manifest + service worker (app-shell precache);
   **Dexie** DB bootstrap; **repository layer** + **outbox** table skeleton
   (write-through, transactional) with a trivial demo entity to prove offline
   persistence; **sync-status** indicator component (states from
   `../architecture/offline-sync-design.md` §4, stubbed).
5. **Offline harness** — Playwright config that can toggle offline; one smoke
   e2e: load app, go offline, write the demo entity, reload, assert it persisted.
6. **`infra/`** — dev `docker-compose.yml` (postgres, redis, api, web, worker
   stub) + `.env.example`; `make`/pnpm scripts to bring it up.
7. **CI** — GitHub Actions: lint, typecheck, unit, e2e (headless), build, docker
   build; secret-scanning step.
8. **`devops/change_log/`** — create the directory + a README describing the
   per-phase entry convention.

## 5. Deliverables

- Buildable monorepo: `pnpm build` green across `web`, `api`, `shared` with no
  features.
- `apps/api` serves `/api/v1/system/health`; connects to Postgres; one migration.
- `apps/web` installs as a PWA, works offline for the demo entity, shows a
  (stubbed) sync-status indicator.
- `packages/shared` consumed by both apps.
- Dev `docker-compose` brings up the full local stack; `.env.example` documents
  vars (no secrets committed).
- CI pipeline green (lint, typecheck, unit, e2e smoke, build, image build,
  secret scan).
- Change-log entry + `devops/change_log` convention README.

## 6. Acceptance / exit criteria

- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm e2e`, `pnpm build` all green.
- [ ] API health endpoint returns OK against the Dockerized Postgres.
- [ ] **Offline smoke e2e passes**: write persists across offline reload via
      Dexie + outbox.
- [ ] PWA is installable; app shell loads offline.
- [ ] No secrets in the repo; `.env.example` documents all required vars.
- [ ] Shared package is imported by both apps (no client/server type drift).
- [ ] **Exit gate:** owner reviews the scaffold, monorepo layout, and the
      offline repository/outbox skeleton before Phase 1.

## 7. Governance & guardrails

- **No secrets committed**; secret-scan in CI must pass.
- **No clinical features** — scaffold ships no patient data paths.
- Establish the **change-log** convention now (Definition of Done #5).
- Centralise app name/URLs in one config (rename = one edit; Open question Q8).

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| PWA/service-worker caching bugs bite later phases | Get the offline app-shell + Dexie skeleton right and tested *now*, before features |
| Monorepo tooling friction | Use pnpm workspaces with a shared tsconfig; document root scripts |
| ORM/migration choice churn | Decide Prisma vs TypeORM in this phase and commit; first migration locks it |
| Offline e2e flakiness | Build a reliable Playwright offline harness in Phase 0 (it's reused every phase) |
| Over-scaffolding | Only a demo entity to prove wiring; real entities arrive in their phases |

## 9. Hand-off

Phase 1 consumes: the NestJS app + ORM + migrations, the shared schema package,
the PWA shell + Dexie repository/outbox skeleton, the offline e2e harness, and
CI — into which authentication, RBAC, facilities, and staff accounts are built.
