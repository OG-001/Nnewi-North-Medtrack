---
description: Work on the local store, the outbox, or the sync engine. Highest-risk subsystem.
argument-hint: "<change description>"
---

# /sync

Spawn the **`offline-sync`** agent.

**Change:** $ARGUMENTS

`docs/architecture/offline-sync-design.md` calls this the most important and highest-risk
piece of the system: if sync is wrong, clinical data is lost or duplicated. A change here
that looks fine and silently drops one immunization dose is worse than one that fails loudly.

## The transaction invariant

`apps/web/src/db/repository.ts` must, in **one IndexedDB transaction**, write the domain row,
append the outbox entry, bump `rev` and `updated_at`, and write the audit event. There is
exactly one write path. If you change it, prove all four still happen atomically.

## Adding a table means four coordinated edits

Missing any one produces a row that never syncs.

1. Store definition and version bump in `apps/web/src/db/db.ts`
2. Row type in `apps/web/src/db/types.ts`, extending `BaseRecord`
3. Entry in `ENTITY_TYPE_BY_TABLE` in `apps/web/src/db/repository.ts`
4. Seed coverage in `apps/web/src/db/seed.ts` if the demo facilities need it

## A Dexie version bump is a migration

Real devices hold real data, some unsynced. State what happens to an install on the previous
version, confirm no store is dropped in the same change that adds its replacement, and
confirm unsynced outbox entries survive.

## Then test it properly

The mandatory matrix from `docs/architecture/offline-sync-design.md` section 10 is not
optional: offline CRUD then reconcile, no loss across crash and refresh and airplane cycles,
two-device edits per entity class covering every conflict rule including escalation, replayed
push with no duplicate, resumable interrupted transfers, and scope isolation.

## Rules

- One write path. Never add a second.
- Never hard-delete clinical data.
- Never let one poison change block the whole outbox.
- Never trust a device clock for ordering. Use `rev` and `server_seq`.
- Never drop a conflict silently.
- If you cannot prove a change is loss-free, say so and stop.
