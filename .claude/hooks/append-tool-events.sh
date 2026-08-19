#!/usr/bin/env bash
# append-tool-events.sh — PHC-Track per-ACTION-tool capture (Phase 1.1 / Q4 "brother").
#
# Fires on PostToolUse, SCOPED by the settings.json matcher to action tools only
# (Edit|Write|MultiEdit|NotebookEdit|Bash) so read-only tools (Read/Grep/Glob/Web*)
# never bloat the log. Appends one JSON line per action-tool call to
# tool-events.jsonl, keyed by agent_id when the call happens inside a subagent —
# so a reflection agent can reconstruct WHAT each agent did across a multi-session
# window (join to actions.jsonl on agent_id).
#
# FAIL-OPEN: must NEVER block a tool. Always exit 0; emit no decision output.
# flock-atomic append so concurrent tool calls never interleave lines.
# Field extraction is schema-tolerant and guarded (failure -> minimal line).

set +e
LEDGER_DIR="${CLAUDE_PROJECT_DIR:-$PWD}/.claude/agent-memory/_raw"
LEDGER="${LEDGER_DIR}/tool-events.jsonl"

{
  input=$(cat 2>/dev/null) || input=""
  mkdir -p "$LEDGER_DIR" 2>/dev/null
  ts=$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null)

  line=""
  if command -v jq >/dev/null 2>&1; then
    # target = the edited file path, or (for Bash) the command, truncated to 300 chars.
    # agent_id/agent_type are present when the tool runs inside a subagent; "" on the main thread.
    line=$(printf '%s' "$input" | jq -c --arg ts "$ts" '{
      ts: $ts,
      session_id: (.session_id // ""),
      agent_id: (.agent_id // ""),
      agent_type: (.agent_type // ""),
      tool: (.tool_name // ""),
      action_kind: ((.tool_name // "") | if test("^(Edit|Write|MultiEdit|NotebookEdit)$") then "mutate" elif . == "Bash" then "exec" else "other" end),
      target: (((.tool_input.file_path // .tool_input.notebook_path // .tool_input.path // .tool_input.command // "")) | tostring | .[0:300]),
      cwd: (.cwd // "")
    }' 2>/dev/null)
  fi
  # Fallback minimal line when jq is absent or the parse failed.
  [ -n "$line" ] || line=$(printf '{"ts":"%s","tool":"unknown"}' "$ts")

  if command -v flock >/dev/null 2>&1; then
    { exec 9>>"$LEDGER" && flock 9 && printf '%s\n' "$line" >&9; } 2>/dev/null
    exec 9>&- 2>/dev/null
  else
    printf '%s\n' "$line" >>"$LEDGER" 2>/dev/null
  fi
} >/dev/null 2>&1 || true

exit 0
