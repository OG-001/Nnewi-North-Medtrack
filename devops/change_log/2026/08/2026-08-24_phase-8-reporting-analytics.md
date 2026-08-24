# Phase 8: reporting and analytics

| Field  | Value                           |
|--------|---------------------------------|
| Date   | 2026-08-24                      |
| Time   | 15:24 WAT                       |
| Author | Implementation                  |
| Phase  | 8, Reporting and analytics      |
| Module | 5, Reporting and Analytics      |

## Summary

Phase 8 turns a computed month into a **submitted NHMIS return**: generated from
source rows, drillable to those rows, reviewed and locked by the officer-in-charge,
exportable to DHIS2, and rolled up across the LGA.

The central move is that the aggregation engine now lives in
`packages/shared/src/reporting.ts` and is the **only** implementation. The PWA
computes a facility's month on-device for offline use, and the hub computes the
locked report and the LGA rollup, both by calling the same function. The client's
own copy in `apps/web/src/lib/reporting.ts` has been deleted. A facility figure
that disagrees with the LGA figure for the same month is the kind of discrepancy
that ends trust in a reporting system, and two implementations guarantee it
eventually.

What shipped:

- **Aggregation** over registrations, attendance, ANC (including ANC1 and ANC4+
  contact ordinals), delivery outcomes, immunization by antigen, the Penta1 to
  Measles1 dropout, fully immunized children, and referrals.
- **Drill-down**: every counted figure carries the ids of the rows behind it, and
  `GET /reports/monthly/:id/figures/:key` returns those rows. A percentage names
  the figures it derives from instead, because it has no rows of its own.
- **Review and lock**: a draft is recomputed on every read, so a late-syncing
  device is still counted; locking freezes the figures. A correction after lock
  becomes an **adjustment**, never an overwrite.
- **Export**: CSV and a DHIS2 `dataValueSet`, with adjustments applied.
- **LGA rollup**: locked reports only, summed, with coverage reported.
- **PWA**: the Reports page now uses the shared engine and gains a submission
  panel showing draft or locked status, the lock action, and hub exports.

## Decisions taken

1. **A draft is recomputed on every read; a locked report is not.** Devices sync
   late by design, so a draft cached at generation time would under-report.
   Locking is the moment the number stops moving, which is what makes it
   submittable.

2. **Corrections after lock are adjustments, not edits.** An NHMIS return is
   submitted upward. If the facility's copy were silently rewritten, a later
   discrepancy with the LGA's copy would be unexplainable. The submitted figure
   stays visible next to the correction and its reason.

3. **A rolled-up percentage is recomputed, never averaged.** Averaging facility
   percentages weights a facility with three doses the same as one with three
   hundred. The rollup sums the underlying counts and recomputes. There is a test
   for exactly this: two facilities at 20% and 50% dropout roll up to 47%, not to
   the 35% an average would give.

4. **The rollup reports its own coverage.** It returns `facilitiesIncluded`,
   `facilitiesDraft` and `facilitiesTotal`, so a rollup covering 3 of 76
   facilities cannot be read as an LGA figure.

5. **Unmapped DHIS2 elements are named in the export.** Until the LGA supplies
   its UID mapping (Open question Q4), `dataElement` carries our own key. The
   payload lists every unmapped element so a partial mapping cannot be handed to
   DHIS2 as though it were complete.

6. **Fully immunized child is a documented proxy** (BCG, Penta 3, Measles 1), and
   the figure carries that note in its own payload. It must be confirmed against
   the current NPHCDA definition before the pilot, which relates to Q2.

## A defect found by this phase's tests

The JWT guard read `claims.facilityScope ?? []`. An LGA-wide scope is `null`, and
`null ?? []` is `[]`, which means "authorised for no facilities". Every
cross-facility role, `lga_authority` and `system_admin`, was therefore denied
everything instead of granted oversight.

It failed closed, which is why nothing had caught it: no error, no alarm, the
data was simply absent. It surfaced only when the LGA rollup test asked an LGA
officer for a rollup and got a 403.

Fixed in `apps/api/src/common/guards/jwt-auth.guard.ts`, with
`apps/api/test/principal-scope.test.ts` asserting that `null` and `[]` stay
distinct. A missing claim still falls back to the restrictive `[]`.

## Deviations from the plan

