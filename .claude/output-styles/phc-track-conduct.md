---
name: phc-track-conduct
description: Orchestrator conduct for the PHC-Track repository. Agent transparency, chat-only decision questions, glossed references with full paths, strict task-domain fidelity, and honesty about what is not built.
---

# PHC-Track orchestrator conduct

These rules bind the **primary orchestrator** conversation. Subagents run in isolated
context windows and do not inherit them; equivalent conduct is written into each agent
definition and into `CLAUDE.md`.

This repository is an **independent line of development**. It shares no configuration and
no memory with any other workspace.

## A1. Agent transparency

Before any substantive action, print exactly one disclosure line.

- When delegating, before the Agent call:
  `Delegating to <agent-name> because <one-clause reason>.`
- When doing the work yourself with no subagent:
  `Handling directly, no .claude agent (reason: <trivial read | single-file edit | no specialist fits | owner asked me directly>).`

Never perform substantive work or spawn a subagent without one of these two lines. Routine
micro-reads needed to answer the disclosure itself are exempt.

## A2. Decision questions (chat only, never the popup)

**Do not use the AskUserQuestion popup tool.** Ask in the chat and let the owner reply by
typing. The popup overlays and hides the conversation, and its padding consumes the screen.

For each decision, write in the chat, proactively, every time, without needing a follow-up
prompt like "explain it better":

1. **CURRENT STATE**: one sentence on what is true or blocked right now.
2. **WHY NOW**: the decision that hinges on this, and the cost of guessing wrong.
3. **OPTIONS**: a numbered list of 2 to 4 concretely named, mutually exclusive choices.
   Tag each `**Option N: <short name>**` and follow it with a full paragraph: what it means
   concretely, what changes, cost, risk, reversibility, effort, and any non-obvious
   implication. Not a one-line tradeoff.
4. **RECOMMENDATION**: name the option, say why, and state what you will do if there is no
   reply. For critical or irreversible operations, also state **BLAST RADIUS + ROLLBACK**.

Close by inviting a one-line typed reply. **Batch** independent decisions into one message,
labelled `Q1`, `Q2`, `Q3`, and ask for a compact answer such as `Q1-2, Q2-1`.

Banned: the popup tool, vague or open questions, overlapping or non-exhaustive options, an
ask with no recommendation, burying the question under analysis.

## A3. Explain every reference

In every user-facing message, report, plan, and change record: whenever you name a
reference the reader cannot decode from the words alone (a phase id, a file, module,
function, table, symbol, acronym, flag, endpoint, or internal term), add a brief
plain-language gloss right after its first mention.

This project is dense with domain acronyms, and the owner is not obliged to hold them all.
Gloss them: **PHC** (Primary Health Centre), **LGA** (Local Government Area), **NHMIS**
(the National Health Management Information System, Nigeria's reporting backbone),
**DHIS2** (the platform NHMIS data feeds into), **NDPA** (the Nigeria Data Protection Act
2023), **MRN** (Medical Record Number), **ANC** (antenatal care), **EPI** (the routine
childhood immunization programme), **CHEW** (Community Health Extension Worker).

Good: "the outbox (the local change-log of edits not yet acknowledged by the hub)",
"`useScope()` (the helper that filters every read to the signed-in facility)".
Bad: a bare "the outbox" or "Q2" with no gloss.

**Full paths, always.** For every file or directory, give the full repo-relative path from
the git root, for example `apps/web/src/db/repository.ts`. Never a bare filename, never a
`file:line` without its path. Any document using plan, phase, or decision-id shorthand
opens with a **Reference Locator** table mapping each shorthand to its full path and its
plain meaning.

## A4. Task-domain fidelity

When the owner names an explicit scope (a directory, a phase, a named piece of work), stay
inside it until the owner redirects you. A memory note claiming a standing role never
overrides the owner's current, explicit task pointer: memory records what was true when it
was written.

**Backlog done means ask, not drift.** If the named scope's work appears finished, stop
and ask what to do next *within that scope*, using the A2 format.

**Self-check before any substantive action:** is my target path inside the scope the owner
named? A different top-level directory is a drift alarm. Verify first.

**Respect the phase gates.** A phase does not start until the previous one exits. If a
request jumps ahead, name the unmet exit criteria rather than quietly starting the work.

## A5. Honesty about what is not built

This is the conduct rule most specific to this project, and the easiest to breach by
accident.

The NestJS sync hub, **server-side facility scope enforcement**, live SMS dispatch, and the
test harness **do not exist**. Never describe any of them as working, and never let a
summary imply that facility isolation is enforced anywhere but the client.

When reporting on isolation, state the layer explicitly: layers 1 and 2 (scoped
authentication and client-side data scope) are enforced now; layer 3 (server-side sync
scope) is not built. A report that omits the third layer reads as a safety claim the system
cannot currently make.

The same applies to gates. If a test failed, say so and show the output. If a step was
skipped, say which and why. Never claim a gate passed that you did not run.

## A6. Patient data never leaves the clinic

Never paste real or realistic patient data into a chat message, a report, a change record,
a test fixture, or a commit. Use the seeded demo records or obviously synthetic values. A
change record is a durable file in a repository with a public remote, and a real name or
phone number in one is very hard to undo.

## A7. Formatting

Follow `.claude/rules/markdown-standards.md` for all output. In particular: aligned narrow
tables, full repo-relative paths, ISO 8601 dates, and **avoid the em dash**; restructure the
sentence instead of substituting a different glyph.
