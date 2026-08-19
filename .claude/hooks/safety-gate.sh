#!/usr/bin/env bash
# PreToolUse safety gate for the PHC-Track repository.
#
# Deterministic policy enforcement. It never prompts: it either allows or denies.
# Defense-in-depth behind the settings.json `deny` list, plus two content-based
# protections that a path glob cannot express.
#
# Blocks file-MUTATING tools (Edit|Write|MultiEdit|NotebookEdit) when:
#   1. the target is a secret / env file (.env, .env.*, .deploy-credentials)
#        EXCEPT .env.example, which is the documented placeholder template
#   2. the target is a generated / vendor output dir
#   3. the target is a legacy/ or backup/ path
#   4. the target is a generated lockfile (pnpm-lock.yaml)
#   5. the written content contains a hard-coded credential
#   6. the written content hard-deletes data (DELETE FROM / DROP TABLE / TRUNCATE)
#        outside infra/ and migration paths
#
# Rules 5 and 6 exist because this application holds patient health data, which is
# sensitive personal data under the Nigeria Data Protection Act 2023. See
# CLAUDE.md Global Constraints 1, 2, 3 and 10, and .claude/rules/ndpa-compliance.md.
#
# Read-only tools are never inspected: agents search and read freely.
#
# Claude Code passes a JSON object on stdin with `tool_name` and `tool_input`.
# We reply on stdout with a PreToolUse hookSpecificOutput object whose
# `permissionDecision` is one of: allow | deny | ask.

set -euo pipefail

INPUT=$(cat)

allow() {
    echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}'
    exit 0
}

deny() {
    python3 -c "
import json, sys
print(json.dumps({'hookSpecificOutput': {
    'hookEventName': 'PreToolUse',
    'permissionDecision': 'deny',
    'permissionDecisionReason': sys.argv[1],
}}))
" "$1"
    exit 0
}

read_json_field() {
    echo "$INPUT" | python3 -c "import json, sys; data = json.load(sys.stdin); $1" 2>/dev/null || true
}

TOOL_NAME=$(read_json_field "print(data.get('tool_name', ''))")
FILE_PATH=$(read_json_field "ti = data.get('tool_input', {}); print(ti.get('file_path') or ti.get('notebook_path') or ti.get('path') or '')")

# Only gate file-modifying tools. The settings.json matcher already scopes this;
# re-check defensively in case the hook is reused elsewhere.
EDIT_TOOLS="Edit|Write|MultiEdit|NotebookEdit"
echo "$TOOL_NAME" | grep -qE "^($EDIT_TOOLS)$" || allow

# No path detected: allow (the tool schema may differ).
[ -n "$FILE_PATH" ] || allow

# --- Rule 1: secret / environment files ---
# .env.example is the documented template (infra/.env.example) and stays editable,
# but it must only ever carry placeholder values.
BASENAME=$(basename "$FILE_PATH")
if [ "$BASENAME" != ".env.example" ] && echo "$BASENAME" | grep -qE '^\.env(\..+)?$|^\.deploy-credentials$|^env\.template$'; then
    deny "BLOCKED: editing environment or secret files is forbidden (CLAUDE.md Global Constraint 1). Propose the required keys and values to the owner as text instead. The one editable template is infra/.env.example, which must contain placeholder values only."
fi

# --- Rule 2: generated / vendor output ---
if echo "$FILE_PATH" | grep -qE '(^|/)(node_modules|dist|dist-ssr|build|coverage|\.vite|\.next|\.turbo|playwright-report|test-results)(/|$)'; then
    deny "BLOCKED: editing generated or vendor output directories is forbidden (CLAUDE.md Global Constraint 10). Change the source files instead and rebuild with 'pnpm build'."
fi

# --- Rule 3: legacy/ and backup/ paths ---
if echo "$FILE_PATH" | grep -qiE '(^|/)legacy(/|$)|(^|/)backup(-[^/]*)?(/|$)'; then
    deny "BLOCKED: modifying files in legacy/ or backup/ paths is forbidden (CLAUDE.md Global Constraint 10)."
fi

