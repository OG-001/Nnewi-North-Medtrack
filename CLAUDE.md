# PHC-Track (Nnewi North PHC Digital Health Platform): repository governance

This file is the **root governance entrypoint** for the Claude Code agent system in this
repository. It carries repo-wide constraints and routing only. Detailed workflow rules live
in `.claude/agents/*.md`; topic rules live in `.claude/rules/*.md`.

> **What this system is.** An offline-first Progressive Web App (an installable web app that
> keeps working with no network) for Primary Health Centres in **Nnewi North Local Government
> Area, Anambra State, Nigeria**. Working name "Nnewi North PHC Digital Health Platform",
> codename **PHC-Track**. It holds real patient health data, so every rule below exists for a
> clinical-safety or data-protection reason, not for tidiness.

> **This repository is a fully independent line of development.** It shares no configuration,
> no agents, and no memory with any other workspace. Never read policy from, write to, or
> depend on any path outside this repository.

---

## 1. Repository layout (git root = this directory)

| Path              | What it is                                                     |
|-------------------|----------------------------------------------------------------|
| `apps/web/`       | The offline-first PWA. React 18, TypeScript, Vite, Tailwind, Dexie. |
| `apps/api/`       | The NestJS sync hub: auth, sync, SMS, admin. Phases 1, 3, 7.   |
| `packages/shared/`| Domain logic shared by the PWA and the future API.             |
| `infra/`          | Docker, Compose, nginx, and the environment template.          |
| `devops/`         | The per-phase change log. Historical record of what shipped.   |
| `docs/`           | The build blueprint. **The authoritative plan.** Read before building. |
| `.claude/`        | This agent system (agents, rules, hooks, skills, memory).      |

Inside `apps/web/src/`:

| Path                        | What it is                                          |
|-----------------------------|------------------------------------------------------|
| `apps/web/src/pages/`       | Route-level screens (11 files, one per module screen).|
| `apps/web/src/components/`  | Shared UI: `AppShell`, `ui`, `icons`, forms, modals.  |
| `apps/web/src/db/`          | Dexie schema, the repository layer, seed data, types. |
| `apps/web/src/lib/`         | Session, data scope, sync, device id, format, reporting. |

Inside `packages/shared/src/`:

| File                          | What it holds                                       |
|-------------------------------|------------------------------------------------------|
| `enums.ts`                    | Roles, statuses, and every domain enumeration.       |
| `permissions.ts`              | The role-to-permission matrix.                       |
| `facilities.ts`               | The registry of all 76 Nnewi North LGA facilities.   |
| `ids.ts`                      | Client-generated UUIDs and Medical Record Numbers.   |
| `dates.ts`                    | Estimated Date of Delivery and date arithmetic.      |
| `immunization-schedule.ts`    | The routine childhood immunization schedule engine.  |
| `anc-model.ts`                | The antenatal care contact schedule engine.          |
| `config.ts`                   | App configuration defaults.                          |

Inside `docs/`:

| Path                     | What it is                                              |
|--------------------------|----------------------------------------------------------|
| `docs/master-plan.md`    | Vision, scope, MVP definition, open questions Q1 to Q9.  |
| `docs/product/`          | Modules and features, roles and permissions, journeys.   |
| `docs/architecture/`     | Six design documents. See section 4.                     |
| `docs/implementation/`   | The phase index plus 11 phase documents, phases 0 to 10. |

---

## 2. Locked decisions (do not re-litigate)

These come from `docs/README.md` and `docs/implementation/README.md`. A build agent that
wants to change one of these must stop and raise it with the owner.

| Decision            | Value                                                      |
|---------------------|-------------------------------------------------------------|
| Application type    | Offline-first PWA, installable, targets low-end Android      |
| Frontend            | React 18, TypeScript, Vite, Tailwind, Dexie over IndexedDB   |
| Backend             | NestJS REST API, modular monolith, Redis and BullMQ for jobs |
| Database            | PostgreSQL, per-facility device store plus a central hub     |
| Monorepo            | pnpm workspaces: `apps/*` and `packages/*`                   |
| Hosting             | Dockerized and self-hosted; patient data stays in Nigeria    |
| SMS                 | Provider-agnostic, with Africa's Talking and Termii adapters |
| Reporting target    | NHMIS-aligned monthly summaries, exportable to DHIS2         |
| Compliance baseline | Nigeria Data Protection Act 2023, NPHCDA primary care norms  |
| Patient identifier  | System-generated MRN. NIN is optional and never required.    |
| Identity for sync   | Client-generated UUIDs for every synced entity               |

