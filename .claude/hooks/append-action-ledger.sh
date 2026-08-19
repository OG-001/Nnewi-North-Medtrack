#!/usr/bin/env bash
# append-action-ledger.sh — PHC-Track agent ACTION LEDGER (Phase 1 / Q4 "brother").
#
# Fires on SubagentStop. Appends ONE JSON line per finished subagent to an
# append-only ledger so a later (nightly) reflection agent can mine a
# MULTI-SESSION record of what every agent did — the cross-session window a
# single isolated agent can never see for itself.
#
# FAIL-OPEN, by design — it must NEVER block a subagent from stopping:
#   * always exit 0; never exit 2; never emit {"decision":"block"} / {"continue":false}.
#   * any parse/IO failure is swallowed; a minimal line is still written when possible.
# Concurrent SubagentStop fires (multiple subagents finishing at once) are
# serialized with flock so ledger lines never interleave.
#
# Tool/file extraction from the subagent transcript is BEST-EFFORT only: the
# per-line transcript schema is undocumented and the file may be mid-flush, so
# the parse is schema-tolerant, capped, and guarded (failure -> empty fields).

set +e

LEDGER_DIR="${CLAUDE_PROJECT_DIR:-$PWD}/.claude/agent-memory/_raw"
LEDGER="${LEDGER_DIR}/actions.jsonl"

{
  input=$(cat 2>/dev/null) || input=""
  mkdir -p "$LEDGER_DIR" 2>/dev/null

  get() { # $1 = top-level JSON field name
    if command -v jq >/dev/null 2>&1; then
      printf '%s' "$input" | jq -r --arg k "$1" '.[$k] // ""' 2>/dev/null
    else
      printf '%s' "$input" \
        | grep -o "\"$1\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -n1 \
        | sed 's/.*:[[:space:]]*"\([^"]*\)".*/\1/'
    fi
  }

  event=$(get hook_event_name);  [ -n "$event" ] || event="SubagentStop"
  session=$(get session_id)
  agent_id=$(get agent_id)
  agent_type=$(get agent_type);  [ -n "$agent_type" ] || agent_type="unknown"
  cwd=$(get cwd)
  transcript=$(get transcript_path)
  pmode=$(get permission_mode)
  ts=$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null)

  # IMPORTANT: at SubagentStop, transcript_path points at the PARENT (main-session)
  # transcript, NOT the finishing subagent's own transcript. Mining it for
  # file_path / tool_use therefore records the PARENT's activity — identical for
  # every subagent and misleading. So we DO NOT mine it here. Reliable per-agent
  # tool/file attribution belongs in a PostToolUse hook keyed by agent_id (v1.1);
  # this hook records only the trustworthy identity fields. transcript_path is
  # kept but honestly labelled session_transcript (it is the session, not the agent).
  line=""
  if command -v jq >/dev/null 2>&1; then
    line=$(jq -c -n \
      --arg ts "$ts" --arg event "$event" --arg session "$session" \
      --arg agent_id "$agent_id" --arg agent_type "$agent_type" \
      --arg cwd "$cwd" --arg transcript "$transcript" --arg pmode "$pmode" \
      '{ts:$ts, event:$event, session_id:$session, agent_id:$agent_id,
        agent_type:$agent_type, cwd:$cwd, permission_mode:$pmode,
        session_transcript:$transcript}' 2>/dev/null)
  fi
  # Fallback minimal line (manual JSON) when jq is absent or failed.
  [ -n "$line" ] || line=$(printf '{"ts":"%s","event":"%s","agent_type":"%s","agent_id":"%s","session_id":"%s"}' \
      "$ts" "$event" "$agent_type" "$agent_id" "$session")

  # Atomic append — serialize concurrent SubagentStop fires.
  if command -v flock >/dev/null 2>&1; then
    { exec 9>>"$LEDGER" && flock 9 && printf '%s\n' "$line" >&9; } 2>/dev/null
    exec 9>&- 2>/dev/null
  else
    printf '%s\n' "$line" >>"$LEDGER" 2>/dev/null
  fi
} >/dev/null 2>&1 || true

exit 0
