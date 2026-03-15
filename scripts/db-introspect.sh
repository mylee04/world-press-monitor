#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

# shellcheck disable=SC1091
source "${SCRIPT_DIR}/load-local-env.sh"
load_local_env

: "${DATABASE_URL:=postgresql://postgres:postgres@127.0.0.1:${WPM_PG_PORT:-5432}/wpm}"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set. Check .env.macmini.local or the shell environment."
  exit 1
fi

bunx drizzle-kit introspect --dialect postgresql --url "$DATABASE_URL" --out ./db/drizzle
