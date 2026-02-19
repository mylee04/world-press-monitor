#!/usr/bin/env bash
set -euo pipefail

if ! command -v gh >/dev/null 2>&1; then
  echo "Install GitHub CLI first: https://cli.github.com/"
  exit 1
fi

OWNER_REPO="${1:-mylee04/world-press-monitor}"
DESCRIPTION="World Press Monitor: open-source RSS atlas and feed validation pipeline for global news sources."

printf 'Setting metadata for %s\n' "$OWNER_REPO"

gh repo edit "$OWNER_REPO" --description "$DESCRIPTION"

gh api "repos/$OWNER_REPO/topics" \
  -X PUT \
  -H "Accept: application/vnd.github+json" \
  --input - <<'JSON'
{
  "names": ["rss", "news", "feed", "typescript", "postgresql", "docker", "monitoring", "open-source"]
}
JSON

echo "Done."
