# Nnewi North PHC Digital Health Platform — Master Plan

**Date:** 2026-06-09
**Author:** Solution architecture (planning)
**Status:** Planned
**Audience:** Product owner, build team / build model, PHC stakeholders, NPHCDA/LGA health authority

---

## 1. Core message & positioning

> **"One patient record, in every health centre, even when the network is down."**

The platform is a shared, offline-first digital record system for the Primary
Health Centres of Nnewi North LGA. It replaces paper registers and card files
with a single source of truth for each patient that any authorised PHC in the
LGA can use, that keeps working when connectivity drops, and that produces the
monthly returns the health system already requires — automatically.

Three pillars differentiate it:

1. **Works offline, by design.** PHCs operate in low-connectivity, sometimes
   no-connectivity conditions. The app is a Progressive Web App that runs fully
   on the device, stores data locally, and syncs to a central hub when a
   connection is available. No internet, no lost work.

2. **Built for the workflow that already exists.** It mirrors how PHC staff
   actually work — registration desk, antenatal clinic, immunization day, the
   queue — and aligns its outputs to **NHMIS / DHIS2** so reporting is a
   by-product of normal use, not extra paperwork.

3. **Maternal and child health first.** The highest-value, highest-risk PHC
   activities — antenatal follow-up and routine childhood immunization — get
   first-class scheduling, reminders (SMS), and defaulter tracking, because
   missed visits here have the worst outcomes.

---

## 2. The problem (restated as design drivers)

The concept document lists the operational problems. Each maps to a concrete
capability this system must deliver:

| Problem today (paper-based PHCs) | Design driver |
|---|---|
| Patient files misplaced / damaged | Durable digital record + backups + sync hub |
| Slow retrieval of medical history | Search by name / phone / MRN; full visit history on one screen |
| Incomplete / inaccurate documentation | Structured forms with required fields and validation |
| Poor maternal follow-up | ANC schedule engine + visit tracking + defaulter list + SMS |
| Missed child immunizations | EPI schedule engine + due/overdue list + SMS reminders |
| Long waiting times (manual registration) | Fast registration + queue/workflow module |
| Hard to produce accurate reports | Auto-generated NHMIS-aligned monthly summaries, DHIS2 export |
| Repetitive documentation workload | Reuse of patient demographics across visits/modules |
| No organised data for planning | Facility & LGA dashboards over the same live data |
| Unreliable connectivity & power | Offline-first PWA; resilient sync; low device requirements |

---

## 3. Goals & non-goals

### Goals (v1)

- Digitise patient registration and the longitudinal medical record across all
  participating PHCs in Nnewi North LGA.
- Provide ANC scheduling, visit tracking, and defaulter follow-up.
- Provide EPI/immunization scheduling, due/overdue tracking, and reporting.
- Manage the in-clinic queue and visit workflow.
- Send SMS reminders for upcoming and missed maternal/immunization appointments.
- Generate NHMIS-aligned monthly facility reports and a DHIS2-compatible export.
- Operate fully offline on a clinic device and sync reliably to a central hub.
- Enforce role-based access and an audit trail appropriate to health data under
  NDPA 2023.

### Non-goals (explicitly out of v1 scope)

- **Not** a billing / health-insurance claims system (no NHIS claims in v1).
- **Not** a pharmacy/inventory or cold-chain stock management system (vaccine
  *administration* is tracked; vaccine *stock* is a later candidate — §9).
- **Not** a laboratory information system or imaging/PACS.
- **Not** a patient-facing portal or appointment self-booking app (patients
  interact via SMS only in v1).
- **Not** a telemedicine / video consultation platform.
- **Not** a national rollout. The system is **multi-facility within one LGA**;
  it is *architected* to scale beyond Nnewi North but that is not v1 scope.

---

## 4. Target users & beneficiaries

See `product/user-roles-and-permissions.md` for the full role model. In brief:

**Direct users (system operators)**

- Records/registration clerk — registers patients, manages the queue.
- Nurse / midwife — runs ANC and immunization clinics, records clinical data.
- CHEW (Community Health Extension Worker) — outreach, defaulter follow-up.
- Doctor / medical officer in charge (where present) — consultations, referrals.
- Facility administrator (officer-in-charge) — facility config, staff, reports.
- LGA health authority / M&E officer — cross-facility reporting and oversight.
- System administrator — technical operation of the platform.

