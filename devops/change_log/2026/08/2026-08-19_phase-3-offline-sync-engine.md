# Phase 3 — Offline sync engine (sync hub)

**Date:** 2026-08-19
**Author:** Implementation
**Phase:** 3 — Offline sync engine (Module 9)
**Depends on:** Phase 2
**Status:** Implemented — pending owner sign-off on the §10 exit gate

---

## 1. What shipped

The `apps/api` workspace did not exist before this change; the hub half of the
platform is now built and running.

**Server (`apps/api`, NestJS + Prisma + PostgreSQL)**

- **Change-log ledger** (`change_log`) with a monotonic `server_seq`, written on
  every hub-side upsert/delete — `data-model.md` §3.10.
- **Sync endpoints** (`api-design.md` §4): `POST /sync/enroll`,
  `GET /sync/changes?since=&scope=&limit=`, `POST /sync/push`,
  `GET /sync/baseline?scope=&cursor=`.
- **Conflict resolution** per entity class (`offline-sync-design.md` §5) as a
  pure, independently-tested module (`src/sync/conflict.ts`): append-only events
  never overwritten, field-level LWW with non-overlapping merge for
  demographics, state-priority merge for workflow rows, hub-authoritative
  config, hub-mediated deletes.
- **Escalation**: identity-critical contradictions (DOB / sex / MRN) are flagged
  `needs_review`, written to a `conflict_queue`, and exposed through
  `GET /admin/conflicts` + `POST /admin/conflicts/:id/resolve`. Never dropped.
- **Auth** (Phase 1 server-side): facility-scoped PIN login with argon2 hashes,
  short-lived JWT access tokens, rotating refresh tokens, `@Roles()` + scope
  guards, and an audit event per login and per conflict resolution.
- **Scope enforcement**: a device may narrow its pull scope but never widen it;
  a push naming an out-of-scope `facility_id` is rejected. This is the
  server-side layer that `RUNNING.md` previously listed as *Deferred — Phase 3*.
- Uniform error envelope (`api-design.md` §3), health + sync-status endpoints,
  rate limiting.

**Client (`apps/web`)**

- `lib/api.ts` — typed hub client with transparent refresh-and-retry.
- `lib/sync-engine.ts` — the real protocol: push-before-pull cycles, watermark
  persistence, resumable paging, `in_flight` → `pending` recovery, idempotent
  re-send, and out-of-scope purge.
- `lib/sync.ts` — the simulated `setTimeout` drain is gone; the status store now
  reflects real cycles. **A missing or unreachable hub is not an error state**:
  the PWA stays fully usable offline and the outbox drains later.

**Shared (`packages/shared`)**

- `sync-protocol.ts` — wire types, the entity-class table, state-priority
  ladders, and identity-critical field lists, so client and server cannot drift.

## 2. Decisions taken

- **Entity storage is generic.** Synced clinical rows live in one
  `synced_entity` table with the `data-model.md` §2 common columns as real,
  indexed columns and the domain body as JSONB. Sync, scope, conflict detection
  and audit all key off the real columns.
- **`rev`, never wall-clock**, decides ordering (`offline-sync-design.md` §8).
  The hub stamps its own time on apply.
- **Usernames are unique per facility, not globally.** The demo roster has a
  `nurse` at each provisioned PHC, so login resolves the pair
  (username, facility).
- **`packages/shared` gained a CommonJS build.** It is now consumed by Node as
  well as Vite; `import.meta` was removed from `config.ts` so the package stays
  isomorphic, and the web app reads `VITE_API_BASE_URL` at its own call site.

## 3. Deviations from the plan

1. **Per-entity relational tables are not built.** `data-model.md` §3 describes
   a relational table per clinical entity; the hub stores them generically (see
   above). Everything Phase 3 owns works on this shape, but the relational
   projection that reporting aggregates need is **deferred to Phase 8**, which
   is the phase that actually consumes it. Recorded here rather than drifted.
2. ~~Baseline snapshot is not age-bounded.~~ **Closed.** The baseline now
   applies a per-entity recency window (`BASELINE_WINDOW_DAYS`): the patient
   roster and active pregnancies come in full, queue entries reach back a week,
   encounters/referrals a year, ANC and immunization history longer. Deep
   history is left for lazy fetch.
3. **No BullMQ/Redis jobs yet.** Redis is in the compose file but unused until
   Phase 7 (SMS) needs it.

## 4. Tests

- **21 unit tests** (`apps/api/test/conflict.test.ts`) covering every conflict
  class in §5 and every worked example in §6, including both regressions found
  during the build (below).
