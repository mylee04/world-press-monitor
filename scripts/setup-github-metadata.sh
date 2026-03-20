#!/usr/bin/env bash
set -euo pipefail

if ! command -v gh >/dev/null 2>&1; then
  echo "Install GitHub CLI first: https://cli.github.com/"
  exit 1
fi

if [ -n "${GH_TOKEN:-}" ]; then
  echo "Using GH_TOKEN from environment."
  echo "$GH_TOKEN" | gh auth login --with-token -h github.com
fi

OWNER_REPO="${1:-mylee04/world-press-radar}"
DESCRIPTION="World Press Radar: customer news intelligence portal and RSS ingestion pipeline for global news sources."

printf 'Setting metadata for %s\n' "$OWNER_REPO"

if ! gh auth status -h github.com >/dev/null 2>&1; then
  echo "GitHub CLI is not authenticated for github.com."
  echo "Run: gh auth login -h github.com --web --scopes repo"
  echo "or set GH_TOKEN with a token including repo scope."
  exit 1
fi

if ! gh repo edit "$OWNER_REPO" --description "$DESCRIPTION" ; then
  echo "Repository edit failed. Your token may not have repo write permission."
  echo "Try: gh auth refresh -h github.com -s repo"
  exit 1
fi

gh api "repos/$OWNER_REPO/topics" \
  -X PUT \
  -H "Accept: application/vnd.github+json" \
  --input - <<'JSON'
{
  "names": ["rss", "news", "feed", "typescript", "postgresql", "docker", "monitoring", "open-source"]
}
JSON

echo "Done."