**Beneficiaries (served, do not log in)**

- Pregnant women, nursing mothers and infants, children in EPI, general patients,
  and — through better data — community caregivers, NGOs, and LGA/State planners.

---

## 5. Scope: MVP vs. full v1 vs. later

The 11 build phases (0–10) constitute **full v1**. Within that, a **deployable
MVP** is defined so a pilot can begin early:

| Tier | Includes | Phases |
|---|---|---|
| **MVP (pilot-ready)** | Auth/RBAC, facilities, patient registration + EMR, offline sync, basic queue | 0, 1, 2, 3, 6 |
| **Full v1** | + Maternal health, immunization, SMS reminders, reporting/analytics, admin dashboard, production hardening | 4, 5, 7, 8, 9, 10 |
| **Later (post-v1)** | Vaccine stock/cold-chain, NHIS billing, patient SMS/USSD self-service, Igbo UI localisation, lab module, fingerprint/biometric ID, State-level multi-LGA federation | — (see §9) |

The pilot should run on **one or two PHCs** before LGA-wide rollout (Phase 10).

---

## 6. Success metrics

These are the outcomes the build is optimising for. Baselines must be measured
during the pilot's first weeks (do **not** assume numbers).

**Adoption / operational**

- % of patient encounters captured digitally (target: trend toward ~100% at
  pilot sites within the pilot window).
- Median patient registration time (new vs. returning).
- Median record-retrieval time for a returning patient.
- % of working time the app is used offline vs. online (validates the offline
  investment).

**Clinical / programme**

- ANC follow-up: % of expected ANC visits attended; defaulter list size trend.
- Immunization: % of children up-to-date for age; dropout rate between Penta1
  and Measles1 (a standard EPI quality indicator).
- SMS reminder → attendance conversion (where measurable).

**Reporting / data quality**

- Time to produce the monthly facility report (paper baseline → digital).
- Field completeness rate on key forms.
- Successful monthly DHIS2 export with zero manual re-entry.

**Reliability**

- Sync success rate; median time-to-sync after reconnect; unresolved conflict
  count (target: near zero, see `architecture/offline-sync-design.md`).

---

## 7. Guiding principles (apply to every phase)

1. **Offline is the default, not a fallback.** Every feature must work with no
   network and reconcile later.
2. **Low-end device friendly.** Assume mid/low-range Android phones and tablets
   on slow networks. Protect bundle size, memory, and battery.
3. **Match the paper it replaces.** Forms should feel familiar to staff trained
   on NHMIS registers; do not invent unfamiliar workflows.
4. **Capture once, reuse everywhere.** Demographics entered at registration flow
   into ANC, immunization, queue, and reports without re-entry.
5. **Health data is sensitive data.** Least-privilege access, full audit, and
   NDPA 2023 alignment are non-negotiable, not a final-phase add-on.
6. **Reporting is a by-product.** If staff do their normal work, the monthly
   report should already be correct.
7. **Configurable, not hardcoded.** Immunization schedule, ANC schedule, facility
   list, and SMS templates are data, owned by admins — because national schedules
   and local realities change.

---

## 8. High-level solution shape

A fuller treatment is in `architecture/`. In one paragraph:

