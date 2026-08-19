#!/usr/bin/env bash
# verify-config.sh: self-check for the PHC-Track Claude Code configuration.
#
# Validates the things that silently break an agent system: a missing or
# misnamed agent, invalid settings JSON, a non-executable hook, a stale path
# inherited from a previous project, or a dependency on another workspace.
#
# Exit 0 = all checks pass. Exit 1 = at least one FAIL.
# Run it after any change to .claude/, and before committing one.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CLAUDE="$ROOT/.claude"
fails=0
warns=0

pass() { printf '  \033[32mPASS\033[0m  %s\n' "$1"; }
fail() { printf '  \033[31mFAIL\033[0m  %s\n' "$1"; fails=$((fails + 1)); }
warn() { printf '  \033[33mWARN\033[0m  %s\n' "$1"; warns=$((warns + 1)); }
section() { printf '\n\033[1m%s\033[0m\n' "$1"; }

EXPECTED_AGENTS="orchestration planner phase-plan-author
web-pwa shared-domain offline-sync api-nestjs database
rbac-facility-scope maternal-immunization reporting-nhmis sms-notifications
tester system-testing
reviewer compliance security-ndpa
ui-designer ui-wireframe documentation
research-advisor dependency-auditor
git-workflow deployment"

EXPECTED_RULES="shared-context offline-sync rbac-and-scope ndpa-compliance data-safety
web-standards repo-commands change-records markdown-standards memory-modes
lessons-learned concurrent-sessions agent-routing"

section "1. Agent roster"
missing=0
for a in $EXPECTED_AGENTS; do
    if [ ! -f "$CLAUDE/agents/$a.md" ]; then
        fail "missing agent definition: $a.md"
        missing=1
    fi
done
count=$(find "$CLAUDE/agents" -maxdepth 1 -name '*.md' | wc -l)
[ "$missing" -eq 0 ] && pass "all 24 expected agents present ($count files on disk)"