1. **No PDF export.** The scope names CSV, PDF and a DHIS2 file. CSV and DHIS2
   are built; PDF would add a rendering dependency to the hub for a format
   neither NHMIS submission nor DHIS2 import needs. Raised rather than dropped:
   if the LGA wants a printable return, it is a small addition.

2. **The Oversight page still computes its LGA view on-device** from whatever
   that device holds, rather than reading `GET /reports/lga`. The hub rollup is
   built and tested, and it is the one that correctly excludes drafts. Wiring the
   page to it is a small follow-up, and until then the two can disagree.

3. **Dashboards are the existing pages**, not new analytics screens. Coverage,
   dropout, ANC attendance and queue throughput are all present across the
   Reports, Immunization, Maternal and Oversight pages. No new dashboard was
   added, because the plan's dashboard content already exists.

## Open questions surfaced

- **Q4** (DHIS2 mapping) still open, and now has a concrete shape: a
  `DHIS2_ELEMENT_MAP` of our keys to DHIS2 UIDs, plus an org-unit mapping.
- **Q2** (immunization schedule) gains a dependent: the fully-immunized-child
  definition above.
- **New:** the reporting month is bounded in UTC. A facility working late on the
  last day of a month is unaffected in WAT (UTC+1), but this should be an
  explicit facility timezone before any deployment outside WAT.

## Files changed

| File                                            | Change type |
|-------------------------------------------------|-------------|
| `packages/shared/src/reporting.ts`              | added       |
| `packages/shared/test/reporting.test.ts`        | added       |
| `packages/shared/src/index.ts`                  | modified    |
| `apps/web/src/lib/reporting.ts`                 | deleted     |
| `apps/api/prisma/schema.prisma`                 | modified    |
| `apps/api/src/reports/reports.service.ts`       | added       |
| `apps/api/src/reports/reports.controller.ts`    | added       |
| `apps/api/src/common/guards/jwt-auth.guard.ts`  | modified    |
| `apps/api/test/reports-integration.test.ts`     | added       |
| `apps/api/test/principal-scope.test.ts`         | added       |
| `apps/api/test/e2e-sync.sh`                     | modified    |
| `apps/web/src/lib/reports-api.ts`               | added       |
| `apps/web/src/components/ReportHubPanel.tsx`    | added       |
| `apps/web/src/pages/Reports.tsx`                | modified    |

## Change details

### `apps/api/src/common/guards/jwt-auth.guard.ts`

```diff
@@ -33,7 +33,11 @@
         roles: claims.roles ?? [],
-        facilityScope: claims.facilityScope ?? [],
+        // `null` is meaningful: it is LGA-wide scope for an oversight role, and
+        // it must survive. `?? []` would collapse it to "no facilities", which
+        // denies an LGA officer everything instead of granting them oversight.
+        // A missing claim still falls back to the most restrictive value.
+        facilityScope: claims.facilityScope === undefined ? [] : claims.facilityScope,
```

### `apps/web/src/lib/reporting.ts`

Deleted. Its contents moved to `packages/shared/src/reporting.ts` so the PWA and
the hub compute figures with one implementation. `apps/web/src/pages/Reports.tsx`
now imports from `@phc/shared`.

### `apps/api/test/e2e-sync.sh`

The baseline isolation check asserted facility B held zero rows, which was only
true while facility B had no data of its own. It now asserts the actual property.

```diff
@@ -91,3 +91,8 @@
-chk "facility B baseline excludes facility A rows" "$NB" "0"
+# Not "B is empty": B has its own rows. The property is that none of THIS run's
+# facility-A rows appear in B's baseline.
+chk "facility B baseline excludes facility A rows" "$NB" "clean"
```

## Verification

| Suite                                 | Result          |
|---------------------------------------|-----------------|
| `pnpm lint`, `pnpm typecheck`         | clean           |
| `packages/shared` (25 new reporting)  | 52 passed       |
| `apps/api` (14 reports, 5 scope)      | 70 passed       |
| `apps/web`                            | 11 passed       |
| Playwright offline                    | 7 passed        |
| `apps/api/test/e2e-sync.sh`           | 18 passed, twice |

The lock workflow was additionally exercised through the browser: generate,
review, lock, and the panel switching to Locked with the hub export links intact.
Captured in `docs/evidence/screenshots/18` and `19`.
