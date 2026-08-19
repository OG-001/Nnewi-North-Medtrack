---
description: Persist an approved plan, spec, or phase document into docs/.
argument-hint: "<document title or subject>"
---

# /spec

Spawn the **`phase-plan-author`** agent. It writes only inside `docs/`.

**Subject:** $ARGUMENTS

## Destination

| Kind of document                  | Goes in                 |
|-----------------------------------|--------------------------|
| Design or architecture            | `docs/architecture/`     |
| Product spec: modules, roles, journeys | `docs/product/`     |
| A new or revised phase document   | `docs/implementation/`   |
| Vision, scope, open questions     | `docs/master-plan.md`    |

`docs/` is the **authoritative plan**, not notes. Writing here changes what the project is
committed to deliver, so the result is a proposal until the owner approves it.

## House style, non-negotiable

- **Markdown-native header, never YAML frontmatter.** `# Title`, bold key-value metadata
  lines, `---`, then content.
- A phase document opens with `**Date:**`, `**Author:**`, `**Phase:**`, `**Depends on:**`,
  `**Status:**`.
- **Nine sections, in order:** Objective, Prerequisites, Scope, Task breakdown, Deliverables,
  Acceptance and exit criteria, Governance and guardrails, Risks and mitigations, Hand-off.
- kebab-case filenames, tables for structured data, fenced blocks with a language hint.

## Rules

- Acceptance criteria must be checkable by someone else and tied to a named artifact.
  "Sync works well" is worthless; "a replayed push produces no duplicate row" is a test.
- **Never change a locked decision.** Raise it with the owner instead.
- **Never delete an open question Q1 to Q9.** Resolve it in place with the reasoning.
- Never rewrite a plan to match what was built. Drift belongs in the change log as a
  deviation.
- Verify every path and symbol you cite against the actual source, and say which you checked.
