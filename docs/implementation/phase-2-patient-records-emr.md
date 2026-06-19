# Phase 2 — Patient Records & Electronic Medical Records

**Date:** 2026-06-09
**Author:** Solution architecture (planning)
**Phase:** 2 — Patient registration & EMR (Modules 1 & 2)
**Depends on:** Phase 1
**Status:** Planned

---

## 1. Objective

Implement **patient registration** (offline-safe MRN, duplicate detection, fast
search) and the **longitudinal Electronic Medical Record** (patient summary,
encounters, vitals, diagnoses, prescriptions, allergies/chronic flags,
referrals) — all working **fully offline against the local store** — so a clerk
can register/find a patient and a clinician can record and review a complete
visit history without a network. This is the data backbone every later module
reuses.

## 2. Prerequisites / entry criteria

- Phase 1 done: authenticated, scoped users; RBAC guard; audit.
- Data model for patient/encounter confirmed
  (`../architecture/data-model.md` §3.3–3.4, §6 MRN scheme).
- Note: bulk hub sync is **Phase 3**; in Phase 2, writes persist to the **local
  store + outbox** and (when online) via the per-resource endpoints — the outbox
  is fully wired here so Phase 3 only adds the transport.

## 3. Scope

**In scope**

- **Patient registration** form + `patient` entity: demographics, phone, address,
  next-of-kin, language, **SMS consent**, optional NIN (format-only), category
  tags, optional photo.
- **Offline-safe MRN** generation (`../architecture/data-model.md` §6).
- **Duplicate detection** at registration (phone + name + DOB) with use-existing/
  create-anyway.
- **Patient search** (phone/name/MRN) over the local Dexie store, indexed,
  < 300 ms.
- **EMR**: patient summary screen (demographics, alerts, active programmes, last
  visit, full history/timeline); `encounter` with vitals, diagnosis, prescription,
  notes, outcome; allergy/chronic-condition flags; **referral**.
- **Local-first** wiring: all writes go through the repository → domain row +
  **outbox** entry in one transaction (ready for Phase 3 sync).
- Mark deceased/inactive (audited); soft-delete only.
- RBAC applied (clerk vs clinician capabilities per the matrix); audit on writes.

**Out of scope**

- Maternal/immunization specifics (Phases 4/5) — but the **vitals** captured here
  must be reusable by them (no double entry).
- Bulk **sync transport** (Phase 3).
- Queue (Phase 6) — encounters can exist without the queue for now.

## 4. Task breakdown

1. **`patient` entity + MRN** generator (offline-safe; uniqueness verified at hub
   later); Dexie indexes for phone/name/MRN.
2. **Registration form** (React Hook Form + Zod from `packages/shared`): required-
   field validation offline; NIN format-only; SMS consent capture.
3. **Duplicate detection**: local candidate match (+ hub index when online via
   `/patients/duplicates`); surface existing record(s) before create.
4. **Patient search** UI over the local store; type-ahead; virtualised results.
5. **Patient summary** screen: demographics + **prominent alerts** (allergies/
   chronic) + active programmes + **timeline** of encounters.
6. **Encounter capture**: vitals (temp/BP/weight/height/MUAC/…), presenting
   complaint, assessment/diagnosis, prescription, notes, outcome; referral.
7. **Repository + outbox** integration for every write (transactional); confirm
   the Phase 0 skeleton now carries real entities.
8. **RBAC + audit**: clerk can register/search; clinician records clinical data;
   every create/update audited; deceased/inactive flow.
9. **Tests**: unit (MRN, dedup, validation), API (authz on patient/encounter),
   **offline e2e** (register → record visit → reload offline → history intact).

## 5. Deliverables

- Patient registration + search working **offline**, with dedup and offline-safe
  MRN.
- EMR: summary + encounter + vitals + diagnosis + prescription + allergies +
  referral, with full timeline.
- All writes persisted locally via repository + outbox (Phase-3-ready).
- RBAC-enforced, fully audited.
- Tests incl. offline e2e green; change-log entry.

## 6. Acceptance / exit criteria

- [ ] New patient created and retrieved **fully offline**; MRN stable; offline
      reload preserves everything.
- [ ] Search by partial phone/name/MRN returns local results < 300 ms on a
      mid-range device.
- [ ] Probable-duplicate registration surfaces the existing record(s) with a
      clear choice.
- [ ] An encounter (with vitals/diagnosis/prescription/referral) appears in the
      patient timeline immediately and survives offline reload.
- [ ] Patient summary loads full history < 1 s on a mid-range device.
- [ ] Vitals are stored in a shape reusable by maternal/immunization (no schema
      that forces re-entry later).
- [ ] RBAC: clerk cannot record clinical data; clinician can; all writes audited.
- [ ] **Exit gate:** owner reviews the registration + EMR UX and confirms the
      outbox is correctly populated for Phase 3.

## 7. Governance & guardrails

- **NIN optional**, never required; format-validated only (NDPA minimisation).
- **SMS consent** captured at registration (gates Phase 7).
- **Soft-delete only**; deceased/inactive audited.
- Every write attributable + audited; data-scope enforced.
- Repository/outbox discipline: no write bypasses the local-first path.

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Duplicate patients despite detection | Local + hub-index dedup; admin merge tool in Phase 9; tune match rules |
| MRN collision offline | UUID is canonical key; MRN scheme is facility+date+random; hub verifies + reissues suffix (audited) |
| Vitals schema not reusable by later modules | Design vitals as a shared, encounter-linked structure now (review with Phases 4/5 in mind) |
| Summary slow for long histories | Index timeline; paginate/lazy-load deep history (perf budget) |
| Outbox bugs surface only in Phase 3 | Add outbox assertions to Phase 2 offline e2e |

## 9. Hand-off

Phase 3 consumes: real entities in the local store + a populated **outbox**, the
per-resource endpoints, and the offline e2e harness — and adds the **sync
transport + conflict resolution** that reconciles all of it with the hub and
across devices. Phases 4/5/6 consume the patient + encounter + vitals foundation.
