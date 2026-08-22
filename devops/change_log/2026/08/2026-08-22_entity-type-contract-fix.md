# Sync hub rejected every clinical record: entity_type contract fix

| Field  | Value                        |
|--------|------------------------------|
| Date   | 2026-08-22                   |
| Time   | 12:43 WAT                    |
| Author | Implementation               |
| Phase  | 3, follow-up defect fix      |
| Module | 9, Offline Sync Engine       |

## Summary

The sync hub rejected **every** clinical record pushed from a device. No patient
registered on a device has ever reached the hub since the hub was built.

The outbox writes `entity_type` values taken from `ENTITY_TYPE_BY_TABLE` in
`apps/web/src/db/repository.ts`, which are snake_case singular: `patient`,
`queue_entry`, `immunization_dose`. The sync protocol added in the Phase 3 work
was written against the **Dexie table names** instead: `patients`,
`queueEntries`, `immunizationDoses`. The hub looks the incoming type up in
`ENTITY_CLASS_BY_TYPE`, finds nothing, and rejects the change as an unknown
entity type.

Both sides' unit tests passed throughout, because both sides were written from
the same incorrect assumption. The defect was found only by driving the complete
workflow in a browser, registering a patient offline, reconnecting, and then
inspecting what actually arrived in PostgreSQL. The connectivity indicator showed
`Conflict, review (1)` after reconnecting, which is what prompted the
investigation.

This is the third defect in this phase that survived unit testing and was caught
only by running the whole system against a real database.

## Decisions taken

1. **`ENTITY_TYPE_BY_TABLE` is the single authority for entity naming on the
   wire.** It is the map the outbox actually writes through, it matches the
   entity names in `docs/architecture/data-model.md`, and it predates the sync
   protocol. The protocol was wrong, not the repository, so the protocol moved.

2. **The rename alone is not the fix.** The same trap stays open for the next
   entity added, so `apps/web/src/lib/__tests__/entity-type-contract.test.ts`
   now compares the three places an entity type is named and fails if they
   diverge: the repository's outbox map, the shared protocol's class table, and
   the client's type-to-table map. It also asserts that no wire type is a Dexie
   table name, which is the specific mistake that was made.

3. **`apps/api/test/e2e-sync.sh` was made re-runnable.** It asserted absolute row
   counts against a hub whose ledger is long-lived and shared with the vitest
   volume test, so it passed only against a freshly truncated database. It now
   captures the head watermark from an empty push and asserts against changes
   after that point, and it generates fresh entity ids per run. Verified by
   running it twice in succession.

## Deviations from the plan

None. This restores the behaviour
`docs/architecture/offline-sync-design.md` section 3 already specified.

## Open questions surfaced

None new. One observation worth recording for later phases: unit tests on both
sides of a contract cannot validate the contract itself when both sides are
written from the same assumption. The end-to-end path is what has caught every
defect in this phase.

## Files changed

| File                                                        | Change type |
|-------------------------------------------------------------|-------------|
| `packages/shared/src/sync-protocol.ts`                      | modified    |
| `apps/web/src/lib/sync-engine.ts`                           | modified    |
| `apps/web/src/db/repository.ts`                             | modified    |
| `apps/api/src/sync/sync.service.ts`                         | modified    |
| `apps/api/test/conflict.test.ts`                            | modified    |
| `apps/api/test/sync-integration.test.ts`                    | modified    |
| `apps/api/test/e2e-sync.sh`                                 | modified    |
| `apps/web/src/lib/__tests__/entity-type-contract.test.ts`   | added       |
| `apps/web/scripts/capture-evidence.mjs`                     | added       |
| `apps/web/scripts/capture-offline-demo.mjs`                 | added       |
| `docs/evidence/`                                            | added       |
| `docs/capstone-progress-report-2026-08-22.md`               | added       |

## Change details

### `packages/shared/src/sync-protocol.ts`

The class table is now keyed by the wire entity type. `STATE_PRIORITY` and
`IDENTITY_CRITICAL_FIELDS` were rekeyed the same way.

```diff
@@ -18,21 +18,25 @@
- * Which class each synced entity belongs to. `entity_type` values match the
- * Dexie table names in apps/web/src/db/db.ts.
+ * Which class each synced entity belongs to.
+ *
+ * The keys are the **wire** `entity_type` values: snake_case singular, taken
+ * from `ENTITY_TYPE_BY_TABLE` in `apps/web/src/db/repository.ts`, which is what
+ * the outbox actually writes.
  */
 export const ENTITY_CLASS_BY_TYPE = {
-  patients: "demographics",
-  patientLinks: "structural",
-  encounters: "append_only",
+  patient: "demographics",
+  patient_link: "structural",
+  encounter: "append_only",
```

### `apps/web/src/lib/sync-engine.ts`

The pull path maps a wire type to the Dexie table that stores it. The map was
previously an identity mapping of table names to themselves, so a pulled change
was also silently discarded.

```diff
@@ -30,20 +30,24 @@
-/** Dexie table names that participate in sync, keyed by wire `entity_type`. */
-const TABLES: Record<string, string> = {
-  patients: "patients",
-  patientLinks: "patientLinks",
+/**
+ * Wire `entity_type` to the Dexie table that stores it. The keys must match
+ * `ENTITY_TYPE_BY_TABLE` in ../db/repository.ts, which is what the outbox
+ * writes; a mismatch here means the hub rejects every change of that type.
+ */
+export const TABLE_BY_ENTITY_TYPE: Record<string, string> = {
+  patient: "patients",
+  patient_link: "patientLinks",
```

### `apps/web/src/db/repository.ts`

Exported so the contract can be asserted rather than assumed.

```diff
@@ -44,1 +44,7 @@
-const ENTITY_TYPE_BY_TABLE: Record<string, string> = {
+/**
+ * Dexie table name to the wire `entity_type` written into the outbox. This is
+ * the authority for entity naming on the wire; the shared sync protocol and the
+ * hub must agree with it. Exported so that contract can be asserted in a test.
+ */
+export const ENTITY_TYPE_BY_TABLE: Record<string, string> = {
```

### `apps/api/src/sync/sync.service.ts`

`BASELINE_TYPES` and `BASELINE_WINDOW_DAYS` were keyed by table name, so the
baseline snapshot selected nothing.

```diff
@@ -41,10 +41,10 @@
 const BASELINE_TYPES = [
-  "patients",
-  "patientLinks",
-  "encounters",
+  "patient",
+  "patient_link",
+  "encounter",
```

### `apps/web/src/lib/__tests__/entity-type-contract.test.ts`

New. Four tests comparing the three maps. This is the fix that outlives the
rename.

## Verification

| Suite                                       | Result          |
|---------------------------------------------|-----------------|
| `pnpm typecheck`, `pnpm lint`               | clean           |
| `apps/api` unit and live-hub tests          | 27 passed       |
| `apps/web` durability and contract tests    | 11 passed       |
| `apps/web` Playwright offline tests         | 7 passed        |
| `apps/api/test/e2e-sync.sh`                 | 18 passed, twice |

End-to-end confirmation, which is what the unit tests could not give: a patient
registered in the browser with the network disabled now reaches the hub after
reconnecting. The outbox entry moves to `acked` and the row is present in
`synced_entity` in PostgreSQL. Before this fix the same entry ended in
`conflict`, and PostgreSQL held nothing.
