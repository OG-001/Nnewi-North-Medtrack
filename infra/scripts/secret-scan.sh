#!/usr/bin/env bash
# Fails if a credential pattern appears in tracked files.
#
# Intended for CI and for a pre-release check. It scans what git tracks, so an
# ignored .env is out of scope by design.
set -uo pipefail

cd "$(git rev-parse --show-toplevel)"

# Long base64/hex runs are excluded from the generic sweep: lockfile integrity
# hashes and inline data URIs would swamp the signal.
PATTERNS=(
  'ghp_[A-Za-z0-9]{30,}'
  'github_pat_[A-Za-z0-9_]{50,}'
  'AKIA[0-9A-Z]{16}'
  'sk-[A-Za-z0-9]{32,}'
  '-----BEGIN [A-Z ]*PRIVATE KEY-----'
  'postgres(ql)?://[^:@/[:space:]]+:[^@/[:space:]]+@'
  'xox[baprs]-[A-Za-z0-9-]{10,}'
)

status=0
while IFS= read -r file; do
  case "$file" in
    pnpm-lock.yaml|*.png|*.jpg|*.webm|*.pptx|*.ico) continue ;;
  esac
  for pattern in "${PATTERNS[@]}"; do
    if matches=$(grep -nEI "$pattern" "$file" 2>/dev/null); then
      # Drop lines that are obviously placeholders rather than credentials.
      # A template SHOULD contain a connection-string shape; what must never
      # appear is a working value in it.
      # Placeholders and variable interpolation are not credentials. A template
      # SHOULD show the shape of a connection string; what must never appear is
      # a working value in it.
      matches=$(echo "$matches" | grep -vEi 'CHANGE_ME|YOUR_|REPLACE_ME|<[a-z_]+>|EXAMPLE|xxxx' || true)
      matches=$(echo "$matches" | grep -vE '\$\{[A-Za-z_]|\$[A-Z_]{3,}' || true)
      [ -z "$matches" ] && continue

      # The development compose credentials are documented and intentional.
      if [ "$file" = "infra/docker-compose.yml" ] && echo "$matches" | grep -q 'phc_dev_only'; then
        continue
      fi
      echo "SECRET? $file"
      echo "$matches" | sed 's/^/    /'
      status=1
    fi
  done
done < <(git ls-files)

if [ "$status" -eq 0 ]; then
  echo "secret-scan: clean ($(git ls-files | wc -l) tracked files)"
else
  echo "secret-scan: FAILED, see above" >&2
fi
exit "$status"
