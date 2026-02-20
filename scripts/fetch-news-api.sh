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

BASE_URL="${NEWS_API_BASE_URL:-http://127.0.0.1:4100}"
TOKEN="${NEWS_API_TOKEN:-}"
LIMIT="${NEWS_API_LIMIT:-10}"
COUNTRY="${NEWS_API_COUNTRY:-}"
SOURCE="${NEWS_API_SOURCE:-}"
SECTION="${NEWS_API_SECTION:-}"
FROM="${NEWS_API_FROM:-}"
TO="${NEWS_API_TO:-}"

if [ -z "${TOKEN}" ]; then
  echo "ERROR: NEWS_API_TOKEN is missing in .env.local"
  exit 1
fi

QS=()
QS+=("limit=${LIMIT}")
if [ -n "${COUNTRY}" ]; then
  QS+=("country=${COUNTRY}")
fi
if [ -n "${SOURCE}" ]; then
  QS+=("source=${SOURCE}")
fi
if [ -n "${SECTION}" ]; then
  QS+=("section=${SECTION}")
fi
if [ -n "${FROM}" ]; then
  QS+=("from=${FROM}")
fi
if [ -n "${TO}" ]; then
  QS+=("to=${TO}")
fi

QUERY="$(printf '%s&' "${QS[@]}" | sed 's/&$//')"
ENDPOINT="${BASE_URL%/}/api/news?${QUERY}"

curl -sS -H "Authorization: Bearer ${TOKEN}" "${ENDPOINT}" | jq
