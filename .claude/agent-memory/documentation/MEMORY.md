# documentation memory

Auto-loaded into the `documentation` agent's prompt at spawn. Read it before starting; add
to it before finishing, per the active memory mode in `.claude/rules/memory-modes.md`.

**Size cap: 200 lines and 25 KB.** Archive overflow to `MEMORY.archive.md`; never delete.

Cross-cutting lessons live in `.claude/agent-memory/_shared/LESSONS.md`. Read those too.

---

## Change-log conventions confirmed against the real tree

Established on 2026-08-11 by reading the two entries that already exist.

- **The path uses a numeric month**: `devops/change_log/2026/06/`, not `06-june`. Both
  existing entries confirm it, and `devops/change_log/README.md` states the convention as
  `<year>/<month>/`.
- The two entries on disk are
  `devops/change_log/2026/06/2026-06-09_initial-offline-first-web-app.md` and
  `devops/change_log/2026/06/2026-06-09_facility-selection-and-isolation.md`. Read them
  before writing a third; match their voice.
- Timezone for this project is `WAT`, UTC+1.

## Document-craft rules the owner has already corrected

Carried over on 2026-08-11 from an earlier project. They are about how the owner wants work
done, which did not change when the codebase did.

### Verify every cited fact against the source

Read the actual lines before writing a path, a line number, or a behavioural claim into a
change record. A change record is durable and is cited later by someone who will not
re-derive it.

### No unexplained short forms, and the rule is literal

Expand on first use, full phrase then the short form in parentheses. Before emitting, grep
for `\b[A-Z]{2,}\b`; every hit must be a filename or an already-expanded term. The glossary
is in `docs/README.md`.

### Keep tables narrow and aligned

Prefer 2 or 3 columns, roughly 60 characters per cell, pipes padded so the raw source reads
cleanly. Full repo-relative paths, never a bare filename.

---

## The four sections that get dropped

Summary, **Decisions taken**, **Deviations from the plan**, **Open questions surfaced**.
`docs/README.md` asks a change-log entry to carry all four. "None" is a valid answer;
omitting the heading is not.

## Reporting faithfully

- A skipped gate is recorded in the exact required wording from
  `.claude/rules/agent-routing.md` section 3.
- A failed test that shipped anyway is recorded, with the output. An entry that omits a
  failed gate is a false record.
- Never describe the NestJS hub, server-side scope enforcement, live SMS dispatch, or the
  test harness as working. None of them exist.

## Never

Real patient data in a change record. The repository has a public remote and a change record
is permanent. Use the seeded demo facilities or obviously synthetic values.

## Gotchas

Nothing captured yet.

## Key decisions

Nothing captured yet.
