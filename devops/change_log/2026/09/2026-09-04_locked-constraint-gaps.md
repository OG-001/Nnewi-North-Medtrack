# Two locked constraints were not implemented: editable schedules, cross-facility access

| Field  | Value                                    |
|--------|------------------------------------------|
| Date   | 2026-09-04                               |
| Time   | 15:08 WAT                                |
| Author | Implementation                           |
| Phase  | 9 (admin/config) and 2 (patient access)  |
| Module | 1 Patient Registration, 10 Admin         |

## Summary

An audit against the plan found that two of the fourteen **Global Constraints**
in `CLAUDE.md` had no implementation. Both are now built, tested, and verified
through the browser.

**Constraint 9, "schedules and templates are configuration, not code."** SMS
templates were editable. The immunization schedule and the ANC contact model
were not: the admin Schedules tab rendered `DEFAULT_EPI_SCHEDULE` and
`ANC_MODEL_ITEMS` from source as a read-only table, behind a `schedule.edit`
permission that granted nothing. When NPHCDA guidance changed, the only way to
follow it was a code release.

**Constraint 8, "cross-facility access is explicit, reason-prompted, and
audited."** There was no implementation at all. `auditSensitiveAccess()` existed
in `apps/web/src/db/repository.ts` with **no callers**, there was no LGA-wide
patient index, and a patient who attended a different PHC simply could not be
found. Continuity of care was not possible, and the audited path the NDPA
position depends on did not exist.

## What shipped

**Editable clinical configuration**

- `packages/shared/src/app-config.ts`: the config contract with validation both
  sides use. A schedule with a negative age, a duplicate dose label, or a
  minimum age after the recommended age is rejected.
- Hub: `AppConfig` model, `GET /config`, `GET /config/:key`, `PUT /config/:key`.
  Admin only, validated, versioned, and audited as `config_changed`. Falls back
  to the shipped defaults when nothing has been saved, so a fresh deployment
  schedules correctly.
- Device: `apps/web/src/lib/clinical-config.ts` caches the config locally and is
  primed at start-up, so an offline device schedules against the configured
  schedule rather than only the built-in one. Config is deliberately not synced
  through the outbox: it is hub-authoritative and flows one way.
- `computeAncSchedule` gained an optional contact-list override; the
  immunization engine already accepted a schedule.
- `apps/web/src/components/ScheduleEditor.tsx` replaces the read-only table.

**Cross-facility patient access**

- Hub: `GET /patients/index` searches the LGA and returns identity fields only,
  never clinical content, and only the year of birth rather than the full date.
  `POST /patients/:id/access` requires a reason of at least 10 characters for
  another facility's record and writes the `sensitive_access` audit event
  **before** returning any data.
- Device: `LgaPatientSearch` is a deliberate, separate action rather than a
  widening of the normal search, with the reason prompt and a read-only view.

## Decisions taken

1. **The index exposes year of birth, not date of birth.** It is enough to
   disambiguate two people with the same name and is less identifying. The test
   asserts the full date never appears.

2. **A minimum search length of three characters**, so the LGA-wide index cannot
   be enumerated with a single letter.

3. **The audit event is written before the record is returned.** The record of
   an access must not depend on the response succeeding.

4. **An in-scope read is not a sensitive access.** Routine care at your own
   facility must not fill the audit log with noise, or the real events become
   invisible. LGA-wide roles are likewise not an exception path: their scope
   genuinely is the LGA.

5. **Config edits require connectivity.** The hub is authoritative for config,
   so an offline device reads and caches but never edits. Editing offline would
   need a merge policy for a value that must be identical everywhere.

## Four defects found while verifying this

These surfaced by driving the UI, not by reading code, and all four are the same
shape: **the client trusted that rows arriving from the hub were complete.**

1. **One malformed row blanked the entire patient list.** The list sorts on
   `created_at`; a row without it threw, and the whole screen rendered nothing.
2. **A row without `category_tags` crashed the same screen**, because the list
   maps over it.
3. **Typing in the search box crashed the page**, because the filter called
   `.toLowerCase()` on a possibly-absent `phone_primary`.
4. **`initials()` and `displayName()` threw** on a record missing a name.

Fixed in three layers rather than at each call site: `applyChange` now completes
the common columns and defaults the list-valued fields on the way in; the
display helpers degrade to a dash or a placeholder; the list sort and filter are
null-safe. Ten regression tests cover it.

The immediate cause was partial payloads pushed by earlier API tests, which is
not how the repository layer writes rows. But a real deployment has the same
exposure from a device on an older build, and losing an entire clinic screen to
one bad row is not an acceptable failure mode.

## Two defects in the project's own tooling

**The secret scanner could not detect leaked database credentials.** Its Postgres
pattern used `\s` inside a bracket expression, which is not portable and behaved
inconsistently between invocations. The scanner reported "clean" while a planted
`postgresql://user:password@host` went undetected. Now uses `[:space:]`, and is
verified in both directions: it catches a planted credential and does not flag
`${VAR}` interpolation.

**The API test suite was tripping the API's own rate limiter.** The suite makes
far more than 120 requests a minute, so tests failed with `body.changes is not
iterable` rather than anything meaningful. The limit is now configurable
(`RATE_LIMIT_PER_WINDOW`), which is right for production too, the test helpers
assert the response status with the real body, and `fileParallelism` is off for
the live-hub suites, which share one database and cannot meaningfully assert on
a moving change feed while another file is pushing to it.

## Deviations from the plan

`api-design.md` section 5 also lists CRUD endpoints for `/facilities`, `/users`
and `/audit`, which remain unbuilt. Staff and facility administration is still
device-local. This matters for Phase 9 completeness and is recorded rather than
silently skipped: a staff account created on one device does not exist at the
hub, so it cannot authenticate there.

## Open questions surfaced

- **New:** the hub's demo database now holds several thousand synthetic patients
  from test runs. It needs truncating before it is used for anything but
  development.
- Q2 (immunization schedule) is now actionable: the schedule can be corrected
  through the UI as soon as someone qualified confirms it.

## Verification

| Check | Result |
|-------|--------|
| `pnpm lint`, `pnpm typecheck`, `pnpm build` | clean |
| shared / web / api unit and integration | 66 / 25 / 80 passed |
| API suite, three consecutive runs | 80 passed each time |
| `apps/api/test/e2e-sync.sh` | 18 passed |
| Playwright offline | 7 passed |
| `infra/scripts/secret-scan.sh` | clean, and catches a planted credential |

Verified through the browser: an admin edits BCG from 0 to 3 days, the hub
stores it at version 1, and an invalid edit is refused with the reason. A nurse
at one PHC finds a patient registered at another, cannot open the record until a
reason is given, and the access appears in `audit_event` as `sensitive_access`
with her identity and reason.
