#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
CURL_MAX_TIME="${CURL_MAX_TIME:-8}"

OPS_TOKEN="${OPS_TOKEN:-}"
DASH_TOKEN="${DASH_TOKEN:-}"
INGEST_TOKEN="${INGEST_TOKEN:-}"

trim() {
  local s="$1"
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "$s"
}

unquote() {
  local v="$1"
  if [[ "$v" == \"*\" && "$v" == *\" ]]; then
    printf '%s' "${v:1:${#v}-2}"
    return
  fi
  if [[ "$v" == \'*\' && "$v" == *\' ]]; then
    printf '%s' "${v:1:${#v}-2}"
    return
  fi
  printf '%s' "$v"
}

contains_scope() {
  local scopes="$1"
  local target="$2"
  IFS='|;' read -r -a parts <<< "$scopes"
  for p in "${parts[@]}"; do
    p="$(trim "$p")"
    if [[ "$p" == "$target" ]]; then
      return 0
    fi
  done
  return 1
}

extract_tokens_from_scoped_keys() {
  local keys_raw="$1"
  local entry token scopes

  IFS=',' read -r -a entries <<< "$keys_raw"
  for entry in "${entries[@]}"; do
    entry="$(trim "$entry")"
    [[ -z "$entry" ]] && continue
    [[ "$entry" != *:* ]] && continue

    token="${entry%%:*}"
    scopes="${entry#*:}"
    token="$(trim "$token")"
    scopes="$(trim "$scopes")"
    [[ -z "$token" || -z "$scopes" ]] && continue

    if [[ -z "$OPS_TOKEN" ]]; then
      if contains_scope "$scopes" "*" || contains_scope "$scopes" "read:all" || contains_scope "$scopes" "read:ops"; then
        OPS_TOKEN="$token"
      fi
    fi

    if [[ -z "$DASH_TOKEN" ]]; then
      if contains_scope "$scopes" "*" || contains_scope "$scopes" "read:all" || (contains_scope "$scopes" "read:articles" && contains_scope "$scopes" "read:sources"); then
        DASH_TOKEN="$token"
      fi
    fi

    if [[ -z "$INGEST_TOKEN" ]]; then
      if contains_scope "$scopes" "*" || contains_scope "$scopes" "write:ingest"; then
        INGEST_TOKEN="$token"
      fi
    fi
  done
}

load_tokens_from_dotenv() {
  local file="$1"
  [[ -f "$file" ]] || return 0

  local line key value scoped
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="$(trim "$line")"
    [[ -z "$line" ]] && continue
    [[ "$line" == \#* ]] && continue
    [[ "$line" != *=* ]] && continue

    key="${line%%=*}"
    value="${line#*=}"
    key="$(trim "$key")"
    value="$(trim "$value")"
    value="$(unquote "$value")"

    if [[ "$key" == "RADAR_SERVICE_API_KEYS" ]]; then
      scoped="$value"
      if [[ -n "$scoped" ]]; then
        extract_tokens_from_scoped_keys "$scoped"
      fi
    fi

  done < "$file"
}

# Priority:
# 1) auto-detect from .env.local scoped keys
# 2) fallback to provided env vars (OPS_TOKEN/DASH_TOKEN/INGEST_TOKEN)
load_tokens_from_dotenv ".env.local"

if [[ -z "$OPS_TOKEN" || -z "$DASH_TOKEN" || -z "$INGEST_TOKEN" ]]; then
  cat <<'EOF'
Missing auth tokens.

Option A (recommended):
  Add scoped keys to .env.local:
  RADAR_SERVICE_API_KEYS=<ops_token>:read:ops,<dash_token>:read:articles|read:sources,<ingest_token>:write:ingest

Option B:
  Pass tokens directly:
  OPS_TOKEN=... DASH_TOKEN=... INGEST_TOKEN=... bash scripts/check-radar-auth.sh

Optional:
  BASE_URL (default: http://127.0.0.1:3000)
EOF
  exit 1
fi

pass_count=0
fail_count=0

print_result() {
  local ok="$1"
  local label="$2"
  local detail="$3"
  if [[ "$ok" == "1" ]]; then
    printf '[PASS] %s (%s)\n' "$label" "$detail"
    pass_count=$((pass_count + 1))
  else
    printf '[FAIL] %s (%s)\n' "$label" "$detail"
    fail_count=$((fail_count + 1))
  fi
}

check_status() {
  local label="$1"
  local expected="$2"
  local method="$3"
  local token="$4"
  local url="$5"
  local body="${6:-}"

  local status
  if [[ "$method" == "POST" ]]; then
    if [[ -n "$token" ]]; then
      status="$(curl --max-time "$CURL_MAX_TIME" -sS -o /tmp/radar_auth_check_body.txt -w '%{http_code}' -X POST -H "Authorization: Bearer $token" -H 'Content-Type: application/json' -d "$body" "$url" || true)"
    else
      status="$(curl --max-time "$CURL_MAX_TIME" -sS -o /tmp/radar_auth_check_body.txt -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d "$body" "$url" || true)"
    fi
  else
    if [[ -n "$token" ]]; then
      status="$(curl --max-time "$CURL_MAX_TIME" -sS -o /tmp/radar_auth_check_body.txt -w '%{http_code}' -H "Authorization: Bearer $token" "$url" || true)"
    else
      status="$(curl --max-time "$CURL_MAX_TIME" -sS -o /tmp/radar_auth_check_body.txt -w '%{http_code}' "$url" || true)"
    fi
  fi

  if [[ "$status" == "000" ]]; then
    print_result 0 "$label" "network/connect error status=000"
    return
  fi

  if [[ "$status" == "$expected" ]]; then
    print_result 1 "$label" "status=$status"
  else
    local sample
    sample="$(head -c 240 /tmp/radar_auth_check_body.txt 2>/dev/null | tr '\n' ' ' || true)"
    print_result 0 "$label" "expected=$expected got=$status body='$sample'"
  fi
}

echo "Base URL: $BASE_URL"
echo "Running Radar auth checks..."

# Expected success
check_status "ops token -> /api/radar/v1/ops/summary" "200" "GET" "$OPS_TOKEN" "$BASE_URL/api/radar/v1/ops/summary"
check_status "ops token -> /api/ops/health" "200" "GET" "$OPS_TOKEN" "$BASE_URL/api/ops/health"
check_status "dash token -> /api/radar/v1/articles" "200" "GET" "$DASH_TOKEN" "$BASE_URL/api/radar/v1/articles?hours=24&limit=5"
check_status "dash token -> /api/radar/v1/sources" "200" "GET" "$DASH_TOKEN" "$BASE_URL/api/radar/v1/sources?hours=24&limit=5"

# Expected auth failures
check_status "dash token blocked from /api/radar/v1/ops/summary" "403" "GET" "$DASH_TOKEN" "$BASE_URL/api/radar/v1/ops/summary"
check_status "no token blocked from /api/radar/v1/ops/summary" "401" "GET" "" "$BASE_URL/api/radar/v1/ops/summary"

# Use a dedicated lightweight auth-only endpoint for ingest tokens to avoid heavy /fetch side effects.
check_status "ingest token -> /api/radar/v1/fetch/ping" "200" "GET" "$INGEST_TOKEN" "$BASE_URL/api/radar/v1/fetch/ping"
check_status "no token blocked from /api/radar/v1/fetch/ping" "401" "GET" "" "$BASE_URL/api/radar/v1/fetch/ping"

echo
echo "Checks complete: pass=$pass_count fail=$fail_count"
if [[ "$fail_count" -gt 0 ]]; then
  exit 2
fi
