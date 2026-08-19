# Memory modes

Three named modes control how verbosely agents persist outcomes, decisions, and lessons.
This is not a slider: you pick one of three words.

## Selecting the mode

- Run `/mode <low|standard|deep>`. It writes the chosen word to `.claude/.mode`.
- Default when `.claude/.mode` is missing or invalid: **standard**.
- `.claude/hooks/inject-mode.sh` surfaces the active mode and its one-line write-policy on
  every session start and every turn, as `additionalContext`.

## Write policy

| Mode       | Automatically persisted                                              |
|------------|----------------------------------------------------------------------|
| `low`      | Nothing automatic. Write only when explicitly told. One-line outcomes.|
| `standard` | Build and run commands, gotchas, SOLVED patterns, the outcome, and the single key decision. |
| `deep`     | Everything in `standard`, plus full lesson entries, plus raised reasoning effort. |

A `deep` full lesson entry captures: trigger, mistake or wrong decision, correction, why,
how to apply, alternatives rejected, and context links. See
[`lessons-learned.md`](lessons-learned.md) for the schema.

The importance threshold for an automatic write rises as the mode drops, so lower modes
write less and avoid memory bloat.

## Auto-escalation

- Any multi-agent orchestration task is **floored at `standard`**, even when `low` is
  selected.
- Any task touching a **patient-data safety surface** is **floored at `standard`**: the
  sync engine or repository layer, facility scope or permissions, the audit trail, a
  database migration against real data, SMS dispatch, or deployment.
- **Never silently downgrade** below the owner's selected mode. Escalation only raises.

## Subagent isolation

`SessionStart` `additionalContext` reaches the **primary session only**. Subagents run in
isolated context windows and do not receive it. The primary **must restate the active
memory mode, and any escalation, in every delegation prompt** so the spawned subagent
applies the correct write policy.
