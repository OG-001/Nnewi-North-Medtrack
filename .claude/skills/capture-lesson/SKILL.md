---
name: capture-lesson
description: Capture a lesson learned and append a schema-valid entry to the PHC-Track lesson store, so agents consult it before acting. Use right after a notable success or failure, or when the owner corrects a mistake worth remembering. User-only.
disable-model-invocation: true
user-invocable: true
argument-hint: "[--agent <name>] [--proposal] <lesson text>"
allowed-tools: Bash(${CLAUDE_SKILL_DIR}/scripts/*)
---

# Capture a lesson

Append a single schema-valid lesson to the correct store under
`.claude/agent-memory/`, so the owning agent reads it before its next run. The
load-bearing write is done by the bundled worker script; you only orchestrate.

## Which store

| Situation                                   | Destination                          |
|---------------------------------------------|--------------------------------------|
| Applies to one agent (`--agent <name>`)     | `.claude/agent-memory/<name>/MEMORY.md` |
| Applies broadly (no flag)                   | `.claude/agent-memory/_shared/LESSONS.md` |
| Governance-sensitive (`--proposal`)         | `.claude/agent-memory/_proposals/`   |

Use `--proposal` whenever the lesson touches facility isolation, the audit trail, the
repository-layer invariant, a schema change against real data, patient-data protection,
or deployment. Those are never auto-applied. The full list is in
`.claude/agent-memory/_proposals/README.md`.

The raw event is always appended to `.claude/agent-memory/_raw/corrections.jsonl`
regardless of destination.

## Run the worker

```!
${CLAUDE_SKILL_DIR}/scripts/capture-lesson.sh $ARGUMENTS
```

## After it runs

The worker writes the entry with placeholder fields for `trigger`, `correction`, `why`,
and `how-to-apply`. **Fill those in**, using the schema in
`.claude/rules/lessons-learned.md`. A lesson with unfilled placeholders teaches nothing.

Then tell the owner which store path was written, and remind them that lessons are promoted
into agent definitions only when they run `/improve-agents`.
