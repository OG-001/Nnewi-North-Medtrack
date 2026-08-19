# phase-plan-author memory

Auto-loaded into the `phase-plan-author` agent's prompt at spawn. Read it before starting;
add to it before finishing, per the active memory mode in `.claude/rules/memory-modes.md`.

**Size cap: 200 lines and 25 KB.** Archive overflow to `MEMORY.archive.md`; never delete.

Cross-cutting lessons live in `.claude/agent-memory/_shared/LESSONS.md`. Read those too.

---

## Document-craft rules the owner has already corrected

These were carried over on 2026-08-11 when this agent system was adapted to PHC-Track. They
cost real correction cycles to learn and are true regardless of language or framework.

### Verify every cited fact against the source

A document under `docs/` outlives the conversation and is cited as authority by someone who
will not re-derive it. Read the actual lines before writing a path, a line number, a symbol,
or a behavioural claim. Batch the checks into one or two parallel `Bash` calls.

Verification routinely surfaces details the brief omitted, and those details change what the
document should say. Do not treat it as a formality.

State in your reply which claims you verified and which you could not.

### A placeholder is a defect, not a hedge

When a sibling document that normatively owns a contract is missing or being written in
parallel, do not write a generic placeholder plus a "reconciled later" note. List the target
directory at the start of the task **and again immediately before the final pass**, then
replace every placeholder with the sibling's real content.

Say in your reply that the reconciliation happened, so the owner knows consistency was
checked rather than assumed.

### No unexplained short forms, and the rule is literal

Expand on first use: full phrase, then the short form in parentheses. The rule catches
abbreviations that feel like ordinary words, not only the obvious technical ones.

Before emitting, grep the prose for `\b[A-Z]{2,}\b`. Every hit must be a filename or an
already-expanded term. This project is dense with them: PHC, LGA, NHMIS, DHIS2, NDPA, MRN,
NIN, ANC, PNC, EDD, LMP, EPI, CHEW, NPHCDA. The full glossary is in `docs/README.md`.

### Keep tables narrow and aligned

Prefer 2 or 3 columns. Roughly 60 characters per cell. If a cell wants a paragraph, the
content wants a bulleted list or a subheading, not a table. Pad the pipes so the raw source
is readable before it renders. Run an align, measure, split, wrap pass as an active
pre-emit step, not an afterthought.

### Full repo-relative paths, always

`apps/web/src/db/repository.ts`, never a bare `repository.ts`. Where a table is dense with
`path:line` citations, put the directory in the section heading and the filename plus line
in the cell, so cells stay short without losing the full path.

---

## House format for this repository

- **Markdown-native header, never YAML frontmatter** in `docs/` output.
- A phase document opens with `**Date:**`, `**Author:**`, `**Phase:**`, `**Depends on:**`,
  `**Status:**`.
- **Nine sections, in order**: Objective, Prerequisites, Scope, Task breakdown,
  Deliverables, Acceptance and exit criteria, Governance and guardrails, Risks and
  mitigations, Hand-off.
- Status vocabulary: `Planned`, `In progress`, `In review`, `Done`.

## Gotchas

Nothing captured yet.

## Key decisions

Nothing captured yet.
