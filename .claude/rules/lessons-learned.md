# Lessons-learned store and per-agent memory

How this repository turns corrections, review feedback, and wrong decisions into reusable
**lessons** that agents consult before acting.

Related: [`memory-modes.md`](memory-modes.md) for how much gets persisted.

---

## 1. The fixed lesson schema

Every distilled lesson uses the same fields.

| Field           | Meaning                                                          |
|-----------------|-------------------------------------------------------------------|
| trigger         | The situation or cue that should make an agent recall this.       |
| mistake         | The wrong action, or the wrong decision. One of the two.          |
| correction      | The right action or decision that should have happened instead.   |
| why             | Why the correction is right.                                      |
| how-to-apply    | Concrete steps for next time.                                     |
| mapsToAgents    | Agent `name:` values this lesson should improve, comma-separated. |
| date            | When captured, `YYYY-MM-DD`.                                      |
| originSessionId | The session the correction came from.                             |

### Entry template

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
- links: [[optional-wikilinks]]
```

---

## 2. Where lessons live

All stores are inside this repository and version-controlled.

| Store                                              | Holds                                |
|----------------------------------------------------|--------------------------------------|
| `.claude/agent-memory/_shared/LESSONS.md`          | Curated cross-cutting lessons.       |
| `.claude/agent-memory/<agent-name>/MEMORY.md`      | One agent's own memory, auto-loaded into its prompt. |
| `.claude/agent-memory/_proposals/`                 | High-risk proposed changes awaiting owner sign-off. |
| `.claude/agent-memory/_raw/corrections.jsonl`      | Append-only raw log, one JSON object per captured correction. |
| `.claude/agent-memory/_raw/actions.jsonl`          | One line per finished subagent.      |
| `.claude/agent-memory/_raw/tool-events.jsonl`      | One line per action-tool call.       |
| `.claude/agent-memory/_raw/user-corrections.jsonl` | Heuristic "the owner corrected us" signals. Weak evidence only. |

`<agent-name>` is the agent's `name:` frontmatter value, not its filename.

> **The `_raw/` ledgers are written but not yet mined.** The hooks append to them on every
> tool call and subagent stop, and they cost nothing. No agent currently reads them. They
> exist so that a future analysis pass has history to work from, and so the owner can grep
> them. Do not describe them as a working feedback loop.

**Routing a lesson**

- Specific to one agent, go to that agent's `MEMORY.md`.
- Applies to several agents, or to none in particular, go to `_shared/LESSONS.md`.
- Touching a safety surface (patient data, facility scope, the repository-layer invariant,
  secrets, deployment) go to `_proposals/` and wait for owner sign-off. Never auto-apply.

---

## 3. Capturing a lesson

Run `/capture-lesson`. It appends the raw event to `_raw/corrections.jsonl` and distills a
schema-shaped lesson into the right store, with `mapsToAgents` deciding the target.
High-risk lessons go to `_proposals/` instead.

Keep every `MEMORY.md` and `_shared/LESSONS.md` **under 200 lines and 25 KB**, the
auto-load limit. When a store overflows, archive the oldest entries to a sibling
`LESSONS.archive.md` rather than deleting them.

---

## 4. Consulting lessons before acting

Before starting substantive work, a write-capable agent:

1. Reads its own `MEMORY.md`, which is auto-injected when `memory: project` is enabled.
2. Reads `.claude/agent-memory/_shared/LESSONS.md`, filtering for entries whose
   `mapsToAgents` includes its own `name:`.
3. Checks `_proposals/` for a pending proposal that touches its scope.

Delegation prompts must remind the subagent to check its memory and the shared lessons
before starting, and to save what it learned afterward.

---

## 5. Changing an agent definition

There is no automated agent-improvement loop in this repository. Editing an agent
definition is a **manual, owner-approved** action, and three rules apply:

1. **Never silently weaken a guardrail.** Removing a MUST or a NEVER, widening the `tools:`
   list, or changing `model:` is a material change that needs the owner to see the diff.
2. **Record it.** An agent-definition change gets a change-log entry like any other change.
3. **Reload.** Agent definitions are read at session start. A new or edited agent is not
   spawnable until the session reloads.
