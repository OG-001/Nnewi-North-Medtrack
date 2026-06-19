# Nnewi North PHC Digital Health Platform — Build Plan

**Date:** 2026-06-09
**Author:** Solution architecture (planning)
**Status:** Planned — ready for build
**Working name:** "Nnewi North PHC Digital Health Platform" (codename **PHC-Track**; final name TBD — see `master-plan.md` §11)

---

> **Implementation status (2026-06-09):** a working offline-first PWA built from
> this blueprint now lives at the repo root (`apps/web` + `packages/shared`).
> To run it, see [`RUNNING.md`](RUNNING.md); for what shipped vs. deferred,
> see the change-log under `devops/change_log/`. This `docs/` folder remains the
> authoritative plan.

---

## What this folder is

This is a **complete build blueprint** for a digital healthcare management web
application for Primary Health Centres (PHCs) in **Nnewi North LGA, Anambra
State, Nigeria**. It is a *planning artifact*, not application code. The intent
is that a capable engineering model (or team) can read this set start-to-finish
and **build exactly the system described**, in order, with no further design
decisions required for the v1 scope.

It deliberately mirrors the house planning style used for the InsightMesh
website (`master-plan.md` + a phased implementation set with a strict per-phase
structure + supporting architecture docs).

This folder is intentionally **separate from the insightmesh-ai workspace** and
is expected to be moved to its own repository before the build begins.

---

## How to use this plan with a build model

1. **Read in this order:** `master-plan.md` → `product/` → `architecture/` →
   `implementation/README.md` → each `implementation/phase-N-*.md` in number
   order.
2. **Treat "Locked decisions" as binding.** The stack, hosting model, data
   residency, and SMS strategy are decided (see below). Do not re-litigate them
   during the build. Anything still open is collected under **Open questions**
   in `master-plan.md` §10 and must be resolved with the product owner before
   the phase that needs it.
3. **Build phase by phase.** Each phase doc has an explicit *Acceptance / exit
   criteria* section. Do not start phase _N+1_ until phase _N_ exits. Phases
   marked **parallelizable** in `implementation/README.md` may overlap.
4. **One change-log entry per phase.** Record what shipped, decisions taken, and
   deviations in a `devops/change_log/` entry inside the build repo (convention
   in `implementation/README.md`).
5. **When reality and the plan disagree,** prefer the plan's *intent* (the
   Objective and Acceptance sections) and flag the conflict in the change log
   rather than silently diverging.

---

## Locked decisions (authoritative — carried into every doc)

| Decision | Value | Rationale source |
|---|---|---|
| **Application type** | Offline-first **Progressive Web App** (installable, works on low-end Android) | `architecture/tech-stack-recommendation.md` |
| **Frontend** | React + TypeScript + Vite; Dexie (IndexedDB) + service worker for offline; sync engine | same |
| **Backend** | NestJS (Node.js + TypeScript) REST API | same |
| **Database** | PostgreSQL (per-facility local node + central sync hub) | `architecture/system-architecture.md` |
| **Hosting / residency** | Self-hostable, **Dockerized**; patient data stays **in Nigeria** (VPS in NG region or on-prem LGA server) | `architecture/security-and-compliance.md` |
| **SMS** | Provider-agnostic abstraction; **Africa's Talking + Termii** adapters (NG networks) | `architecture/system-architecture.md` |
| **Reporting target** | NHMIS-aligned monthly summaries, **DHIS2-exportable** | `architecture/data-model.md`, phase 8 |
| **Compliance baseline** | **Nigeria Data Protection Act (NDPA) 2023**, NPHCDA PHC norms | `architecture/security-and-compliance.md` |
| **Patient identifier** | System-generated **MRN**; NIN optional, never required | `architecture/data-model.md` |
| **Primary language / locale** | English (UI), `en-NG`; SMS templates allow Igbo variants | `master-plan.md` |

---

## Folder map

```text
Nnewi North PHC Web APP/
├── README.md                         ← you are here
├── master-plan.md                    Vision, scope, MVP, success metrics, open questions
├── product/
│   ├── modules-and-features.md       The 10 modules: features, user stories, acceptance
│   ├── user-roles-and-permissions.md Roles, RBAC matrix, data-scope rules
│   └── user-journeys.md              End-to-end flows (registration, ANC, immunization, queue)
├── architecture/
│   ├── tech-stack-recommendation.md  Stack choice, alternatives considered, verdict
│   ├── system-architecture.md        Components, deployment topology, sync hub, diagrams
│   ├── data-model.md                 Entities, ERD, key tables, enums, NHMIS mapping
│   ├── offline-sync-design.md        Offline-first strategy, sync protocol, conflict rules
│   ├── api-design.md                 REST conventions, auth, error model, key endpoints
│   └── security-and-compliance.md    NDPA 2023, authn/z, encryption, audit, retention
└── implementation/
    ├── README.md                     Phase index, conventions, dependency diagram, DoD
    ├── phase-0-foundation-scaffold.md
    ├── phase-1-identity-rbac-facility.md
    ├── phase-2-patient-records-emr.md
    ├── phase-3-offline-sync-engine.md
    ├── phase-4-maternal-health.md
    ├── phase-5-immunization.md
    ├── phase-6-queue-workflow.md
    ├── phase-7-sms-notifications.md
    ├── phase-8-reporting-analytics.md
    ├── phase-9-admin-staff-management.md
    └── phase-10-deployment-hardening.md
```

---

## The 10 core modules → phase mapping

| # | Module | Built in |
|---|---|---|
| 1 | Patient Registration | Phase 2 |
| 2 | Electronic Medical Records | Phase 2 |
| 3 | Maternal Health | Phase 4 |
| 4 | Immunization Tracking | Phase 5 |
| 5 | Reporting & Analytics | Phase 8 |
| 6 | Queue Management | Phase 6 |
| 7 | Staff Management | Phase 1 (accounts) + Phase 9 (admin UI) |
| 8 | SMS Notification | Phase 7 |
| 9 | Offline Sync Engine | Phase 3 (designed in Phase 0) |
| 10 | Admin Dashboard | Phase 9 |

---

## Glossary

| Term | Meaning |
|---|---|
| **PHC** | Primary Health Centre — first point of public healthcare access |
| **LGA** | Local Government Area (Nnewi North, Anambra State) |
| **NPHCDA** | National Primary Health Care Development Agency |
| **NHMIS** | National Health Management Information System (reporting backbone) |
| **DHIS2** | District Health Information Software 2 — the platform NHMIS data feeds into |
| **EPI / NPI** | (Expanded) National Programme on Immunization — routine childhood schedule |
| **ANC** | Antenatal Care |
| **PNC** | Postnatal Care |
| **EDD** | Estimated Date of Delivery |
| **LMP** | Last Menstrual Period |
| **MRN** | Medical Record Number (system-generated patient identifier) |
| **NIN** | National Identification Number (optional in this system) |
| **CHEW** | Community Health Extension Worker |
| **NDPA** | Nigeria Data Protection Act 2023 |
| **NDPC** | Nigeria Data Protection Commission |
| **PWA** | Progressive Web App |

---

## Status legend used across phase docs

`Planned` → `In progress` → `In review` → `Done`. A phase is **Done** only when
every box in its *Acceptance / exit criteria* is checked and its change-log
entry exists.
