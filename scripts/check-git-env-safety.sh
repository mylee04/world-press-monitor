#!/usr/bin/env bash
set -euo pipefail

FORBIDDEN_PATTERNS=(
  '^\.env$'
  '^\.env\.local$'
  '^env\.local$'
)

staged_files=$(git diff --cached --name-only --diff-filter=ACMRTUB 2>/dev/null || true)
if [[ -z "$staged_files" ]]; then
  echo "[OK] No staged files."
  exit 0
fi

violations=0
for pattern in "${FORBIDDEN_PATTERNS[@]}"; do
  if echo "$staged_files" | rg -n "${pattern}" >/dev/null 2>&1; then
    violations=$((violations + 1))
  fi
done

if [[ "$violations" -gt 0 ]]; then
  echo "[BLOCK] Staged environment files are not allowed." >&2
  echo "Staged files checked:" >&2
  echo "$staged_files" >&2
  exit 1
fi

echo "[OK] No environment files are staged."