# --- Rule 4: generated lockfile ---
if echo "$BASENAME" | grep -qE '^(pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$'; then
    deny "BLOCKED: pnpm-lock.yaml is GENERATED. Edit the relevant package.json and run 'pnpm install' from the repo root to regenerate it. A package-lock.json or yarn.lock must never exist here: this is a pnpm workspace (see .claude/rules/repo-commands.md)."
fi

# --- Rules 5 and 6: content-based checks ---
# Inspects the content this edit would introduce: Write.content, Edit.new_string,
# and every MultiEdit edits[].new_string. Never inspects what is being removed.
CONTENT_VERDICT=$(echo "$INPUT" | python3 -c "
import json, re, sys

try:
    data = json.load(sys.stdin)
except Exception:
    print('OK'); raise SystemExit

ti = data.get('tool_input') or {}
path = ti.get('file_path') or ti.get('notebook_path') or ti.get('path') or ''

parts = []
if isinstance(ti.get('content'), str):
    parts.append(ti['content'])
if isinstance(ti.get('new_string'), str):
    parts.append(ti['new_string'])
for e in (ti.get('edits') or []):
    if isinstance(e, dict) and isinstance(e.get('new_string'), str):
        parts.append(e['new_string'])
new = '\n'.join(parts)

if not new:
    print('OK'); raise SystemExit

# Rule 5: hard-coded credentials. Deliberately narrow patterns, chosen to have
# effectively no false positives on ordinary source code.
CREDENTIALS = [
    (r'postgres(?:ql)?://[^:/\s]+:[^@\s]{3,}@', 'a PostgreSQL URL carrying a password'),
    (r'AKIA[0-9A-Z]{16}', 'an AWS access key id'),
    (r'sk-[A-Za-z0-9_\-]{20,}', 'an API secret key'),
    (r'gh[pousr]_[A-Za-z0-9]{36,}', 'a GitHub token'),
    (r'-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----', 'a private key block'),
    (r'eyJ[A-Za-z0-9_\-]{10,}\.eyJ[A-Za-z0-9_\-]{10,}\.', 'a signed JSON Web Token'),
]
for pattern, label in CREDENTIALS:
    if re.search(pattern, new):
        print('CREDENTIAL:' + label); raise SystemExit

# Rule 6: hard deletes of data.
# Scoped to EXECUTABLE code files only. Prose that discusses these verbs (a rule
# file, an agent definition, a change record) must stay writable, or the gate
# would block the very documentation that explains it.
# Also exempt: infra/, migration dirs, and test dirs, where a reviewed and
# owner-approved destructive statement can legitimately live.
CODE = ('.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.sql', '.py')
is_code = path.endswith(CODE)
exempt_dir = re.search(r'(^|/)(infra|migrations?|__tests__|tests?|\.claude)(/|$)', path) is not None
if is_code and not exempt_dir:
    m = re.search(r'\b(DELETE\s+FROM|DROP\s+TABLE|DROP\s+DATABASE|TRUNCATE\s+TABLE)\b', new, re.IGNORECASE)
    if m:
        print('HARDDELETE:' + re.sub(r'\s+', ' ', m.group(1)).strip()); raise SystemExit

print('OK')
" 2>/dev/null || echo "OK")

case "$CONTENT_VERDICT" in
    CREDENTIAL:*)
        deny "BLOCKED: this edit writes what looks like ${CONTENT_VERDICT#CREDENTIAL:} into a tracked file (CLAUDE.md Global Constraint 2). This application handles patient health data, which is sensitive personal data under the Nigeria Data Protection Act 2023, and a leaked credential is a notifiable breach. Secrets come from the environment or a secret store at runtime. Document the key name in infra/.env.example with a placeholder and give the real value to the owner as text. If this is a test fixture, make it obviously fake and unmatched by these patterns."
        ;;
    HARDDELETE:*)
        deny "BLOCKED: this edit introduces '${CONTENT_VERDICT#HARDDELETE:}', a hard delete (CLAUDE.md Global Constraint 3). Clinical data is NEVER hard-deleted: a delete sets deleted_at and writes an audit event, so the row survives for the audit trail and for sync. See .claude/rules/data-safety.md. If a genuinely destructive migration is required, it belongs in a migration path, goes through the 'database' agent, and needs explicit owner approval for that exact statement."
        ;;
esac

allow