- **18 protocol tests** (`apps/api/test/e2e-sync.sh`) against a live hub +
  Postgres: scoped auth, enrolment, idempotent replay, cross-facility isolation
  in both directions, state-priority convergence, identity-critical escalation
  reaching the admin queue, RBAC, hub-authoritative config, scoped baseline.
  **18/18 green.**

Two real defects were caught by running the protocol against a live database,
not by the unit tests:

- **Replay bumped the rev on every retry.** The idempotency check compared
  `base_rev` to the server rev, but a re-send after a dropped response carries
  the *original* `base_rev`. Now compares content.
- **Postgres JSONB does not preserve key order**, so the `JSON.stringify`
  equality used for that comparison reported every replay as a change. Replaced
  with an order-insensitive deep equality.

Both now have regression tests.

## 5. Follow-up work completed after the first pass

- **Playwright offline e2e** (`apps/web/e2e/`, 7 tests, green): the app loads
  and signs in from cache with the network cut, patients registered offline
  survive a reload and a full airplane-mode cycle, several offline writes all
  persist (not just the last), the connectivity chip reports Offline →
  Pending(n), and a patient registered at one PHC is not visible at the other.
  These run against the **production build**, not the dev server — the offline
  guarantee is the service worker's, and `vite dev` does not emit one.
- **Hub sign-in wired** (`lib/hub-session.ts`): a successful local PIN login now
  opportunistically establishes a hub session, enrols the device, purges
  out-of-scope rows, and runs a first sync. Deliberately not awaited and never
  fatal — a nurse must never be locked out of a working local session because
  the hub is down.
- **Remaining sync triggers**: app focus / visibility change, a periodic timer
  while online with pending work, and service-worker Background Sync where
  supported (§3.3). Online-event and "Sync now" were already wired.
- **Bounded baseline** (deviation 2 above).

## 6. Resumability & volume — the last §10 items

Both are now automated, which closes the mechanical half of the exit gate.

**Server side** (`apps/api/test/sync-integration.test.ts`, 6 tests, live hub):

- **Resumable pull** — 60 changes drained seven at a time, resuming only from
  the committed watermark at each step; every row arrives exactly once, with no
  gaps and no duplicates.
- **Unacknowledged re-send** — an identical batch pushed twice leaves the feed
  head unmoved: the replay is absorbed, not appended.
- **Poison isolation** — one out-of-scope change inside a batch of eleven is
  rejected alone; the other ten apply, so a bad row cannot block the outbox.
- **Monotonic `server_seq`** across the whole feed (ordering is the hub's, never
  a device clock).
- **Volume/perf** — a ~500-row facility roster pushed, then the full baseline
  paged. Measured on a ~3,000-row ledger: **15 pages, ~460 ms total, slowest
  page 40 ms**, comfortably inside the `tech-stack-recommendation.md` §4 budget.
- **Steady state** — an up-to-date device pulls zero rows in under a second.

**Client side** (`apps/web/src/lib/__tests__/sync-engine.test.ts`, 7 tests):

- Entries stranded `in_flight` by a crash revert to `pending` and re-send;
  `acked` and parked `conflict` rows are left alone; recovery is idempotent.
- The **watermark never moves backwards** — rewinding would re-apply changes,
  and skipping ahead past a gap would lose them.
- Scope purge removes out-of-scope rows and is a no-op for LGA-wide scope.

Two design notes worth keeping: the live-hub suite asserts **relative to the
feed head measured at the start of each test**, because it runs against a
long-lived database and absolute counts would pass once and fail thereafter; and
it **skips as a whole when no hub answers** (probed in `test/global-setup.ts`
before collection), so `pnpm test` needs no infrastructure.

## 7. Still not done (carried forward)

- **A known limitation of the offline harness:** Chromium resets
  `navigator.onLine` to true after a service-worker-served navigation, so
  `setOffline` is only observable to the page between navigations. The reload
  tests therefore prove cache-served startup and IndexedDB durability — the
  actual no-loss requirement — rather than asserting the connectivity flag
  across a reload. Worth revisiting with request-level interception.
- **Two-device concurrency is tested at the protocol layer, not through two
  real browsers.** The conflict rules are covered 21 ways in unit tests and end
  to end against a live hub; a genuine two-device Playwright scenario would be
  stronger.
- **Owner sign-off on the §10 matrix.** Every item is now automated and green,
  but the exit criterion is an owner signing it off — that remains open, and it
  is the gate that makes the pilot MVP (0,1,2,3,6) viable.

## 8. Open questions

- **Q6 (hosting)** unchanged.
- **New:** should the baseline be bounded by *recency* (e.g. active patients +
  12 months of history) or by *count*? Needs a number from the pilot facility
  before Phase 10.
