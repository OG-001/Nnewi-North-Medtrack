#!/usr/bin/env bash
# capture-lesson.sh: PHC-Track lesson capture worker.
#
# Appends ONE schema-valid lesson to a store under .claude/agent-memory/, and the raw
# event to _raw/corrections.jsonl. Deterministic and auditable: the model orchestrates,
# this script performs the load-bearing write.
#
# Usage:
#   capture-lesson.sh [--agent <name>] [--proposal] <lesson text>
#
#   --agent <name>  attribute the lesson to one agent. It lands in that agent's
#                   MEMORY.md. Without it, the lesson goes to _shared/LESSONS.md.
#   --proposal      governance-sensitive lesson. Lands in _proposals/ for owner
#                   sign-off instead of being applied to a store.
#
# The store is curated in place: if it exceeds ~200 lines the oldest entries are
# archived to a sibling .archive.md file, never deleted.

set -euo pipefail

# Resolve the repo root from this script's location (…/.claude/skills/capture-lesson/scripts).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
MEM_DIR="$REPO_ROOT/.claude/agent-memory"

AGENT=""
PROPOSAL=false
ARGS=()

while [ $# -gt 0 ]; do
  case "$1" in
    --agent)    AGENT="${2:-}"; shift 2 ;;
    --proposal) PROPOSAL=true; shift ;;
    *)          ARGS+=("$1"); shift ;;
  esac
done

LESSON="${ARGS[*]:-}"
if [ -z "$LESSON" ]; then
  echo "usage: /capture-lesson [--agent <name>] [--proposal] <lesson text>" >&2
  exit 1
fi

DATE="$(date -u +%Y-%m-%d)"
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
SESSION="${CLAUDE_SESSION_ID:-unknown}"

# --- 1. Always append the raw event (append-only, never curated) ---
RAW_DIR="$MEM_DIR/_raw"
mkdir -p "$RAW_DIR"
python3 - "$RAW_DIR/corrections.jsonl" "$TS" "$SESSION" "${AGENT:-unspecified}" "$LESSON" <<'PY'
import json, sys
path, ts, session, agent, lesson = sys.argv[1:6]
with open(path, "a", encoding="utf-8") as fh:
    fh.write(json.dumps({
        "ts": ts, "session_id": session, "agent": agent,
        "source": "capture-lesson", "lesson": lesson,
    }, ensure_ascii=False) + "\n")
PY

# --- 2. Pick the destination store ---
if [ "$PROPOSAL" = true ]; then
  DEST_DIR="$MEM_DIR/_proposals"
  SLUG="$(printf '%s' "$LESSON" | tr -cs '[:alnum:]' '-' | cut -c1-40 | sed 's/-*$//')"
  DEST="$DEST_DIR/${DATE}_${SLUG}.md"
  mkdir -p "$DEST_DIR"
  HEADER="# Proposed lesson (awaiting owner sign-off)"
elif [ -n "$AGENT" ]; then
  DEST_DIR="$MEM_DIR/$AGENT"
  DEST="$DEST_DIR/MEMORY.md"
  mkdir -p "$DEST_DIR"
  HEADER="# Memory for agent: $AGENT"
else
  DEST_DIR="$MEM_DIR/_shared"
  DEST="$DEST_DIR/LESSONS.md"
  mkdir -p "$DEST_DIR"
  HEADER="# Curated cross-cutting lessons"
fi

[ -f "$DEST" ] || printf '%s\n\nSchema: .claude/rules/lessons-learned.md\n' "$HEADER" > "$DEST"

# --- 3. Curate: archive the oldest entries when the store exceeds the auto-load cap ---
if [ "$(wc -l < "$DEST")" -gt 200 ]; then
  ARCHIVE="${DEST%.md}.archive.md"
  [ -f "$ARCHIVE" ] || printf '# Archived entries (overflow from %s)\n\n' "$(basename "$DEST")" > "$ARCHIVE"
  python3 - "$DEST" "$ARCHIVE" <<'PY'
import sys
dest, archive = sys.argv[1], sys.argv[2]
lines = open(dest, encoding="utf-8").read().split("\n")
# Entry blocks start at a '### ' heading. Keep the preamble plus the newest half.
starts = [i for i, l in enumerate(lines) if l.startswith("### ")]
if len(starts) > 2:
    cut = starts[len(starts) // 2]
    moved = lines[starts[0]:cut]
    kept = lines[:starts[0]] + lines[cut:]
    with open(archive, "a", encoding="utf-8") as fh:
        fh.write("\n".join(moved) + "\n")
    open(dest, "w", encoding="utf-8").write("\n".join(kept))
    print(f"archived {len(starts) // 2} entries to {archive}", file=sys.stderr)
PY
fi

# --- 4. Append the schema-shaped entry ---
TITLE="$(printf '%s' "$LESSON" | cut -c1-60)"
{
  printf '\n### %s\n' "$TITLE"
  printf -- '- trigger: <fill in: when this applies>\n'
  printf -- '- mistake: %s\n' "$LESSON"
  printf -- '- correction: <fill in: what to do instead>\n'
  printf -- '- why: <fill in: reason>\n'
  printf -- '- how-to-apply: <fill in: concrete steps>\n'
  printf -- '- mapsToAgents: %s\n' "${AGENT:-unspecified}"
  printf -- '- date: %s\n' "$DATE"
  printf -- '- originSessionId: %s\n' "$SESSION"
} >> "$DEST"

echo "lesson appended to: ${DEST#"$REPO_ROOT"/}"
echo "raw event appended to: .claude/agent-memory/_raw/corrections.jsonl"
if [ "$PROPOSAL" = true ]; then
  echo "NOTE: staged as a PROPOSAL. It is not applied until the owner signs off."
fi
echo "Fill in the placeholder fields before the entry is useful."
