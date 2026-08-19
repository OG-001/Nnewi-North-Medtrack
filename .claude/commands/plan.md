---
description: Produce a code-grounded implementation plan. No code, plans only.
argument-hint: "<task>"
---

# /plan

Spawn the **`planner`** agent. Read-only.

**Task:** $ARGUMENTS

## Required output structure

1. **Issues to Address**: what needs to change and why.
2. **Important Notes**: constraints, existing partial implementations, risks.
3. **Implementation Strategy**: exact repo-relative paths and function or component names,
   no code, annotated `[PARALLEL]` or `[SEQUENTIAL: depends on X]`.
4. **Tests**: one tier appropriate to the change, with the reason for that tier.

Do NOT include a timeline or a rollback plan.

## Rules

- Read the relevant `docs/implementation/phase-N-*.md` FIRST. It is the authority on what
  the phase must deliver.
- Grep before planning to build. Much of the product already exists; `RUNNING.md` lists
  implemented versus deferred.
- Flag every step touching the repository layer, the outbox, facility scope, a permission,
  or the audit trail.
- Flag any Dexie schema change as a migration against real data on real devices.
- Never assume the NestJS hub, server-side scope enforcement, live SMS, or the test harness
  exists. None of them do.
- Keep it high level. Reference specific files, write no code.
- Do not overtest. One tier per change.

Present the plan and wait for explicit owner approval before handing off to any
implementation agent. To persist the plan as a document, follow with `/spec`.
