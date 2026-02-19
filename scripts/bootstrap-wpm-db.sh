#!/usr/bin/env bash
set -euo pipefail
set -o pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v psql >/dev/null 2>&1; then
  echo "[bootstrap] ERROR: psql command not found. Install PostgreSQL client first."
  exit 1
fi

FRESH=0
MIGRATE_FROM_PRESSLAB=1
RUN_SCHEMA_SYNC=1

usage() {
  cat <<'EOF'
Usage: scripts/bootstrap-wpm-db.sh [options]

Options:
  --fresh              Remove docker volume and recreate from scratch.
  --no-migrate         Skip presslab -> wpm migration if wpm DB is missing.
  --skip-sync-check    Skip db:check-schema-sync after bootstrap.
  -h, --help          Show this help.
EOF
}

while (($# > 0)); do
  case "$1" in
    --fresh)
      FRESH=1
      shift
      ;;
    --no-migrate)
      MIGRATE_FROM_PRESSLAB=0
      shift
      ;;
    --skip-sync-check)
      RUN_SCHEMA_SYNC=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

if [ -f .env.local ]; then
  set -a
  # shellcheck source=/dev/null
  source .env.local
  set +a
fi

: "${DATABASE_URL:=postgresql://postgres:postgres@127.0.0.1:${WPM_PG_PORT:-5432}/wpm}"

ADMIN_DATABASE_URL="${DATABASE_URL%/*}/postgres"

echo "[bootstrap] DATABASE_URL=${DATABASE_URL}"
echo "[bootstrap] ADMIN_DATABASE_URL=${ADMIN_DATABASE_URL}"

if [ "$FRESH" -eq 1 ]; then
  echo "[bootstrap] Recreating PostgreSQL service and data volume (--fresh)"
  docker compose down -v postgres
else
  echo "[bootstrap] Stopping PostgreSQL service (keeping volume)"
  docker compose down postgres
fi

echo "[bootstrap] Starting PostgreSQL service"
docker compose up -d postgres

echo "[bootstrap] Waiting for PostgreSQL readiness"
for i in {1..60}; do
  if psql "$ADMIN_DATABASE_URL" -c '\q' >/dev/null 2>&1; then
    echo "[bootstrap] PostgreSQL is ready."
    break
  fi
  echo "[bootstrap] retry ${i}/60..."
  sleep 2
done

if ! psql "$ADMIN_DATABASE_URL" -c '\q' >/dev/null 2>&1; then
  echo "[bootstrap] PostgreSQL did not become ready in time."
  exit 1
fi

if [ "$MIGRATE_FROM_PRESSLAB" -eq 1 ]; then
  echo "[bootstrap] Checking legacy presslab DB migration target..."
  has_presslab="$(psql "$ADMIN_DATABASE_URL" -tAX -c "select 1 from pg_database where datname='presslab';" | tr -d '[:space:]')"
  has_wpm="$(psql "$ADMIN_DATABASE_URL" -tAX -c "select 1 from pg_database where datname='wpm';" | tr -d '[:space:]')"

  if [ -z "$has_wpm" ] && [ -n "$has_presslab" ]; then
    echo "[bootstrap] wpm DB missing, creating from presslab template..."
    psql "$ADMIN_DATABASE_URL" -c "CREATE DATABASE wpm WITH TEMPLATE presslab OWNER postgres;"
  fi
fi

echo "[bootstrap] Applying schema (db/schema.sql) to ${DATABASE_URL}"
psql "$DATABASE_URL" -f db/schema.sql

if [ "$RUN_SCHEMA_SYNC" -eq 1 ]; then
  echo "[bootstrap] Running schema sync check"
  bun run db:check-schema-sync
fi

echo "[bootstrap] Done."
