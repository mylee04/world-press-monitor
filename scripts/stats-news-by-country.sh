#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/load-local-env.sh"
load_local_env

: "${DATABASE_URL:=postgresql://postgres:postgres@127.0.0.1:${WPR_PG_PORT:-${WPM_PG_PORT:-5432}}/${WPR_DATABASE_NAME:-${WPM_DATABASE_NAME:-wpr}}}"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL is required. Set it in .env.macmini.local or the shell environment."
  exit 1
fi

PSQL_QUERY="
SELECT
  COALESCE(country, '(unknown)') AS country,
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 hour') AS articles_last_1h,
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') AS articles_last_24h
FROM news_articles
GROUP BY COALESCE(country, '(unknown)')
ORDER BY articles_last_24h DESC, articles_last_1h DESC, country ASC;
"

psql "$DATABASE_URL" -c "$PSQL_QUERY"
