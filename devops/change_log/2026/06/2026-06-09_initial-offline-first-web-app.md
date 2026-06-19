# 2026-06-09 — Initial offline-first web app (Phase 0 scaffold + MVP/clinical modules, frontend)

**Author:** Build model
**Phases touched:** 0 (foundation), and the *frontend* of 1, 2, 4, 5, 6, 8, 9
**Status:** In review

---

## What shipped

A buildable pnpm monorepo and a working, **offline-first PWA** (`apps/web`) plus a
shared domain package (`packages/shared`), styled with the requested **dark-green**
brand palette.

- **Monorepo / scaffold (Phase 0):** pnpm workspaces (`apps/web`, `packages/shared`),
  shared `tsconfig.base.json`, Vite + React + TS + Tailwind, `vite-plugin-pwa`
  (installable, app-shell precache, dark-green theme), ESLint, root scripts.
  `pnpm typecheck` and `pnpm build` are green; preview serves and all assets 200.
- **Shared domain (`packages/shared`):** clinical enums, RBAC permission matrix,
  client-generated UUIDs + offline-safe MRN scheme (data-model §6), Naegele EDD &
  gestational-age utilities (§3.5), the configurable **EPI immunization schedule**
  engine (§4.1) and **ANC model** engine (§4.2, WHO-8 / focused-4), centralised
  app config (codename PHC-Track, §11).
- **Offline data layer:** Dexie/IndexedDB store mirroring the entities; a
  **write-through repository** that persists row + **outbox** + audit + `rev` bump
  in one transaction (offline-sync-design §2); a **sync-status store** implementing
  the §4 state machine (Offline / Pending(n) / Syncing / Synced / Conflict); demo
  seed data (2 PHCs, staff per role, pregnancies, children, today's queue).
- **Identity & RBAC (Phase 1, frontend):** local username+PIN session (offline
  re-auth), role-based nav/action gating from the permission matrix, facility
  data-scope, audit on login.
- **Patient registration & EMR (Phase 2):** fast local search (phone/name/MRN),
  registration with **duplicate detection** and offline MRN, patient summary with
  prominent allergy/chronic alerts, encounter recording (vitals/dx/rx), timeline.
- **Maternal/ANC (Phase 4):** start pregnancy → auto EDD + ANC schedule + risk
  flags; ANC register, **defaulter list**, ANC visit recording (reuses EMR vitals).
- **Immunization (Phase 5):** per-child EPI card, due/overdue/recall lists,
  catch-up schedule generation, dose recording with batch/lot/site.
- **Queue (Phase 6):** today's queue, triage priority ordering, station
  transitions (registration→vitals→consultation→pharmacy), attendance counts.
- **Reporting (Phase 8):** NHMIS-aligned monthly figures computed from source rows
  (registrations, OPD, ANC, delivery, immunization incl. **Penta1→Measles1
  dropout**, referrals), CSV + DHIS2-style export files.
- **Admin (Phase 9):** facilities CRUD, staff status, schedule/config viewer,
  searchable **audit log**, sync & system-health panel.
- **Infra/devops:** `infra/.env.example`, dev `docker-compose.yml` + web Dockerfile
  (Nginx) for self-hosting; this change-log convention.

## Decisions taken

- **Frontend-first delivery.** The plan's NestJS + PostgreSQL **sync hub** (Phases
  1 server-side, 3, 7 dispatch, 8 server) is **not yet built**. The PWA is the
  product's core differentiator (works offline by design); it runs fully on-device
  against IndexedDB. All boundaries are structured so the hub drops in later:
  `packages/shared` is provider-neutral; the sync store isolates push/pull behind
  `syncNow()`; the reporting engine is a pure function ready to move server-side.
- **Auth is local/demo (PIN).** Real authn/z, password hashing, device enrolment,
  and the cross-facility audited access path remain Phase 1 (server) work.
- **Brand:** dark green (`brand.900 = #14532d`) per product-owner request; set as
  the single Tailwind palette + PWA theme colour.

## Deviations from the plan

- SMS dispatch (Phase 7) and the real sync protocol (Phase 3) are **stubbed at the
  boundary**, not implemented — defaulter lists and a "queued offline" path exist,
  but no provider call is made.
- No automated test suite yet (Phase 0 called for Vitest/Playwright incl. an
  offline e2e). Verified via `typecheck` + `build` + manual serve. **Add the
  offline e2e harness before the pilot** (it's reused every phase).

## Newly-surfaced open questions

- Confirm hosting target (Q6) to finalise the Docker/compose topology for the hub.
- The seed EPI schedule and ANC models still carry the "verify vs. current
  NPHCDA/WHO" flag (Q2/Q3) — surfaced in the Admin → Schedules tab.

## Next

1. Stand up `apps/api` (NestJS + Prisma + Postgres) and implement the §3 sync
   pull/push; swap the stub in `apps/web/src/lib/sync.ts`.
2. Add Vitest unit tests for `packages/shared` engines and a Playwright **offline
   e2e** for register→record→reload.
3. SMS adapters (Africa's Talking / Termii) behind the existing provider-neutral seam.
