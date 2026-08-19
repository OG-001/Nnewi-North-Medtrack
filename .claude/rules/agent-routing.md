# Agent routing and the access model

Which agent owns which task, what each may write, and the pipelines that chain them.

---

## 1. The roster (24 agents)

### Coordination and planning

| Agent               | Owns                                                     | Writes    |
|---------------------|-----------------------------------------------------------|-----------|
| `orchestration`     | Turning a goal into a gated pipeline. Returns the plan; the primary executes it. | no |
| `planner`           | Code-first exploration producing an implementation plan.   | no        |
| `phase-plan-author` | Authoring plans, specs, and phase documents into `docs/`.  | `docs/**` |

### Implementation

| Agent           | Owns                                                    | Writes                          |
|-----------------|----------------------------------------------------------|---------------------------------|
| `web-pwa`       | PWA screens, components, routing, client state.          | `apps/web/src/**` except `db/`  |
| `shared-domain` | Domain logic shared with the future API.                 | `packages/shared/src/**`        |
| `offline-sync`  | The Dexie store, repository layer, outbox, sync engine.  | `apps/web/src/db/**`, `apps/web/src/lib/sync.ts`, `apps/api/src/sync/**` |
| `api-nestjs`    | The NestJS hub: routes, services, guards, jobs.          | `apps/api/**` except migrations |
| `database`      | PostgreSQL schema, entities, queries, migrations.        | `apps/api/src/**/entities`, migration dirs |

### Domain specialists

| Agent                   | Owns                                                | Writes                     |
|-------------------------|------------------------------------------------------|----------------------------|
| `rbac-facility-scope`   | Roles, permissions, data scope, cross-facility access, audit. | permission and scope paths |
| `maternal-immunization` | ANC and postnatal care, the EPI schedule engine, defaulters. | maternal and immunization paths |
| `reporting-nhmis`       | NHMIS monthly summaries, DHIS2 and CSV export, dashboards. | reporting paths            |
| `sms-notifications`     | Provider-agnostic SMS, templates, consent, webhooks. | SMS paths                  |

### Testing

| Agent           | Owns                                                          | Writes              |
|-----------------|----------------------------------------------------------------|---------------------|
| `tester`        | Choosing and writing the one right test tier per change.       | test paths          |
| `system-testing`| The Definition of Done sequence. Executes, never edits.        | no                  |

### Audit

| Agent          | Owns                                                          | Writes      |
|----------------|----------------------------------------------------------------|-------------|
| `reviewer`     | Code review: correctness, security, standards.                 | no          |
| `compliance`   | Policy audit against the 14 Global Constraints. Graded verdict.| no          |
| `security-ndpa`| Patient-data protection, authorization, secrets, injection.    | report only |

### Design and documentation

| Agent          | Owns                                                    | Writes                             |
|----------------|----------------------------------------------------------|------------------------------------|
| `ui-designer`  | Evidence-based design proposals, prose only, no code.    | no                                 |
| `ui-wireframe` | ASCII and markdown wireframes for owner acceptance.      | no                                 |
| `documentation`| Change-log entries and run docs. The only writer of change records. | `devops/change_log/**`, `RUNNING.md` |

### Research and supply chain

| Agent                | Owns                                              | Writes      |
|----------------------|----------------------------------------------------|-------------|
| `research-advisor`   | Architecture and best-practice research, cited.    | no          |
| `dependency-auditor` | The installed dependency tree: advisories, staleness, licences. | report only |

### Tooling, git, deployment

| Agent          | Owns                                                         | Writes         |
|----------------|---------------------------------------------------------------|----------------|
| `git-workflow` | All git and GitHub operations. Stops before anything outward-facing. | git state only |
| `deployment`   | Docker, Compose, nginx, and the Phase 10 production release. All CRITICAL. | `infra/**` |

---

## 2. Access model

- **Coordination**: `orchestration`.
- **Read-only** (plan, review, research, design): `planner`, `reviewer`, `compliance`,
  `research-advisor`, `ui-designer`, `ui-wireframe`, `git-workflow`.
- **Read plus a report file**: `security-ndpa`, `dependency-auditor`.
- **Read and execute, no source edits**: `system-testing`.
- **Read and write, implementation**: `web-pwa`, `shared-domain`, `offline-sync`,
  `api-nestjs`, `database`, `rbac-facility-scope`, `maternal-immunization`,
  `reporting-nhmis`, `sms-notifications`, `tester`, `documentation`, `phase-plan-author`,
  `deployment`.

No agent may write outside its declared scope. No agent writes a `.env` file, a `legacy/` or
`backup/` path, or generated output. The safety gate blocks all three regardless.

**Overlap rule.** Where two agents could own a file, the more specific one wins:
`offline-sync` beats `web-pwa` inside `apps/web/src/db/`; `rbac-facility-scope` beats
`shared-domain` inside `packages/shared/src/permissions.ts`; `database` beats `api-nestjs`
for a migration.

---

## 3. Mandatory gates for every coding task

