#!/usr/bin/env bash
# set-mode.sh: PHC-Track /mode skill writer.
# Validates the argument is one of low|standard|deep, writes it to
# $CLAUDE_PROJECT_DIR/.claude/.mode, and prints the new mode + its one-line
# write-policy. Rejects any other value with a clear message and nonzero exit.
set -euo pipefail

mode="${1:-}"

case "$mode" in
  low)
    policy="Nothing automatic, write to memory ONLY when explicitly told; record one-line outcomes only." ;;
  standard)
    policy="Build/run commands, gotchas, SOLVED patterns + the task outcome and the single key decision." ;;
  deep)
    policy="Standard PLUS full lesson entries (trigger, mistake, correction, why, how-to-apply, alternatives, links) AND raises reasoning effort." ;;
  "")
    echo "usage: /mode <low|standard|deep>" >&2
    exit 1 ;;
  *)
    echo "invalid mode: '$mode', must be one of: low | standard | deep" >&2
    exit 1 ;;
esac

dir="${CLAUDE_PROJECT_DIR:-$PWD}/.claude"
mkdir -p "$dir"
printf '%s\n' "$mode" > "$dir/.mode"

echo "memory mode set to: $mode"
echo "write-policy: $policy"
echo "(multi-agent orchestration tasks floor at standard; never downgrade. See .claude/rules/memory-modes.md)"
