# Curated cross-cutting lessons

Distilled lessons from corrections, review feedback, and wrong decisions. Each entry
generalizes one or more raw events (logged append-only in `_raw/corrections.jsonl`) into a
reusable rule that agents consult **before acting**.

- **Scope.** Lessons here are cross-cutting: they apply to more than one agent, or are not
  tied to a single agent's own `MEMORY.md`.
- **Capture.** Via `/capture-lesson`. High-risk lessons go to `_proposals/` instead.
- **Size cap.** Keep this under 200 lines and 25 KB, the auto-load limit. Archive overflow
  to `LESSONS.archive.md`; never delete.
- **Schema.** `.claude/rules/lessons-learned.md`.

## Entry template

```md
### <short title>
- trigger: <when this applies>
- mistake: <wrong action or wrong decision>
- correction: <what to do instead>
- why: <reason>
- how-to-apply: <concrete steps>
- mapsToAgents: <agent-name>[, <agent-name>...]
- date: YYYY-MM-DD
- originSessionId: <session-id>
```

---

## Ported lessons

These three were carried over from an earlier project when this agent system was adapted to
PHC-Track on 2026-08-11. They are about **how the owner wants work done**, which did not
change when the codebase did. Everything else in the previous store was stack-specific and
was discarded.

### Verify a cited fact against the source before writing it into a durable document
- trigger: Writing a plan, spec, change record, or report that cites a path, a line number, a function name, or a behaviour.
- mistake: Repeating a "verified fact" handed over in a brief, or recalled from earlier in the conversation, without opening the file.
- correction: Read the actual lines before writing them down. Batch the checks into one or two parallel `Bash` calls; it costs one turn.
- why: A durable document outlives the conversation and is cited as authority by someone who will not re-derive it. A wrong path or an inverted behavioural claim becomes a permanent, confidently stated error. Verification also routinely surfaces details the brief omitted, which change what the document should say.
- how-to-apply: Before emitting, grep or `sed -n` every path and symbol the document names. Read enough surrounding context to catch what the brief left out, not only to confirm what it asserted. State in your report which claims you verified.
- mapsToAgents: phase-plan-author, documentation, planner, reviewer, compliance, research-advisor
- date: 2026-08-11
- originSessionId: config-migration

### A placeholder plus a "to be reconciled later" note is a defect, not a hedge
- trigger: Authoring one document in a set while a sibling that owns the contract normatively is missing, incomplete, or being written in parallel.
- mistake: Writing a generic placeholder and a note saying it will be reconciled when the sibling lands.
- correction: List the target directory at the start of the task and again immediately before the final pass. If the sibling appeared or changed, read it and replace every placeholder with its real content.
- why: The whole value of these documents is that a reader can act on them without inventing conventions. A placeholder pushes the invention onto the reader. Reconciling also tends to improve the design, because it surfaces a convention the sibling already established that this document can reuse instead of duplicating.
- how-to-apply: Re-list `docs/architecture/` and `docs/implementation/` before emitting. Say in your reply that the reconciliation happened, so the owner knows consistency was checked rather than assumed.
- mapsToAgents: phase-plan-author, documentation, planner
- date: 2026-08-11
- originSessionId: config-migration

### No unexplained short forms, and the rule is literal
- trigger: Writing any user-facing message, report, plan, or change record.
- mistake: Leaving an abbreviation bare because it feels like an ordinary word. The rule catches more than the obvious technical acronyms.
- correction: Expand on first use, full phrase then the short form in parentheses, for example "Medical Record Number (MRN)".
- why: The reader is judged from the chair of someone who does not know the repository. This project is unusually dense with domain acronyms (PHC, LGA, NHMIS, DHIS2, NDPA, MRN, NIN, ANC, PNC, EDD, LMP, EPI, CHEW, NPHCDA), and an unglossed one silently loses the reader.
- how-to-apply: Before emitting, grep the prose for any run of two or more capital letters, `\b[A-Z]{2,}\b`. Every hit must be either a filename or an already-expanded term. The full glossary is in `docs/README.md`.
- mapsToAgents: phase-plan-author, documentation, ui-designer, reviewer, compliance, orchestration
- date: 2026-08-11
- originSessionId: config-migration

---

## Project lessons

Nothing captured yet. Add entries here as work produces them, via `/capture-lesson`.