These are non-negotiable:

1. **Planning.** Always run `planner` before any coding, even a one-line fix.
2. **Owner acceptance.** Always present the plan and wait for explicit approval.
3. **Review.** Always run `reviewer` after coding.
4. **Compliance.** Always run `compliance` after `reviewer`.

**Testing** may be skipped only for a typo or single-field change with no behavioural
effect, and the skip must be stated in exactly these words:

> Testing: skipped, small adjustment with no behavioural change.

It is mandatory for anything touching the local store, the sync engine, permissions or
scope, a schedule engine, reporting arithmetic, or more than one file. Any clinic workflow
additionally needs an **offline** test before its phase exits, which is Definition of Done
item 3.

**Documentation** may be skipped only with:

> Documentation: skipped, no user-visible or contract change.

---

## 4. Pipelines

```
Standard feature
  planner → OWNER GATE → web-pwa|shared-domain|api-nestjs → tester → reviewer
          → compliance → documentation

Bug fix
  planner → OWNER GATE → owning agent → tester → reviewer → compliance

Anything touching the local store or sync
  planner → OWNER GATE → offline-sync → tester (offline e2e MANDATORY)
          → reviewer → compliance → documentation

Anything touching permissions, scope, or audit
  planner → OWNER GATE → rbac-facility-scope → tester → security-ndpa
          → reviewer → compliance → documentation

Database schema change (Phase 1 onward)
  planner → OWNER GATE → database (schema) → database (migration) → tester
          → reviewer → compliance → documentation

Full-stack feature (Phase 1 onward)
  planner → OWNER GATE → shared-domain → database → api-nestjs → web-pwa
          → tester → reviewer → compliance → documentation

UI change
  ui-designer → ui-wireframe → OWNER GATE → planner → web-pwa → tester
          → reviewer → compliance

Reporting change
  planner → OWNER GATE → reporting-nhmis → tester → reviewer → compliance
          → documentation

SMS change
  planner → OWNER GATE → sms-notifications → security-ndpa (consent + minimisation)
          → tester → reviewer → compliance → documentation

New plan, spec, or phase document
  planner → phase-plan-author (writes to docs/) → OWNER GATE

Architecture decision
  research-advisor → planner → OWNER GATE → implementation

Phase exit (Definition of Done)
  system-testing → security-ndpa + dependency-auditor [PARALLEL] → compliance
          → documentation → git-workflow (STOPS before push)

Phase 10 production release
  system-testing → security-ndpa + dependency-auditor [PARALLEL] → compliance
          → OWNER GATE (explicit, per command) → deployment
```

---

## 5. Parallel execution

- **Read-only agents run concurrently.** Good pairs: `reviewer` with `compliance`;
  `security-ndpa` with `dependency-auditor`; `research-advisor` with `planner`.
- **Write agents run sequentially.** `web-pwa`, `shared-domain`, `offline-sync`,
  `api-nestjs`, `database`, and the four domain specialists never run at the same time, to
  avoid file conflicts.
- **`compliance` always runs after all writes.**
- **Owner gates block.** Nothing downstream starts until the owner approves.
- Aggregate all results before moving to the next stage.

---

## 6. Block conditions

Stop immediately and report if any of these is true:

- A secret, API key, provider token, or credential was committed.
- Real patient data appears in a document, a log, a test fixture, or a change record.
- A hard delete of clinical data: `DELETE FROM`, `DROP TABLE`, `TRUNCATE`, or a Dexie
  delete outside the repository layer's soft-delete path.
- A write to a Dexie domain table bypassing `apps/web/src/db/repository.ts`.
- A read path missing its facility-scope filter, or a permission check testing the role
  without the scope.
- A cross-facility access path with no reason prompt or no `sensitive_access` audit event.
- An SMS send path with no consent check.
- A synced entity relying on a server-assigned identifier instead of a client UUID.
- A clinic workflow that does not function with the network disabled.
- `reviewer`, `compliance`, or `security-ndpa` reported a CRITICAL finding.
- `tester` reported a failure or a regression.
- A report or change record claims a deferred capability is working.

**Approve when** every agent passes, only WARNING-level issues remain and are documented,
and `pnpm lint`, `pnpm typecheck`, and `pnpm build` are clean.

---

## 7. Spawning a subagent

Subagents do not inherit the primary's injected context. Every delegation prompt must state:

1. **The repo root**, the absolute path of this repository's git root. Treat all relative
   paths as relative to it.
2. **The active memory mode** (see [`memory-modes.md`](memory-modes.md)), because the
   `SessionStart` injection reaches the primary only.
3. **The instruction to read** `CLAUDE.md`, the rule files matching its scope, the relevant
   `docs/implementation/phase-N-*.md`, its own memory, and
   `.claude/agent-memory/_shared/LESSONS.md` before starting.
4. **The instruction to save what it learned** afterward, per the active mode.
5. **What is not built yet**, so the subagent does not assume the NestJS hub, server-side
   scope enforcement, live SMS, or the test harness already exists.
