# Offline-first and sync rules

**Applies to:** `apps/web/src/db/**`, `apps/web/src/lib/sync.ts`, `apps/web/src/lib/device.ts`,
and every future `apps/api/src/sync/**` path.

**Authority:** `docs/architecture/offline-sync-design.md`. This file is the operational
summary agents must hold in working memory. When the two disagree, the design document wins
and this file is the bug.

> This is the highest-risk piece of the system. If sync is wrong, clinical data is lost or
> duplicated, and that is unacceptable. Nothing here is a style preference.

---

## 1. The seven principles

1. **Local-first.** Every read and write hits the on-device Dexie store first. The network
   is never on the critical path for care.
2. **Client-generated identity.** Every synced record carries a client-generated UUID from
   `packages/shared/src/ids.ts`, so a record created offline has stable identity before it
   ever reaches the hub. Never rely on a server auto-increment.
3. **Append-friendly truth.** Clinical history is additive. Two devices recording two visits
   create two rows, and both are kept.
4. **Deterministic conflict rules.** Resolution is rule-based and predictable. A genuinely
   ambiguous case is escalated to an admin, **never silently dropped**.
5. **Incremental and resumable.** Transfer only changes since the watermark, and survive
   interruption. Flaky networks are the normal case, not the edge case.
6. **Scoped.** A device only pulls and holds data for the facilities its users are
   authorised for.
7. **Idempotent.** Re-sending the same change must never create a duplicate. `id` plus `rev`
   make the upsert idempotent.

---

## 2. The repository-layer invariant (Global Constraint 4)

Every UI write goes through `apps/web/src/db/repository.ts`, which in **one IndexedDB
transaction**:

1. writes the domain row,
2. appends an outbox entry,
3. bumps the row's `rev` and `updated_at`,
4. records an `audit_event`.

A crash between any two of those steps must be impossible. **Never write a Dexie domain
table directly from a component, a page, or a hook.** If you find yourself calling
`db.patients.put(...)` outside the repository layer, that is the defect.

Common columns every synced row carries, set by `createRecord`: `id`, `facility_id`,
`created_at`, `created_by`, `updated_at`, `updated_by`, `rev`, `deleted_at`,
`origin_device_id`.

---

## 3. Local store layout

| Store        | Holds                                                                |
|--------------|-----------------------------------------------------------------------|
| Domain tables| One per entity, mirroring `docs/architecture/data-model.md`           |
| Outbox       | `{ localSeq, entity_type, entity_id, op, payload, rev, created_at, status }` |
| Sync meta    | `{ server_seq_watermark, last_sync_at, device_id, scope }`            |

Outbox `status` is one of `pending`, `in_flight`, `acked`, `conflict`. An entry stuck in
`in_flight` with no acknowledgement reverts to `pending` and is re-sent, which is safe
because the upsert is idempotent.

---

## 4. The protocol

Four operations against the hub, under `/api/v1/sync`, implemented in
`apps/api/src/sync/sync.controller.ts`:

```text
GET  /api/v1/sync/changes?since=<seq>&scope=<facilityIds>&limit=N
POST /api/v1/sync/push
POST /api/v1/sync/enroll
GET  /api/v1/sync/baseline?scope=&cursor=
```

**Push before pull** within a cycle, then repeat until both directions are empty. The
device's own work reaches the hub before it takes on anyone else's.

Sync runs on reconnect, on app focus, on a periodic timer while online, on an explicit
"Sync now", and through the service worker's Background Sync where supported.

---

## 5. Conflict resolution, by entity class

Conflict is detected at push: the client edited from `base_rev` but the hub's current `rev`
is higher.

| Entity class                | Strategy                                              |
|-----------------------------|--------------------------------------------------------|
| Append-only clinical events | No conflict by construction. Each event is a new row.  |
| Patient demographics        | Field-level last-writer-wins by `updated_at`, merging non-overlapping fields, both versions logged. |
| Status and workflow rows    | State-priority merge: the more advanced state wins.    |
| Configuration               | The hub is authoritative. Config never enters the offline outbox. |
| Merges and soft deletes     | Hub-mediated. The hub's structural operation wins, and the local edit is preserved as history. |

Append-only classes include `encounter`, vitals, `anc_visit`, `immunization_dose`,
`referral`, `sms_message`, and `audit_event`. State priority runs
`completed` > `in_progress` > `waiting`, and `given` > `due`; ties fall back to last-writer.

**Escalation.** A genuine contradiction on an identity-critical field, two different dates
of birth or two different sexes for the same patient, flags the record `NeedsReview` and
surfaces it in the admin conflict queue with both versions. Clinical work continues on the
latest value while an admin reconciles.

**Every conflict resolution, automatic or manual, writes an `audit_event`.**

---

## 6. Ordering and clocks

`rev` and `server_seq` are the ordering signals. Device clocks are not trustworthy on shared
clinic tablets, so `updated_at` is a tiebreaker for demographics only, and the hub stamps
authoritative server time on apply. Never sort a sync operation by a client timestamp.

---

## 7. Failure handling

| Failure                    | Required behaviour                                     |
|----------------------------|---------------------------------------------------------|
| Crash or refresh mid-write | Transactional local write means no half-applied change  |
| Lost acknowledgement       | `in_flight` reverts to `pending` and re-sends idempotently |
| Interrupted pull           | Watermark advanced only for applied changes; resume from `next_seq` |
| Repeatedly failing change  | Park it in a local rejected state and surface it. **Never let one poison change block the whole outbox.** |
| Scope change               | Pull the newly in-scope data and purge what left scope  |

---

## 8. What must be tested before Phase 3 exits

From `docs/architecture/offline-sync-design.md` section 10, all mandatory:

- Offline create, read, update, and delete for every MVP workflow, then reconciliation on
  reconnect.
- No loss across crash, refresh, and airplane-mode cycles, with the interruption points
  fuzzed.
- A concurrency matrix: scripted two-device edits per entity class verifying each rule in
  section 5 above, including the escalation path.
- Idempotency: replay a push and assert no duplicate.
- Resumability: kill a pull and a push mid-batch and assert correct resume.
- Scope: assert a device never receives or holds out-of-scope data.
- Volume and performance against the low-end device budget.

---

## 9. The documented fallback

If the custom change-log sync proves too costly to harden, the recorded fallback is
CouchDB and PouchDB replication for the offline domain data, with PostgreSQL retained for
reporting through a projection. This is a **last resort**: it splits the datastore and
complicates both RBAC and reporting. It must be a deliberate, owner-approved pivot recorded
in the change log, never a silent drift.