Glossary of the acronyms above: **PHC** is a Primary Health Centre. **LGA** is a Local
Government Area. **NHMIS** is the National Health Management Information System, Nigeria's
reporting backbone. **DHIS2** is the platform NHMIS data feeds into. **NDPA** is the Nigeria
Data Protection Act 2023. **MRN** is a Medical Record Number. **NIN** is a National
Identification Number. **ANC** is antenatal care. **CHEW** is a Community Health Extension
Worker. Full glossary in `docs/README.md`.

---

## 3. Global Constraints (non-negotiable)

Violating any of these is a CRITICAL finding that blocks merge.

1. **Never edit `.env` files.** Propose the keys and values as text instead. The one
   editable template is `infra/.env.example`, which must never contain a real value.
2. **Never commit a secret.** No API key, provider token, database password, or JWT signing
   secret in the repository, in an image, or in a log line.
3. **Never hard-delete clinical data.** Every deletion is a soft delete that sets
   `deleted_at` and writes an audit event. No `DELETE FROM`, no `DROP TABLE`, no
   `TRUNCATE` outside a reviewed migration.
4. **Every write goes through the repository layer.** `apps/web/src/db/repository.ts` writes
   the domain row, appends the outbox entry, bumps `rev` and `updated_at`, and records the
   audit event in **one IndexedDB transaction**. Never write a domain table directly.
5. **Offline-first is non-negotiable.** Any clinic workflow must work with the network
   disabled and reconcile on reconnect. The network is never on the critical path for care.
6. **Client-generated UUIDs for every synced entity.** Never rely on a server-assigned
   identifier for a record that can be created offline.
7. **A permission check needs both halves**: the role must grant the action **and** the
   target record must be inside the user's data scope. Checking one without the other is a
   security defect. See [`.claude/rules/rbac-and-scope.md`](.claude/rules/rbac-and-scope.md).
8. **Cross-facility access is explicit, reason-prompted, and audited** as a
   `sensitive_access` event. Never widen a query to other facilities as a convenience.
9. **Schedules and templates are configuration, not code.** The immunization schedule, the
   ANC contact model, and the SMS templates must be editable without a code change.
10. **Never modify anything inside a `legacy/` or `backup/` path segment**, and never edit
    generated output: `node_modules/`, `dist/`, `coverage/`, `.vite/`, or `pnpm-lock.yaml`.
11. **Plan before implementing.** Coding work runs `planner` first and waits for explicit
    owner approval. The relevant `docs/implementation/phase-N-*.md` document is the authority
    on what the phase must deliver.
12. **Review after coding, compliance after review.** Evaluate test and documentation impact
    for every change.
13. **Record every change** in `devops/change_log/YYYY/MM/`.
14. **Everything is strictly typed.** No `any`, no non-null assertion used to silence the
    compiler, no `@ts-ignore` without a cited reason on the line above.

Constraints 1, 2, 3, and 10 are additionally enforced deterministically by
[`.claude/hooks/safety-gate.sh`](.claude/hooks/safety-gate.sh). Keep that hook aligned with
this list.

---

## 4. Where new work goes

| Kind of work                          | Destination                          |
|---------------------------------------|---------------------------------------|
| New plan, spec, or design document    | `docs/architecture/`                  |
| New or revised phase document         | `docs/implementation/`                |
| Change record for a change that shipped | `devops/change_log/YYYY/MM/`        |
| PWA screens, components, local store  | `apps/web/src/`                       |
| Domain logic shared with the API      | `packages/shared/src/`                |
| Sync hub, REST endpoints, jobs        | `apps/api/` (create in Phase 1)       |
| Docker, Compose, nginx, environment   | `infra/`                              |

`devops/change_log/` is the historical record. Read it for context. It is append-only in
spirit: correct a past entry only to fix an error, never to rewrite history.

