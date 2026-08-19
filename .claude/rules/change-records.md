# Change records, plans, and documentation

Who writes what, where it goes, and the formats. The `documentation` agent owns this file;
every other agent reads it to know where its output lands.

---

## 1. Destination map

| Output                                    | Destination                    |
|-------------------------------------------|---------------------------------|
| A record of a change that was made        | `devops/change_log/YYYY/MM/`    |
| A new or revised architecture document    | `docs/architecture/`            |
| A new or revised phase document           | `docs/implementation/`          |
| A product spec: modules, roles, journeys  | `docs/product/`                 |
| Inline docstrings and comments            | The source file being documented|
| How to run the app                        | `RUNNING.md`                    |

**Forbidden destinations**: any `.env` file, anything under a `legacy/` or `backup/` path
segment, generated output, and any document created outside its logical home.

> `docs/` is the **authoritative plan**, not a historical record. Changing a phase
> document changes what the build is committed to, so it needs owner approval, and the
> `phase-plan-author` agent owns those writes. `devops/change_log/` is the opposite: it
> records what actually happened and is append-only in spirit.

---

## 2. Change-log entries

**Canonical location:** `devops/change_log/YYYY/MM/`, using a **numeric month**. The two
existing entries establish it:

```
devops/change_log/2026/06/2026-06-09_initial-offline-first-web-app.md
devops/change_log/2026/06/2026-06-09_facility-selection-and-isolation.md
```

**Naming:** `YYYY-MM-DD_short-title.md`, title 2 to 5 words, kebab-case. For phase work,
lead with the phase: `YYYY-MM-DD_phase-N-short-title.md`. The date is when the change was
made, not when it was committed. Same-day collisions append `_2`, `_3`.

**One entry per phase is Definition of Done item 5** in `docs/implementation/README.md`.
Smaller changes between phases still get an entry; the rule is one entry per change, and a
phase is one large change.

### Entry template

```md
# <Title>

| Field     | Value                       |
|-----------|-----------------------------|
| Date      | YYYY-MM-DD                  |
| Time      | HH:MM <TZ>                  |
| Author    | <name or agent>             |
| Phase     | <phase N, or n/a>           |
| Module    | <module name, or n/a>       |

## Summary

<what changed and why, in prose>

## Decisions taken

<any decision made during the work, and the reasoning>

## Deviations from the plan

<where the build differs from docs/, and why. "None" is a valid answer.>

## Open questions surfaced

<new questions for the owner, or "None". Reference Q1 to Q9 where relevant.>

## Files changed

| File                              | Change type |
|-----------------------------------|-------------|
| `apps/web/src/pages/Queue.tsx`    | modified    |
| `packages/shared/src/enums.ts`    | added       |

## Change details

### `apps/web/src/pages/Queue.tsx`

<what changed here and why>

```diff
@@ -120,7 +120,9 @@
-old line
+new line
```
```

**Rules for the entry**

- A `diff` excerpt is **mandatory** for every modified file, with line numbers.
- Use exact repo-relative paths from the git root.
- **Time must include a timezone.** Nigeria is `WAT`, UTC+1.
- New files: show the full content or the key sections. Deleted files: explain why.
- **Never paste real patient data into an entry.** Use the seeded demo records or obviously
  synthetic values. See [`ndpa-compliance.md`](ndpa-compliance.md).
- The four sections Decisions, Deviations, Open questions, and Summary are what
  `docs/README.md` asks a change-log entry to carry. Do not drop them because a change felt
  small.

---

## 3. Reporting what did not happen

An entry that omits a skipped gate is a false record. State it plainly:

> Testing: skipped, small adjustment with no behavioural change.

> Documentation: skipped, no user-visible or contract change.

If a test failed and the change shipped anyway on the owner's instruction, the entry says
so, with the failure output. A change record is evidence, not marketing.

---

## 4. Cross-referencing

- **Do** link to the live source file, the phase document, or the rule file.
- **Do not** duplicate content that already lives in `CLAUDE.md`, `.claude/rules/`, or
  `docs/`. Duplication drifts; links do not.

---

## 5. Post-change bookkeeping

After documenting a change, check whether it also requires:

1. Ticking boxes in the relevant `docs/implementation/phase-N-*.md` acceptance criteria.
2. Resolving an open question Q1 to Q9 in `docs/master-plan.md` that this phase consumed.
3. Updating `RUNNING.md`, if the change altered how the app is run, logged into, or
   demonstrated.
4. Updating the implemented-versus-deferred list in `RUNNING.md`, if the change moved
   something across that line.

Formatting for all markdown output: [`markdown-standards.md`](markdown-standards.md).
