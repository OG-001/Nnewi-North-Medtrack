# Patient duplicate merge and the conflict-review queue

| Field  | Value                          |
|--------|--------------------------------|
| Date   | 2026-09-23                     |
| Time   | 16:34 WAT                      |
| Author | Implementation                 |
| Phase  | 9, Admin dashboard and staff   |
| Module | 10 Admin Dashboard, 1 Patient  |

## Summary

An audit of Phase 9 against its own acceptance criteria found two of them with no
implementation. Both are now built.

**Patient duplicate merge** (`docs/implementation/phase-9-admin-staff-management.md`
task 4; acceptance: "Merging two patients preserves all history under one MRN, is
fully audited, and corrects double-counting in reports"). Only the permission
string `patient.merge` existed. Duplicate *detection* at registration was already
there, so staff were warned about a duplicate and then had no way to fix one.

Two records for one person is a clinical safety problem rather than an
untidiness: a woman's antenatal history split across two records means the
clinician sees half of it, and she is counted twice in the monthly return.

**The conflict-review queue** (task 6; acceptance: "an admin can resolve an
escalated conflict"). The endpoints existed from Phase 3 and nothing called them.
The admin dashboard displayed a conflict *count* and offered no way to review or
resolve one, so an escalated contradiction sat in the database unseen.

## What shipped

- `PatientMerge` model, `GET /api/v1/patients/:id/duplicates`,
  `POST /api/v1/patients/merge`, `GET /api/v1/patients/merge/history`.
- A merge re-points every child record, fills blanks on the survivor from the
  duplicate, soft-deletes the duplicate as a tombstone carrying `merged_into`,
  and writes a change-log row per move so devices converge.
- `apps/web/src/components/MergeTool.tsx`: a Duplicates tab with side-by-side
  review, the evidence for each candidate, how much history would move, and a
  mandatory reason.
- `apps/web/src/components/ConflictQueue.tsx`: the escalated conflicts with both
  values side by side, in the Sync and health tab.

## Decisions taken

1. **Merging is `facility_admin` only, not `system_admin`.** That is what the
   permission matrix already said, and it is right:
   `.claude/rules/rbac-and-scope.md` section 3 holds that a system administrator
   has no default clinical-data edit, and a merge is very much one. The tests
   assert a system administrator is refused.

2. **Same facility only.** A cross-facility merge would move one PHC's clinical
   history into another's data scope, which is a privacy decision rather than a
   data-quality one. The LGA-wide index already covers finding a patient who has
   moved.

3. **Nothing is hard-deleted.** The duplicate becomes a soft-deleted tombstone
   pointing at the survivor, so the merge is reversible in evidence even though
   the application offers no unmerge (Global Constraint 3).

4. **Blanks on the survivor are filled from the duplicate.** A merge must not
   lose an address or a phone number that only the duplicate carried. The
   survivor keeps its own MRN, because that is the number on the patient's card.

5. **Locked reports are not rewritten.** Draft reports recompute from source on
   every read and correct themselves. A locked report is immutable by design, so
   the merge response returns the affected locked periods and the UI tells the
   administrator to file an adjustment. Silently changing a submitted figure
   would be worse than the double-count.

6. **A reason of at least 10 characters is required.** It is what an auditor
   reads a year later.

## A defect found while verifying this

The duplicate matcher scanned a capped page of patients in memory, so the
duplicate was simply not found once a facility held more records than the cap.
**This is the same mistake made earlier in the LGA-wide patient index**, and
fixed there the same way: filter in the database, not in memory. Worth recording
as a pattern rather than as two separate incidents.

A second, smaller one: re-merging an already-merged record returned `404 Not
found` because the soft-delete check ran before the already-merged check. It now
returns a `400` naming the record it was merged into and when.

## Deviations from the plan

Three Phase 9 items remain unbuilt and are recorded rather than quietly skipped:

- **Queue stations configuration** (task 3). The immunization schedule, ANC model
  and SMS templates are editable; stations are not.
- **Audit log export** (task 5). The viewer searches and filters; it does not
  export.
- **Per-facility permission toggles** (task 2). Roles are assignable; the
  bounded per-facility overrides are not built.

`apps/web/src/pages/Admin.tsx` also still lists facilities from the local seeded
registry rather than `GET /facilities`.

## Open questions surfaced

None new. The question recorded on 2026-09-04, whether a facility administrator
may reset another administrator's PIN, was answered by the privilege-escalation
fix the same day.

## Files changed

| File                                             | Change type |
|--------------------------------------------------|-------------|
| `apps/api/prisma/schema.prisma`                  | modified    |
| `apps/api/src/patients/merge.service.ts`         | added       |
| `apps/api/src/patients/merge.dto.ts`             | added       |
| `apps/api/src/patients/patients.controller.ts`   | modified    |
| `apps/api/src/patients/patients.module.ts`       | modified    |
| `apps/api/test/patient-merge.test.ts`            | added       |
| `apps/web/src/lib/patients-api.ts`               | modified    |
| `apps/web/src/lib/conflicts-api.ts`              | added       |
| `apps/web/src/components/MergeTool.tsx`          | added       |
| `apps/web/src/components/ConflictQueue.tsx`      | added       |
| `apps/web/src/pages/Admin.tsx`                   | modified    |

## Change details

### `apps/api/src/patients/merge.service.ts`

The duplicate matcher, after the in-memory scan was found to miss duplicates:

```diff
-    const others = await this.prisma.syncedEntity.findMany({
-      where: { entityType: "patient", facilityId: patient.facilityId, deletedAt: null },
-      take: 2000,
-    });
+    // Filtered in the database, not scanned in memory. A capped in-memory page
+    // silently misses the duplicate once a facility holds more patients than
+    // the cap, which is exactly the register this tool exists for.
+    const rows = await this.prisma.$queryRaw<...>`
+      SELECT id, payload, created_at FROM synced_entity
+      WHERE entity_type = 'patient' AND facility_id = ${patient.facilityId}
+        AND deleted_at IS NULL AND id <> ${patientId}
+        AND ( (payload ->> 'phone_primary') = ${phoneMatch} OR ... )
+      LIMIT 20`;
```

Check order, so a re-merge explains itself:

```diff
-    if (!merged || merged.deletedAt) throw ApiError.notFound("Duplicate patient not found");
+    if (!merged) throw ApiError.notFound("Duplicate patient not found");
+    const already = await this.prisma.patientMerge.findUnique({ where: { mergedId } });
+    if (already) {
+      throw ApiError.validation(
+        `That record was already merged into ${already.survivingId} on ...`,
+      );
+    }
+    if (merged.deletedAt) throw ApiError.notFound("Duplicate patient not found");
```

### `apps/web/src/pages/Admin.tsx`

```diff
+  { key: "duplicates", label: "Duplicates", perm: "patient.merge" },
   { key: "audit", label: "Audit log", perm: "audit.view" },
@@
+      {tab === "duplicates" && <MergeTool />}
@@ HealthTab
       </div>
+      <ConflictQueue />
     </div>
```

## Verification

| Check | Result |
|-------|--------|
| `pnpm lint`, `pnpm typecheck`, `pnpm build` | clean |
| shared / web / api suites | 66 / 25 / 121 passed |
| `apps/api/test/patient-merge.test.ts` | 13 passed |
| `apps/api/test/e2e-sync.sh` | 18 passed |
| Playwright offline | 7 passed |
| `infra/scripts/secret-scan.sh` | clean |

Verified through the browser: an administrator searched for a duplicate, saw the
evidence and the history at stake, could not confirm without a reason, and the
merge moved one encounter and one pregnancy onto the surviving record. The
conflict queue renders in the Sync and health tab.