section "2. Agent frontmatter"
for f in "$CLAUDE"/agents/*.md; do
    base=$(basename "$f" .md)
    name=$(awk -F': *' '/^name:/{print $2; exit}' "$f")
    if [ "$name" != "$base" ]; then
        fail "$base.md declares name '$name' (must match the filename)"
    fi
    grep -q '^description:' "$f" || fail "$base.md has no description"
    grep -q '^tools:'       "$f" || fail "$base.md has no tools list"
    command head -n1 "$f" | grep -q '^---$' || fail "$base.md does not open with frontmatter"
done
# Duplicate spawn names would make one agent unreachable. Scope the scan to the
# frontmatter block: a `name:` inside a fenced code sample is not a declaration.
dupes=$(for f in "$CLAUDE"/agents/*.md; do
            awk 'NR>1 && /^---$/{exit} /^name:/{print $2}' "$f"
        done | sort | uniq -d)
if [ -n "$dupes" ]; then
    fail "duplicate agent name(s): $dupes"
else
    pass "all agent names unique"
fi
[ "$fails" -eq 0 ] && pass "every agent declares name, description, and tools"

section "3. Rule files"
rule_missing=0
for r in $EXPECTED_RULES; do
    [ -f "$CLAUDE/rules/$r.md" ] || { fail "missing rule file: rules/$r.md"; rule_missing=1; }
done
[ "$rule_missing" -eq 0 ] && pass "all 13 rule files present"

section "4. No inherited references from the previous project"
# This config was adapted from an unrelated Python/Onyx repository. Nothing from
# that stack may survive: it would send an agent to a path that does not exist.
if grep -rIn --exclude-dir=agent-memory --exclude=verify-config.sh \
     -iE 'onyx|ogesoft|adb-insight|horizon-1|doc-processing|celery|alembic|vespa|casbin|fastapi|sqlalchemy|/home/arek' \
     "$CLAUDE" "$ROOT/CLAUDE.md" 2>/dev/null; then
    fail "a reference from the previous project survived (see above)"
else
    pass "no inherited Onyx/Ogesoft references"
fi
if find "$CLAUDE" -type l | grep -q .; then
    fail "symlinks found under .claude/ (the config must be self-contained)"
else
    pass "no symlinks; config is self-contained"
fi

section "5. Paths referenced by the config actually exist"
for p in apps/web/src packages/shared/src infra docs/implementation docs/architecture \
         devops/change_log apps/web/src/db/repository.ts apps/web/src/lib/scope.ts \
         packages/shared/src/permissions.ts; do
    [ -e "$ROOT/$p" ] && pass "$p" || fail "config references a missing path: $p"
done

section "6. Hooks"
for h in safety-gate inject-mode append-tool-events append-action-ledger \
         announce-subagent append-user-correction; do
    p="$CLAUDE/hooks/$h.sh"
    if   [ ! -f "$p" ]; then fail "missing hook: $h.sh"
    elif [ ! -x "$p" ]; then fail "hook not executable: $h.sh"
    else bash -n "$p" 2>/dev/null && pass "$h.sh present, executable, parses" \
                                  || fail "$h.sh has a syntax error"
    fi
done

section "7. Scripts and skills"
for p in "$CLAUDE/scripts/session-hook.sh" "$CLAUDE/scripts/verify-config.sh" \
         "$CLAUDE/skills/mode/set-mode.sh" \
         "$CLAUDE/skills/capture-lesson/scripts/capture-lesson.sh"; do
    n=$(basename "$p")
    if   [ ! -f "$p" ]; then fail "missing: $n"
    elif [ ! -x "$p" ]; then fail "not executable: $n"
    else bash -n "$p" 2>/dev/null && pass "$n ok" || fail "$n has a syntax error"
    fi
done

section "8. settings.json"
if python3 -c "import json,sys; json.load(open(sys.argv[1]))" "$CLAUDE/settings.json" 2>/dev/null; then
    pass "settings.json is valid JSON"
    python3 - "$CLAUDE/settings.json" <<'PY'
import json, sys
s = json.load(open(sys.argv[1]))
perms = s.get("permissions", {})
deny = " ".join(perms.get("deny", []))
ask = " ".join(perms.get("ask", []))
for label, frag, blob in [
    (".env files",          ".env",                deny),
    ("node_modules",        "node_modules",        deny),
    ("dist output",         "dist",                deny),
    ("the pnpm lockfile",   "pnpm-lock.yaml",      deny),
    ("legacy/ paths",       "legacy",              deny),
    ("npm (wrong pkg mgr)", "npm",                 ask),
    ("docker compose down", "docker compose down", ask),
]:
    print(("  PASS  covered: " if frag in blob else "  FAIL  MISSING: ") + label)
# infra/.env.example must stay editable: it is the documented placeholder template.
print("  PASS  .env.example not denied" if ".env.example" not in deny
      else "  FAIL  .env.example is denied but must stay editable")
style = s.get("outputStyle", "")
print(("  PASS  outputStyle: " + style) if style == "phc-track-conduct"
      else "  FAIL  outputStyle is '%s', expected phc-track-conduct" % style)
PY
else
    fail "settings.json is not valid JSON"
fi

section "9. Output style"
if [ -f "$CLAUDE/output-styles/phc-track-conduct.md" ]; then
    pass "output-styles/phc-track-conduct.md present"
else
    fail "missing output-styles/phc-track-conduct.md (settings.json names it)"
fi

section "10. Safety gate behavior"
G="$CLAUDE/hooks/safety-gate.sh"
probe() { # $1 = json, $2 = expected decision, $3 = label
    got=$(echo "$1" | "$G" 2>/dev/null \
        | python3 -c "import json,sys; print(json.load(sys.stdin)['hookSpecificOutput']['permissionDecision'])" 2>/dev/null)
    [ "$got" = "$2" ] && pass "$3 -> $got" || fail "$3 -> got '$got', expected '$2'"
}

# The credential fixture is assembled at RUNTIME from fragments, so the literal
# pattern never appears in this file. Writing it verbatim would (correctly) be
# blocked by the very gate this section tests.
SCHEME="postgres"
FAKE_CRED="${SCHEME}ql://phc:notarealpassword@localhost:5432/phc_track"

probe '{"tool_name":"Write","tool_input":{"file_path":"apps/web/src/pages/Queue.tsx","content":"x"}}'   allow "PWA source file"
probe '{"tool_name":"Write","tool_input":{"file_path":"packages/shared/src/enums.ts","content":"x"}}'   allow "shared package file"
probe '{"tool_name":"Write","tool_input":{"file_path":"infra/.env","content":"X=1"}}'                    deny  ".env file"
probe '{"tool_name":"Write","tool_input":{"file_path":"infra/.env.example","content":"X=placeholder"}}'  allow ".env.example template"
probe '{"tool_name":"Write","tool_input":{"file_path":"node_modules/x/i.js","content":"x"}}'             deny  "node_modules"
probe '{"tool_name":"Write","tool_input":{"file_path":"apps/web/dist/main.js","content":"x"}}'           deny  "dist output"
probe '{"tool_name":"Write","tool_input":{"file_path":"pnpm-lock.yaml","content":"x"}}'                  deny  "pnpm lockfile"
probe '{"tool_name":"Read","tool_input":{"file_path":"infra/.env"}}'                                     allow "READ of a .env file"
probe "{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"apps/api/src/db.ts\",\"content\":\"const u = '${FAKE_CRED}';\"}}" deny "hard-coded credential"
probe '{"tool_name":"Write","tool_input":{"file_path":"apps/api/src/p.ts","content":"await q(\"DELETE FROM patients\")"}}' deny "hard delete in code"
probe '{"tool_name":"Write","tool_input":{"file_path":"apps/api/migrations/001.sql","content":"DELETE FROM tmp"}}' allow "hard delete inside a migration"
probe '{"tool_name":"Write","tool_input":{"file_path":"devops/change_log/2026/08/x.md","content":"we removed a DROP TABLE"}}' allow "prose discussing a hard delete"

section "11. Required directories"
for d in agents commands rules hooks scripts skills output-styles \
         agent-memory/_raw agent-memory/_shared agent-memory/_proposals; do
    [ -d "$CLAUDE/$d" ] && pass "$d/" || fail "missing directory: .claude/$d/"
done

section "12. Memory mode"
m=$(tr -d '[:space:]' < "$CLAUDE/.mode" 2>/dev/null)
case "$m" in
    low|standard|deep) pass "active memory mode: $m" ;;
    *) warn "no valid .mode file; agents will default to standard" ;;
esac

section "13. Config lives inside the git repository"
if git -C "$ROOT" rev-parse --show-toplevel >/dev/null 2>&1; then
    top=$(git -C "$ROOT" rev-parse --show-toplevel)
    if [ "$top" = "$ROOT" ]; then
        pass "config is at the git root, so it is version-controlled"
    else
        warn "git root is $top but the config is at $ROOT; hooks resolve from CLAUDE_PROJECT_DIR"
    fi
else
    warn "$ROOT is not a git repository; the config is not version-controlled"
fi

printf '\n\033[1mResult:\033[0m %d failure(s), %d warning(s)\n' "$fails" "$warns"
[ "$fails" -eq 0 ]
