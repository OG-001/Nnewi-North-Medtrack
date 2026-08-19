---
name: mode
description: Set the active memory mode for this session (low, standard, or deep). Controls how verbosely outcomes/decisions/lessons are persisted to memory. Writes the chosen word to .claude/.mode so the SessionStart/UserPromptSubmit injector surfaces it on every turn.
argument-hint: [low|standard|deep]
disable-model-invocation: true
user-invocable: true
allowed-tools: Bash(${CLAUDE_SKILL_DIR}/set-mode.sh *)
---

# Set memory mode

Run the validating writer with the user's argument. It rejects anything that is
not `low`, `standard`, or `deep`, writes the chosen mode to
`$CLAUDE_PROJECT_DIR/.claude/.mode`, and prints the new mode plus its one-line
write-policy.

```!
${CLAUDE_SKILL_DIR}/set-mode.sh "$ARGUMENTS"
```

Active mode is now: !`cat "${CLAUDE_PROJECT_DIR}/.claude/.mode" 2>/dev/null || echo standard`

Per-mode write-policy and the auto-escalation rule live in
`.claude/rules/memory-modes.md`. Multi-agent orchestration tasks
floor at `standard` even when `low` is selected; never downgrade below the
user's selection.
