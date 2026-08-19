#!/usr/bin/env bash
# session-hook.sh — auto-coordination hook wrapper for the session registry.
#   SessionStart  -> `session-hook.sh register`   (stamp identity, first heartbeat)
#   UserPromptSubmit -> `session-hook.sh heartbeat`(refresh liveness each turn)
# Reads the harness hook JSON on stdin to anchor identity to the real session_id.
# CONTRACT: this hook must NEVER block or fail the session — it always exits 0.
set -uo pipefail

mode="${1:-heartbeat}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Harness passes hook context as JSON on stdin (session_id, cwd, hook_event_name, ...).
payload="$(cat 2>/dev/null || true)"
uuid="$(printf '%s' "$payload" | python3 -c 'import sys,json
try: print((json.load(sys.stdin) or {}).get("session_id",""))
except Exception: print("")' 2>/dev/null || true)"

# Stable session key: prefer an exported GSESS slug (matches what a session uses to
# claim repos); else derive from the harness session_id. No key at all -> no-op (never
# pollute the registry with a churning per-invocation id).
if [ -z "${GSESS:-}" ]; then
  if [ -n "$uuid" ]; then export GSESS="auto-${uuid:0:8}"; else exit 0; fi
fi
export GCLAUDE_UUID="${GCLAUDE_UUID:-$uuid}"
# Best-effort stable pid (one level up from git-session.sh's own getppid); liveness
# still leans primarily on heartbeat freshness, so this is advisory only.
export GSESS_PID="${GSESS_PID:-$PPID}"

if [ "$mode" = "register" ]; then
  "$HERE/git-session.sh" register >/dev/null 2>&1 || true
else
  "$HERE/git-session.sh" heartbeat >/dev/null 2>&1 || true
fi
exit 0
