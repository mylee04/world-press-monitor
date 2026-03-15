#!/usr/bin/env bash

if [ -z "${WPM_ENV_HELPER_LOADED:-}" ]; then
  export WPM_ENV_HELPER_LOADED=1
fi

if [ -z "${WPM_SCRIPT_DIR:-}" ]; then
  WPM_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi
if [ -z "${WPM_PROJECT_ROOT:-}" ]; then
  WPM_PROJECT_ROOT="$(cd "${WPM_SCRIPT_DIR}/.." && pwd)"
fi

pick_env_file() {
  if [ -n "${WPM_ENV_FILE:-}" ] && [ -f "${WPM_ENV_FILE}" ]; then
    printf '%s\n' "${WPM_ENV_FILE}"
    return 0
  fi
  if [ -f "${WPM_PROJECT_ROOT}/.env.macmini.local" ]; then
    printf '%s\n' "${WPM_PROJECT_ROOT}/.env.macmini.local"
    return 0
  fi
  if [ -f "${WPM_PROJECT_ROOT}/.env.example" ]; then
    printf '%s\n' "${WPM_PROJECT_ROOT}/.env.example"
    return 0
  fi
  return 1
}

load_local_env() {
  local env_file
  env_file="$(pick_env_file || true)"
  if [ -n "${env_file}" ] && [ -f "${env_file}" ]; then
    set -a
    # shellcheck disable=SC1090
    source "${env_file}"
    set +a
    export WPM_ENV_FILE_SOURCE="${env_file}"
  else
    export WPM_ENV_FILE_SOURCE=""
  fi

  : "${DATABASE_URL:=postgresql://postgres:postgres@127.0.0.1:${WPM_PG_PORT:-5432}/wpm}"
  export DATABASE_URL
  export PATH="${HOME}/.bun/bin:/opt/homebrew/bin:/usr/local/bin:${PATH}"
}
