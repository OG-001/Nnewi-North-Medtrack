#!/usr/bin/env bash
# inject-mode.sh — PHC-Track memory-mode injector.
# Fires on SessionStart (matcher startup|resume|clear) and UserPromptSubmit.
# Reads $CLAUDE_PROJECT_DIR/.claude/.mode and emits the active mode + its
# one-line write-policy as additionalContext so every session/turn sees it.
#
# FAIL-OPEN by design: this hook must NEVER block. UserPromptSubmit can block a
# prompt via exit 2; we always exit 0. A missing OR invalid .mode falls back to
# "standard". hookEventName is derived from the firing event on stdin so one
# script serves both events.

# Read the hook event JSON from stdin (empty if none).
payload="$(cat 2>/dev/null)" || payload=""

# Derive the firing event name from stdin; default to SessionStart if absent.
event=""
if command -v jq >/dev/null 2>&1; then
  event="$(printf '%s' "$payload" | jq -r '.hook_event_name // ""' 2>/dev/null)" || event=""
else
  event="$(printf '%s' "$payload" | grep -o '"hook_event_name"[[:space:]]*:[[:space:]]*"[^"]*"' | head -n1 | sed 's/.*:[[:space:]]*"\([^"]*\)".*/\1/')" || event=""
fi
[ -n "$event" ] || event="SessionStart"

# Read the active mode, defaulting to standard when missing or invalid.
mode_file="${CLAUDE_PROJECT_DIR:-$PWD}/.claude/.mode"
mode="$(tr -d '[:space:]' < "$mode_file" 2>/dev/null || true)"
case "$mode" in
  low|standard|deep) ;;
  *) mode="standard" ;;
esac

# Per-mode one-line write-policy summary.
case "$mode" in
  low)      policy="write to memory ONLY when explicitly told; one-line outcomes only" ;;
  standard) policy="persist build/run commands, gotchas, SOLVED patterns + outcome + the single key decision" ;;
  deep)     policy="standard PLUS full lesson entries (trigger/mistake/correction/why/apply/alternatives/links) + raised reasoning effort" ;;
esac

ctx="Active memory mode: ${mode}. Write-policy: ${policy}. Cross-repo tasks floor at standard; never downgrade. See .claude/rules/memory-modes.md."

# Emit the exact additionalContext JSON for the firing event.
if command -v jq >/dev/null 2>&1; then
  jq -n --arg e "$event" --arg c "$ctx" \
    '{hookSpecificOutput:{hookEventName:$e, additionalContext:$c}}' 2>/dev/null \
    || printf '%s\n' "$ctx"
else
  # Manual JSON fallback. $event is a known event name; escape $ctx quotes.
  esc=$(printf '%s' "$ctx" | sed 's/\\/\\\\/g; s/"/\\"/g')
  printf '{"hookSpecificOutput":{"hookEventName":"%s","additionalContext":"%s"}}\n' "$event" "$esc"
fi

exit 0
