# The PHC-Track agent system

A self-contained Claude Code configuration for the Nnewi North PHC Digital Health Platform,
codename PHC-Track: an offline-first Progressive Web App for Primary Health Centres in
Nnewi North Local Government Area, Anambra State, Nigeria.

> **Independent by design.** This configuration shares nothing with any other workspace.
> Every hook, script, skill, rule, and memory store resolves under this repository's own
> `.claude/`. There are no symlinks out and no cross-repository path references. Cloning
> this repository carries the whole agent system with it.

> **Adapted on 2026-08-11** from a configuration written for an unrelated Python codebase.
> Every agent, rule, hook, and command was rewritten against this repository. Any surviving
> reference to that project's stack (a Python backend, a task queue, an enterprise licence
> gate) is a leftover and is wrong: report it. `.claude/scripts/verify-config.sh` section 4
> scans for the specific terms.

---

## Layout

| Path             | Holds                                                       |
|------------------|--------------------------------------------------------------|
| `agents/`        | 24 agent definitions. The roster is in `rules/agent-routing.md`. |
| `commands/`      | 13 slash commands that spawn an agent with a preset brief.  |
| `rules/`         | 13 topic rules. The knowledge layer agents read before acting. |
| `hooks/`         | Deterministic enforcement and telemetry.                    |
| `scripts/`       | Session registration, heartbeat, and the config self-check. |
| `skills/`        | `/mode` and `/capture-lesson`.                              |
| `agent-memory/`  | Lesson stores, per-agent memory, proposals, raw ledgers.    |
| `output-styles/` | `phc-track-conduct`, the orchestrator conduct rules.        |
| `settings.json`  | Permissions, hooks, model, effort.                          |
| `.mode`          | The active memory mode: `low`, `standard`, or `deep`.       |

## Where governance lives

1. `CLAUDE.md` at the repo root: the 14 Global Constraints and routing. Start here.
2. `docs/`, for what the system must do. The phase document governs its phase.
3. `rules/shared-context.md`, for stack, domain, roles, and what is not built.
4. The active agent's own definition.
5. The topic rule matching the files being touched.

## The four highest-consequence rules

If you read nothing else in this directory, read these. Each exists because of how this
system fails, not because of tidiness.

| Rule                                   | Why                                       |
|----------------------------------------|--------------------------------------------|
| Every read is facility-scope filtered  | A miss shows one clinic another clinic's patients |
| Every write goes through the repository layer | A bypass skips the outbox and the row never syncs |
| No hard deletes of clinical data       | Soft delete plus an audit event, always    |
| Offline-first is not negotiable        | The network is never on the critical path for care |

## What is not built

The NestJS sync hub (`apps/api/`), **server-side facility scope enforcement**, live SMS
dispatch, and the test harness (Vitest, Playwright, supertest) **do not exist**. No agent
may describe any of them as working. Facility isolation currently rests on the client alone,
which is a known, planned gap, not a secret one.

## Enforcement

`hooks/safety-gate.sh` runs on every `Edit`, `Write`, `MultiEdit`, and `NotebookEdit`, and
denies deterministically. It blocks six classes:

| # | Blocked                                                              |
|---|-----------------------------------------------------------------------|
| 1 | Secret and environment files. `infra/.env.example` stays editable.    |
| 2 | Generated output: `node_modules`, `dist`, `coverage`, `.vite`, and more |
| 3 | `legacy/` and `backup/` paths, including `backup-*`                   |
| 4 | Generated lockfiles: `pnpm-lock.yaml`, and any npm or yarn lockfile   |
| 5 | Content containing a hard-coded credential                            |
| 6 | Content hard-deleting data, in code files, outside migrations         |

Rules 5 and 6 are content-based, which no path glob can express. Rule 6 is scoped to
executable file extensions on purpose: prose that *discusses* a hard delete, such as a rule
file or a change record, must stay writable, or the gate would block its own documentation.

`settings.json` `deny` covers rules 1 to 4 as well, so the protection is defence in depth.

Reads are never gated. Agents search and read freely.

## Telemetry

| Hook                        | Fires on                       | Writes                        |
|-----------------------------|--------------------------------|-------------------------------|
| `append-tool-events.sh`     | PostToolUse                    | `_raw/tool-events.jsonl`      |
| `append-action-ledger.sh`   | SubagentStop                   | `_raw/actions.jsonl`          |
| `append-user-correction.sh` | UserPromptSubmit               | `_raw/user-corrections.jsonl` |
| `announce-subagent.sh`      | Subagent start and stop        | a user-visible one-line message |
| `inject-mode.sh`            | SessionStart, UserPromptSubmit | the active memory mode        |

All ledger hooks are **fail-open**: they never block a tool or a subagent, and they append
atomically under `flock`.

> **The `_raw/` ledgers are written but not yet mined.** No agent reads them. They exist so
> a future analysis pass has history, and so the owner can grep them. This is not a working
> feedback loop, and it should not be described as one.

## Verifying the configuration

```bash
.claude/scripts/verify-config.sh
```

Checks the agent roster and frontmatter, the rule files, that no reference from the previous
project survived, that every path the config cites actually exists, that hooks and scripts
are executable and parse, that `settings.json` is valid and its deny and ask lists cover
what they must, and that the safety gate actually denies what it claims to. Run it after any
change to `.claude/`, and before committing one.

## After changing an agent definition

Agent definitions are read at **session start**. A new or edited agent is not spawnable
until the session reloads. Changing one is a manual, owner-approved action: never silently
remove a MUST or a NEVER, widen a `tools:` list, or change a `model:`.
