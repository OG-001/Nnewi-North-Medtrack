#!/usr/bin/env bash
# announce-subagent.sh — PHC-Track subagent spawn/finish announcer.
# Fires on SubagentStart and SubagentStop. Reads the hook event JSON from stdin,
# extracts the agent type, and emits a one-line user-facing `systemMessage`.
#
# FAIL-OPEN by design: this hook must NEVER block a subagent spawn or stop.
#   - SubagentStart cannot block (context-only event), but a non-zero exit would
#     surface stderr noise to the user.
#   - SubagentStop CAN block via exit 2 ("prevent the subagent from stopping"),
#     so we MUST always exit 0.
# Therefore: any parse/tool error falls back to a static message and exits 0.

# Read full stdin JSON (empty if none).
input=$(cat 2>/dev/null) || input=""

event=""
agent=""
agent_id=""

if command -v jq >/dev/null 2>&1; then
  event=$(printf '%s' "$input" | jq -r '.hook_event_name // ""' 2>/dev/null) || event=""
  agent=$(printf '%s' "$input" | jq -r '.agent_type // ""' 2>/dev/null) || agent=""
  agent_id=$(printf '%s' "$input" | jq -r '.agent_id // ""' 2>/dev/null) || agent_id=""
else
  # Portable fallback parse (no jq): grab the first match of each field.
  event=$(printf '%s' "$input" | grep -o '"hook_event_name"[[:space:]]*:[[:space:]]*"[^"]*"' | head -n1 | sed 's/.*:[[:space:]]*"\([^"]*\)".*/\1/') || event=""
  agent=$(printf '%s' "$input" | grep -o '"agent_type"[[:space:]]*:[[:space:]]*"[^"]*"' | head -n1 | sed 's/.*:[[:space:]]*"\([^"]*\)".*/\1/') || agent=""
  agent_id=$(printf '%s' "$input" | grep -o '"agent_id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -n1 | sed 's/.*:[[:space:]]*"\([^"]*\)".*/\1/') || agent_id=""
fi

# Defaults when fields are absent.
[ -n "$agent" ] || agent="subagent"

case "$event" in
  SubagentStart) msg="↪ Delegating to ${agent}" ;;
  SubagentStop)  msg="✔ Subagent ${agent} finished" ;;
  *)             msg="Subagent ${agent} event" ;;
esac

# Append the spawn instance id for disambiguation when present.
if [ -n "$agent_id" ]; then
  msg="${msg} (${agent_id})"
fi

# Emit the user-facing announcement. systemMessage is the supported user-visible
# channel for these events (raw stdout otherwise goes to the debug log only).
# Escape any backslash/quote in $msg defensively before embedding.
if command -v jq >/dev/null 2>&1; then
  printf '%s' "$msg" | jq -Rs '{systemMessage: .}' 2>/dev/null || printf '{"systemMessage": "Subagent spawned"}\n'
else
  # Manual JSON: msg contains only known-safe chars plus our \u escapes.
  printf '{"systemMessage": "%s"}\n' "$msg"
fi

# Best-effort debug breadcrumb (stderr on exit 0 -> debug log only, non-blocking).
printf 'announce-subagent: event=%s agent=%s id=%s\n' "${event:-?}" "$agent" "${agent_id:-}" >&2

exit 0
