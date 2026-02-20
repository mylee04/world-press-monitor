#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${PROJECT_ROOT}/.env.local"

if [ -f "${ENV_FILE}" ]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL is required. Add DATABASE_URL in .env.local."
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
