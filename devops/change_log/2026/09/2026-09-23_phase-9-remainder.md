# Phase 9 remainder: queue stations, audit export, per-facility permissions

| Field  | Value                          |
|--------|--------------------------------|
| Date   | 2026-09-23                     |
| Time   | 16:50 WAT                      |
| Author | Implementation                 |
| Phase  | 9, Admin dashboard and staff   |
| Module | 10 Admin Dashboard, 6 Queue    |

## Summary

The last three Phase 9 tasks, recorded as unbuilt in
`devops/change_log/2026/09/2026-09-23_patient-merge-and-conflict-review.md`.

- **Queue stations** are configuration (task 3). A PHC with no pharmacy switches
  it off; one that calls vitals something else relabels it. The queue flow
  follows the configured order and skips a station that is switched off.
- **Audit-log export** (task 5): scope-enforced CSV, and the export is itself
  recorded in the trail.
- **Per-facility permission toggles** (task 2), enforced on the hub as well as
  in the UI.

With these, every Phase 9 task has an implementation.

## Decisions taken

1. **Stations are relabelled, reordered and switched off, not invented.**
   `QueueStation` is a typed enum stored on every queue row, so a genuinely new
   station needs a code change and a local-store migration. Removing one is
   refused outright: a queue entry already recorded at that station would have
   nowhere to belong. This covers what a PHC actually needs and is recorded as a
   deliberate limit rather than presented as full freedom.

2. **A facility may only withdraw a permission, never add one.**
   `.claude/rules/rbac-and-scope.md` section 3 holds that per-facility
   permissions "can never exceed the role matrix", so the config is a deny list
   and `can()` applies it *after* the grant. Nothing in this configuration can
   give a records clerk a clinical permission the matrix withholds, and there is
   a test asserting exactly that.

3. **The withdrawal is enforced on the hub, not only in the UI.** That is the
   difference between a workflow hint and a control.
   `FacilityPermissionsService.assert` guards the two endpoints that map to a
   toggleable permission: config writes (`schedule.edit`) and patient merge
   (`patient.merge`). The remaining hub endpoints are role-gated by design, so a
   withdrawal of, say, `prescribe` is a client-side workflow control. Stated
   plainly rather than implied to be universal.

4. **Exporting the audit trail is itself auditable.** It takes a copy of who did
   what out of the system, so the trail should show it happened. The export is
   capped at 10,000 rows: an unbounded export of a year's trail is not what an
   investigation needs, and narrowing the window is the right answer.

## A defect found while verifying this

The `audit_exported` event was written with **no facility**, and a
facility-scoped viewer cannot see facility-less events, by the scoping rule
established when the viewer was built. So the record existed and the
administrator who performed the export could not see their own action in their
own log.

The event is now stamped with the facility the export covered.

## Deviations from the plan

A withdrawal of a permission that maps to no hub endpoint is enforced in the
client only. See decision 3.

`apps/web/src/pages/Admin.tsx` still lists facilities from the local seeded
registry rather than `GET /facilities`, unchanged from the previous entry.

## Open questions surfaced

None.

## Files changed

| File                                                   | Change type |
|--------------------------------------------------------|-------------|
| `packages/shared/src/app-config.ts`                    | modified    |
| `packages/shared/src/permissions.ts`                   | modified    |
| `packages/shared/test/app-config.test.ts`              | modified    |
| `apps/api/src/common/facility-permissions.service.ts`  | added       |
| `apps/api/src/admin/audit.service.ts`                  | modified    |
| `apps/api/src/admin/audit.controller.ts`               | modified    |
| `apps/api/src/config/config.controller.ts`             | modified    |
| `apps/api/src/patients/patients.controller.ts`         | modified    |
| `apps/api/src/app.module.ts`                           | modified    |
| `apps/api/test/admin-phase9-remainder.test.ts`         | added       |
| `apps/web/src/lib/clinical-config.ts`                  | modified    |
| `apps/web/src/lib/session.tsx`                         | modified    |
| `apps/web/src/lib/admin-api.ts`                        | modified    |
| `apps/web/src/pages/Queue.tsx`                         | modified    |
| `apps/web/src/components/ScheduleEditor.tsx`           | modified    |
| `apps/web/src/components/AuditLog.tsx`                 | modified    |

## Change details

### `packages/shared/src/permissions.ts`

A withdrawal is applied after the grant, so the role matrix stays the ceiling.

```diff
-export function can(roles: Role[], permission: Permission): boolean {
-  return roles.some((r) => (ROLE_PERMISSIONS[r] ?? NONE).includes(permission));
-}
+export function can(
+  roles: Role[],
+  permission: Permission,
+  withdrawn: readonly Permission[] = [],
+): boolean {
+  if (withdrawn.includes(permission)) return false;
+  return roles.some((r) => (ROLE_PERMISSIONS[r] ?? NONE).includes(permission));
+}
```

### `apps/web/src/pages/Queue.tsx`

The flow is read from config, and a switched-off station is skipped.

```diff
-const STATION_FLOW: QueueStation[] = ["registration", "vitals", "consultation", "pharmacy"];
+function useStationFlow(): { flow: QueueStation[]; labelOf: (s: QueueStation) => string } {
+  const config = getQueueStations();
+  const active = activeStations(config);
+  ...
+}
@@ QueueColumn
-          const nextStation = STATION_FLOW[STATION_FLOW.indexOf(q.station) + 1];
+          // A station switched off is skipped: the next one is whatever comes
+          // after this station in the configured flow.
+          const nextStation = flow[flow.indexOf(q.station) + 1];
```

### `apps/api/src/admin/audit.service.ts`

```diff
+    const exportFacility =
+      q.facilityId ??
+      (principal.facilityScope?.length === 1 ? principal.facilityScope[0] : null);
     await this.prisma.auditEvent.create({
       data: {
         action: "audit_exported",
+        facilityId: exportFacility,
```

## Verification

| Check | Result |
|-------|--------|
| `pnpm lint`, `pnpm typecheck`, `pnpm build` | clean |
| shared / web / api suites | 81 / 25 / 133 passed |
| `apps/api/test/admin-phase9-remainder.test.ts` | 12 passed |
| `apps/api/test/e2e-sync.sh` | 18 passed |
| Playwright offline | 7 passed |
| `infra/scripts/secret-scan.sh` | clean |

Verified through the browser: an administrator relabelled Registration to "Front
desk" and switched Pharmacy off, the configuration saved, and the queue screen
then made no reference to Pharmacy. The audit viewer offers a CSV export. The
demo configuration was restored to its defaults afterwards.
