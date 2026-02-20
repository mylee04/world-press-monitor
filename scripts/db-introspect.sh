#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

set -a
source ./.env.local
set +a

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set. Check .env.local"
  exit 1
fi

bunx drizzle-kit introspect --dialect postgresql --url "$DATABASE_URL" --out ./db/drizzle
