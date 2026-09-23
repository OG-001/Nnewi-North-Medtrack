# PHC-Track documentation

The build blueprint and the operating manuals for the Nnewi North PHC Digital
Health Platform, codename **PHC-Track**: an offline-first Progressive Web App
for Primary Health Centres in Nnewi North LGA, Anambra State, Nigeria.

`docs/` is the **authoritative plan**. Where the running code and these
documents disagree, prefer the plan's intent, its Objective and Acceptance
sections, and record the conflict in `devops/change_log/` rather than diverging
silently.

---

## Start here

| If you want to | Read |
|----------------|------|
| Set up a machine to run it | [`operations/environment-setup.md`](operations/environment-setup.md) |
| Run it and see the demo | [`../RUNNING.md`](../RUNNING.md) |
| Understand what it is and why | [`master-plan.md`](master-plan.md) |
| Deploy it to the pilot server | [`operations/deployment-runbook.md`](operations/deployment-runbook.md) |

---

## The plan

| Document | Covers |
|----------|--------|
| [`master-plan.md`](master-plan.md) | Vision, scope, MVP, success metrics, open questions Q1 to Q9 |
| [`product/`](product/) | The ten modules, the seven roles, user journeys |
| [`implementation/`](implementation/) | The eleven build phases, 0 to 10, with acceptance criteria |

## Architecture

| Document | Covers |
|----------|--------|
| [`architecture/system-architecture.md`](architecture/system-architecture.md) | How the pieces fit together |
| [`architecture/offline-sync-design.md`](architecture/offline-sync-design.md) | The sync engine. The highest-risk component. |
| [`architecture/data-model.md`](architecture/data-model.md) | Entities, common columns, the change ledger |
| [`architecture/api-design.md`](architecture/api-design.md) | REST conventions, auth, the error model, endpoints |
| [`architecture/security-and-compliance.md`](architecture/security-and-compliance.md) | NDPA 2023 position |
| [`architecture/tech-stack-recommendation.md`](architecture/tech-stack-recommendation.md) | The locked stack and the device performance budget |

## Operations

| Document | Covers |
|----------|--------|
| [`operations/environment-setup.md`](operations/environment-setup.md) | Every dependency, step by step, from a bare machine |
| [`operations/deployment-runbook.md`](operations/deployment-runbook.md) | Deploying, upgrading, rolling back, the pilot |
| [`operations/backup-and-restore.md`](operations/backup-and-restore.md) | Encrypted backups and rehearsing a restore |
| [`operations/observability.md`](operations/observability.md) | Health endpoints and what is worth an alert |
| [`operations/incident-response.md`](operations/incident-response.md) | A breach or a lost device, and the 72-hour clock |
| [`operations/records-of-processing.md`](operations/records-of-processing.md) | Controller, DPO, retention, what data goes where |
| [`operations/uat-script.md`](operations/uat-script.md) | Acceptance testing, one script per role |

## Evidence

[`evidence/`](evidence/) holds screenshots and a screen recording captured from
the running application, with the scripts that regenerate them. All data shown
is synthetic.

---

## Glossary

| Term | Meaning |
|------|---------|
| PHC | Primary Health Centre |
| LGA | Local Government Area |
| NHMIS | National Health Management Information System, Nigeria's reporting backbone |
| DHIS2 | The platform NHMIS data feeds into |
| NDPA | Nigeria Data Protection Act 2023 |
| NPHCDA | National Primary Health Care Development Agency |
| MRN | Medical Record Number, the facility-prefixed identifier on a patient's card |
| NIN | National Identification Number. Optional, and never required. |
| ANC | Antenatal care |
| PNC | Postnatal care |
| EPI | Expanded Programme on Immunization, the routine childhood schedule |
| CHEW | Community Health Extension Worker |
| DPO | Data Protection Officer |
| EDD | Estimated Date of Delivery |
| PWA | Progressive Web App, an installable web app that works with no network |

---

## What is built, and what is not

The honest position is maintained in three places, and they are kept in step:

- [`../CLAUDE.md`](../CLAUDE.md) section 5, for the current phase position.
- [`../RUNNING.md`](../RUNNING.md), for what a reader can actually try.
- [`../devops/change_log/`](../devops/change_log/), for what shipped and when.

**Nothing has been deployed.** SMS is switched off for this deployment. Never
describe a deferred capability as if it exists, and never describe a built one
as missing.
