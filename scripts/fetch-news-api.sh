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
LANGUAGE="${NEWS_API_LANGUAGE:-}"
FROM="${NEWS_API_FROM:-}"
TO="${NEWS_API_TO:-}"
PUB_FROM="${NEWS_API_PUBLICATION_FROM:-}"
PUB_TO="${NEWS_API_PUBLICATION_TO:-}"

if [ -z "${TOKEN}" ]; then
  echo "ERROR: NEWS_API_TOKEN is missing in .env.local"
  exit 1
fi

if [[ ! "${BASE_URL}" == http://* && ! "${BASE_URL}" == https://* ]]; then
  echo "ERROR: NEWS_API_BASE_URL must start with http:// or https://"
  exit 1
fi

if [[ "${BASE_URL}" == *$'\n'* || "${BASE_URL}" == *$'\r'* || "${BASE_URL}" == *' '* ]]; then
  echo "ERROR: NEWS_API_BASE_URL contains invalid whitespace characters."
  exit 1
fi

QS=()
QS+=( "limit=${LIMIT}" )

append_csv_query() {
  local key=$1
  local raw=$2
  if [ -z "${raw}" ]; then
    return
  fi
  IFS=',' read -r -a value <<< "${raw}"
  for value in "${value[@]}"; do
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    if [ -n "${value}" ]; then
      QS+=("${key}=${value}")
    fi
  done
}

append_csv_query country "${COUNTRY}"
append_csv_query source "${SOURCE}"
append_csv_query section "${SECTION}"
append_csv_query language "${LANGUAGE}"

if [ -n "${FROM}" ]; then
  QS+=("from=${FROM}")
fi
if [ -n "${TO}" ]; then
  QS+=("to=${TO}")
fi
if [ -n "${PUB_FROM}" ]; then
  QS+=("publication_from=${PUB_FROM}")
fi
if [ -n "${PUB_TO}" ]; then
  QS+=("publication_to=${PUB_TO}")
fi
if [ ${#QS[@]} -eq 0 ]; then
  echo "ERROR: No query arguments were built. This should not happen."
  exit 1
fi

declare -a CURL_ARGS=(
  -sS
  -H "Authorization: Bearer ${TOKEN}"
  -G
  "${BASE_URL%/}/api/news"
)

for query in "${QS[@]}"; do
  CURL_ARGS+=( --data-urlencode "$query" )
done

curl "${CURL_ARGS[@]}" | jq
