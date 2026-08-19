#!/usr/bin/env bash
# append-user-correction.sh — PHC-Track heuristic CORRECTION-signal capture (Phase 1.1 / Q4 gap #3).
#
# Fires on UserPromptSubmit. When the user's prompt LOOKS corrective (heuristic keyword match),
# appends a lightweight record to user-corrections.jsonl so the reflection-auditor can correlate
# a user correction with the agent run(s) immediately preceding it — the "agent got corrected"
# signal the action ledger otherwise lacks. This is a HEURISTIC HINT (source-tagged), NOT ground
# truth, and is kept in a SEPARATE file from the curated corrections.jsonl (/capture-lesson) so
# it can't collide with that file's schema.
#
# FAIL-OPEN: UserPromptSubmit CAN block a prompt via exit 2 — we ALWAYS exit 0 and never emit a
# decision. flock-atomic append. Any parse/IO failure is swallowed.

set +e
LEDGER_DIR="${CLAUDE_PROJECT_DIR:-$PWD}/.claude/agent-memory/_raw"
LEDGER="${LEDGER_DIR}/user-corrections.jsonl"

{
  input=$(cat 2>/dev/null) || input=""
  mkdir -p "$LEDGER_DIR" 2>/dev/null
  ts=$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null)

  if command -v jq >/dev/null 2>&1; then
    prompt=$(printf '%s' "$input" | jq -r '.prompt // .user_prompt // ""' 2>/dev/null)
    session=$(printf '%s' "$input" | jq -r '.session_id // ""' 2>/dev/null)
  else
    prompt=$(printf '%s' "$input" | grep -o '"prompt"[[:space:]]*:[[:space:]]*"[^"]*"' | head -n1 | sed 's/.*:[[:space:]]*"\([^"]*\)".*/\1/')
    session=$(printf '%s' "$input" | grep -o '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -n1 | sed 's/.*:[[:space:]]*"\([^"]*\)".*/\1/')
  fi

  # Heuristic corrective-signal detector (case-insensitive). A HINT only — the reflection-auditor
  # treats it as weak evidence to correlate, never as an authoritative "mistake".
  lc=$(printf '%s' "$prompt" | tr '[:upper:]' '[:lower:]')
  is_corrective=false
  if printf '%s' "$lc" | grep -Eq '(^|[^a-z])(no|nope|wrong|incorrect|not (what|right|correct)|that.?s not|don.?t|do not|instead|actually|revert|undo|rollback|mistake|you (should|shouldn.?t|were|got)|why (did|do) you|fix (that|the|this)|re-?do|not like that|misunderstood)([^a-z]|$)'; then
    is_corrective=true
  fi

  # Only log corrective-looking turns (keeps the file meaningful). Excerpt capped to 240 chars.
  if [ "$is_corrective" = true ]; then
    line=""
    if command -v jq >/dev/null 2>&1; then
      line=$(jq -c -n --arg ts "$ts" --arg s "$session" --arg p "${prompt:0:240}" \
        '{ts:$ts, session_id:$s, source:"auto-heuristic", is_corrective:true, prompt_excerpt:$p}' 2>/dev/null)
    fi
    [ -n "$line" ] || line=$(printf '{"ts":"%s","source":"auto-heuristic","is_corrective":true}' "$ts")
    if command -v flock >/dev/null 2>&1; then
      { exec 9>>"$LEDGER" && flock 9 && printf '%s\n' "$line" >&9; } 2>/dev/null
      exec 9>&- 2>/dev/null
    else
      printf '%s\n' "$line" >>"$LEDGER" 2>/dev/null
    fi
  fi
} >/dev/null 2>&1 || true

exit 0