A **React + TypeScript PWA** runs on each clinic device, holding a local
**IndexedDB** copy of that facility's working data so it is fully usable offline.
A **sync engine** reconciles local changes with a central **NestJS + PostgreSQL**
backend (the "sync hub") whenever connectivity is available, using an
append-friendly, conflict-aware protocol. The hub hosts the authoritative
multi-facility data, the **SMS** dispatcher (Africa's Talking / Termii), and the
**reporting** engine that produces NHMIS-aligned summaries and DHIS2 exports.
Everything ships as **Docker** containers deployable to a Nigeria-region server,
keeping patient data in-country per **NDPA 2023**.

```mermaid
graph TD
  subgraph Clinic devices (offline-capable PWA)
    A[Registration desk] 
    B[ANC / Immunization clinic]
    C[CHEW outreach device]
  end
  A -- sync --> H
  B -- sync --> H
  C -- sync --> H
  subgraph Sync Hub (in-country, Dockerized)
    H[NestJS API] --- DB[(PostgreSQL)]
    H --- SMS[SMS dispatcher\nAfrica's Talking / Termii]
    H --- RPT[Reporting engine\nNHMIS / DHIS2 export]
  end
  H --> ADMIN[Admin & LGA dashboards]
```

---

## 9. Roadmap beyond v1 (deferred, gated by need)

- **Vaccine stock & cold-chain** tracking (links to immunization).
- **NHIS / insurance** billing and claims.
- **Patient self-service** via SMS keywords / USSD (e.g., check next appointment).
- **Igbo-language UI** localisation (SMS Igbo templates are in v1).
- **Laboratory** results module.
- **Biometric / fingerprint** patient matching to reduce duplicates.
- **State-level federation** — multiple LGAs reporting to a State hub.

Each is out of v1 scope and must be separately planned.

---

## 10. Open questions (resolve with product owner before the dependent phase)

| # | Question | Needed before | Default if unanswered |
|---|---|---|---|
| Q1 | Exact list of participating PHCs in Nnewi North LGA (names, codes) | Phase 1 | Seed with a configurable facility list; admin adds the rest |
| Q2 | Current **NPHCDA immunization schedule** to encode (antigens, ages) | Phase 5 | Encode the representative EPI schedule in `data-model.md` as *editable config*, flagged "verify against current NPHCDA" |
| Q3 | ANC model: WHO 2016 **8-contact** vs. focused **4-visit** | Phase 4 | Ship configurable schedule; default to 8-contact, allow 4 |
| Q4 | Is there an existing **NHMIS/DHIS2** instance/credentials to export into, or export-file only? | Phase 8 | Produce standard **DHIS2 import file** + CSV; no live API integration in v1 |
| Q5 | SMS sender ID / DND registration with NCC; budget per SMS | Phase 7 | Build provider-agnostic; require owner to provision sender ID + credits |
| Q6 | Hosting target: NG-region VPS vs. on-prem LGA server (or both) | Phase 10 | Docker Compose that runs in either; document both |
| Q7 | Data retention period for inactive records under facility/NDPA policy | Phase 10 | Retain indefinitely with archival flag; make retention configurable |
| Q8 | Final product name & branding | Phase 9 (UI polish) | Use working name / codename **PHC-Track** |
| Q9 | NDPA data-controller designation & DPO contact for the deployment | Phase 10 | Document obligations; owner names controller + DPO |

---

## 11. Naming

Working name throughout the docs: **"Nnewi North PHC Digital Health Platform"**,
codename **PHC-Track**. The final public/product name is **Open question Q8**.
Wherever code needs a name (package scope, app title, repo), use a single
centralised config value so a rename is one edit, never a find-and-replace.

---

## 12. Risks (programme-level; per-phase technical risks live in each phase doc)

| Risk | Impact | Mitigation |
|---|---|---|
| Staff resistance / low digital literacy | Adoption failure | Workflow mirrors paper; minimal-tap forms; in-app help; Phase 10 training |
| Connectivity worse than assumed | Sync backlog, stale data at hub | True offline-first; sync is incremental and resumable; hub is not required for clinic work |
| Power instability | Devices unusable | PWA works on battery devices; recommend power-bank/solar at sites (ops, not software) |
| Data privacy incident | Legal + trust harm | NDPA 2023 controls from Phase 1; encryption, audit, least privilege; Phase 10 hardening |
| Schedules (EPI/ANC) change nationally | Wrong reminders | Schedules are editable config, not code (Principle 7) |
| Duplicate patient records across visits/sites | Data quality, double-counting | Dedup on phone + name + DOB; merge tool in admin (Phase 9); biometric ID deferred |
| Scope creep into billing/pharmacy/lab | Delay of core value | Non-goals (§3) are explicit; later items gated (§9) |
| Funding/ownership beyond pilot | Stalled rollout | MVP-first (§5) delivers value early; self-hostable to control cost |

---

## 13. What "done" looks like for v1

A nurse at a participating Nnewi North PHC can, **with no internet at the
clinic**: find a returning mother by phone number, see her full history and ANC
schedule, record today's antenatal visit, register her newborn, schedule and
later record the child's EPI immunizations, and add patients to the day's queue
— and by the end of the month the officer-in-charge can generate the facility's
NHMIS summary and a DHIS2 export **without re-keying anything**, while pregnant
women and caregivers receive **SMS reminders** for upcoming and missed visits.
All of it syncs to an **in-country** central hub, under role-based access with a
full audit trail.
