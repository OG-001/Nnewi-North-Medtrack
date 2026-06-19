# Phase 3 — Offline Sync Engine

**Date:** 2026-06-09
**Author:** Solution architecture (planning)
**Phase:** 3 — Offline sync engine (Module 9)
**Depends on:** Phase 2
**Status:** Planned

---

## 1. Objective

Implement the **pull/push sync protocol**, server **change-log**, **conflict
resolution**, scoped **baseline snapshot**, and the user-visible **sync-status**
behaviour — so that patient + EMR data created offline on any device reconciles
correctly, idempotently, and resumably with the central hub and across devices,
with **no data loss** and conflicts resolved by rule or escalated (never
silently dropped). This phase realises the design in
`../architecture/offline-sync-design.md`.

## 2. Prerequisites / entry criteria

- Phase 2 done: real entities + populated **outbox** in the local store.
- Offline-sync design + data-model `change_log`/`rev` columns confirmed
  (`../architecture/offline-sync-design.md`, `../architecture/data-model.md` §2,
  §3.10).
- Offline-auth tokens (Phase 1) available for the sync endpoints.

## 3. Scope

**In scope**

- **Server change-log** (`change_log`, `server_seq` monotonic) populated on every
  hub-side upsert/delete.
- **Sync endpoints**: `GET /sync/changes` (pull by watermark + scope),
  `POST /sync/push` (idempotent batch upsert, `base_rev` conflict detection),
  `POST /sync/enroll`, `GET /sync/baseline` (paged scoped snapshot).
- **Client sync module**: push-before-pull cycle; watermark management;
  resumable batches; in-flight tracking; idempotent re-send.
- **Conflict resolution** per entity class (`offline-sync-design.md` §5),
  including the **admin escalation** queue for identity-critical contradictions.
- **Scope enforcement**: a device pulls/holds only its facilities; scope change
  purges out-of-scope data.
- **Triggers**: online event, focus, periodic timer, "Sync now", service-worker
  Background Sync; clock-skew handling via `rev`/`server_seq` (not wall-clock).
- **Sync-status UI**: real states (synced/pending/syncing/offline/conflict) +
  last-synced time (replacing the Phase 0 stub).

**Out of scope**

- Domain features (already exist for patient/EMR; later modules inherit sync).
- SMS/reporting (Phases 7/8).
- The admin **UI** for the conflict queue beyond a minimal review screen (full
  admin in Phase 9) — but the escalation **mechanism** is built here.

## 4. Task breakdown

1. **Change-log**: write `change_log` rows on hub upsert/delete; assign
   `server_seq`; expose `GET /sync/changes?since=&scope=&limit=`.
2. **Push endpoint**: idempotent upsert keyed by `id`+`rev`; detect conflict via
   `base_rev` vs current; return per-change `applied|conflict|rejected`
   (+ server payload on conflict).
3. **Enrol + baseline**: `POST /sync/enroll` returns scope; `GET /sync/baseline`
   pages a **bounded** active/recent snapshot (deep history lazy).
4. **Client sync engine**: cycle (push → pull → repeat until empty); watermark
   persistence; resumable + idempotent; in-flight→pending recovery.
5. **Conflict rules**: implement the per-class strategies (append-only,
   field-level LWW for demographics, state-priority for workflow, hub-authoritative
   config, hub-mediated merge/delete); write an `audit_event` per resolution.
6. **Escalation**: identity-critical contradictions flagged `NeedsReview` →
   conflict queue + minimal admin review screen; clinical work continues on latest.
7. **Scope handling**: pull only in-scope; purge out-of-scope on scope change /
   logout / de-enrol.
8. **Sync-status UI**: wire real states + last-synced; "unsynced for N hours"
   warning; manual "Sync now".
9. **Tests (the gate)**: the full matrix in `offline-sync-design.md` §10 —
   offline CRUD + reconcile, no-loss across crash/refresh/airplane, two-device
   concurrency per conflict class incl. escalation, idempotency, resumability,
   scope isolation, volume/perf.

## 5. Deliverables

- Working bidirectional sync (push/pull) with server change-log + watermark.
- Conflict resolution per entity class + admin escalation path.
- Scoped baseline + scope-change purge.
- Real sync-status UX.
- The §10 sync test matrix, green.
- Change-log entry.

## 6. Acceptance / exit criteria

- [ ] All MVP workflows from Phase 2 complete **offline**, then reconcile on
      reconnect with **no loss or duplication**.
- [ ] No data loss across crash / refresh / airplane-mode cycles.
- [ ] Two-device concurrency resolves per the documented rules for **each**
      entity class; identity-critical contradiction escalates to the conflict
      queue and is **never silently dropped**.
- [ ] Sync is **incremental** (changed records only) and **resumable** after
      interruption; replays are idempotent (no duplicates).
- [ ] A device only ever receives/holds its **authorised facility scope**; scope
      change purges out-of-scope data.
- [ ] Sync-status UI reflects real state + last-synced; "Sync now" works.
- [ ] **Exit gate (MVP gate):** owner signs off the sync test matrix — this is
      the gate that makes the **pilot MVP (0,1,2,3,6)** viable.

## 7. Governance & guardrails

- **No data loss / no silent drops** — the cardinal rules; tests are
  release-blocking.
- Conflict resolutions are **audited**.
- Use `rev` + `server_seq` for ordering, **not device clocks**.
- Local store holds **only in-scope** data (privacy, NDPA).
- Deactivated users (Phase 1) cannot sync; enforced here.

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Subtle data loss/duplication | Idempotent upserts (`id`+`rev`); transactional outbox; exhaustive §10 test matrix |
| Conflict rules wrong for clinical reality | Append-only for events (no overwrite); reviewed per-class rules; escalation for ambiguity |
| Clock skew corrupts ordering | `rev`/`server_seq` authoritative; hub stamps server time |
| Sync too heavy for low-end devices | Incremental + bounded baseline + lazy deep history; perf test in §10 |
| Custom sync too costly to harden | Documented **CouchDB/PouchDB fallback** (`offline-sync-design.md` §11) — owner-approved pivot only |

## 9. Hand-off

After Phase 3, the platform has a **pilot-ready MVP** once Phase 6 (queue) lands.
Phases 4, 5, 6 build domain modules **on top of** the offline + sync foundation —
they inherit sync for free by using the repository/outbox + change-log pattern,
and only need their conflict classes confirmed against §5.