---

## 5. The phase model

The build is 11 phases, 0 to 10, indexed in `docs/implementation/README.md`. Two rules
matter to every agent:

- **Do not start phase N+1 until phase N exits.** Each phase document has an explicit
  *Acceptance / exit criteria* section, and a phase is Done only when every box is checked
  and its change-log entry exists.
- **Phase 10 is a production release** touching real patient data and live SMS. It is
  CRITICAL and confirmation-required for every command.

The minimum viable product is phases 0, 1, 2, 3, and 6. Phases 4, 5, and 6 may run in
parallel once phase 3 (the sync engine) has exited.

**Current state as of 2026-08-24**: the PWA in `apps/web/` is built and working offline.
The NestJS sync hub in `apps/api/` is built: facility-scoped auth, the push/pull sync
protocol with conflict resolution, **server-side scope enforcement**, and the SMS module.

Phases 7 (SMS) and 8 (reporting) are built. Phase 10's **engineering** deliverables are
built: production compose, TLS, hardened images, security headers, encrypted backups with a
rehearsed restore, readiness and metrics endpoints, a secret scanner, and the runbooks in
`docs/operations/`.

**Nothing has been deployed.** No production restore rehearsal, no real-device verification,
no live alerting, no training, no UAT, no pilot. The controller and DPO are unnamed (Q9), so
the pilot cannot lawfully begin. SMS has never run against a real provider.

Clinical configuration (the immunization schedule and ANC contact model) is editable through
the admin UI and hub-authoritative, cross-facility patient access is reason-prompted and
audited, and staff, facility and audit administration are server-side: disabling an account
now revokes its refresh tokens and devices rather than relabelling a local row. Patient
duplicate merge and the conflict-review queue are built.

Still unbuilt in Phase 9: queue-stations configuration, audit-log export, and per-facility
permission toggles.

An agent must never describe a deferred capability as if it exists, and must not describe a
built one as missing. Check `devops/change_log/` for the current position.

---

## 6. Topic rules

Every agent reads the rules relevant to its scope before acting.

| Rule file                                              | Covers                              |
|--------------------------------------------------------|-------------------------------------|
| [`shared-context.md`](.claude/rules/shared-context.md) | Stack, domain, modules, roles, phase map |
| [`offline-sync.md`](.claude/rules/offline-sync.md)     | Outbox, watermark, conflict rules, sync invariants |
| [`rbac-and-scope.md`](.claude/rules/rbac-and-scope.md) | Roles, permissions, facility data scope |
| [`ndpa-compliance.md`](.claude/rules/ndpa-compliance.md) | Patient-data protection, secrets, residency, audit |
| [`data-safety.md`](.claude/rules/data-safety.md)       | Local store, repository layer, PostgreSQL, migrations |
| [`web-standards.md`](.claude/rules/web-standards.md)   | React, TypeScript, Tailwind, Dexie conventions |
| [`repo-commands.md`](.claude/rules/repo-commands.md)   | Install, run, test, build, deploy commands |
| [`change-records.md`](.claude/rules/change-records.md) | Change-log format and destination map |
| [`markdown-standards.md`](.claude/rules/markdown-standards.md) | Table and prose formatting |
| [`memory-modes.md`](.claude/rules/memory-modes.md)     | How much gets persisted to memory   |
| [`lessons-learned.md`](.claude/rules/lessons-learned.md) | The lesson store and capture flow |
| [`concurrent-sessions.md`](.claude/rules/concurrent-sessions.md) | Git locking across parallel sessions |
| [`agent-routing.md`](.claude/rules/agent-routing.md)   | Which agent owns which task         |

---

## 7. Source of truth order

1. This file, for repo-wide constraints and routing.
2. `docs/`, for what the system must do. The phase document governs its phase.
3. `.claude/rules/shared-context.md`, for shared project context.
4. The active agent's own definition, for role-specific workflow.
5. The topic rule file matching the files being touched.

When the running code and `docs/` disagree, prefer the plan's **intent** (its Objective and
Acceptance sections), and record the conflict in the change log rather than silently
diverging. That instruction comes from `docs/README.md` and it is binding.
