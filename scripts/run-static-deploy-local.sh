#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/load-local-env.sh"
load_local_env

LOG_DIR="${WPM_LOG_DIR:-${PROJECT_ROOT}/logs}"
LOG_FILE="${LOG_DIR}/static-deploy-local.log"
WEB_DIST_DIR="${WPM_WEB_DIST_DIR:-${PROJECT_ROOT}/web-dist}"

mkdir -p "${LOG_DIR}" "${WEB_DIST_DIR}"
cd "${PROJECT_ROOT}"
export PATH="${PATH}:/opt/homebrew/bin:/usr/local/bin"

run_default_vercel_deploy() {
  local -a build_command
  local -a deploy_command
  build_command=(vercel build --prod --yes)
  deploy_command=(vercel deploy --prebuilt --prod --yes)

  if [ -n "${VERCEL_SCOPE:-}" ]; then
    build_command+=(--scope "${VERCEL_SCOPE}")
    deploy_command+=(--scope "${VERCEL_SCOPE}")
  fi
  if [ -n "${VERCEL_TOKEN:-}" ]; then
    build_command+=(--token "${VERCEL_TOKEN}")
    deploy_command+=(--token "${VERCEL_TOKEN}")
  fi

  printf 'Auto deploy target: linked Vercel project\n'
  printf 'Build command:'
  printf ' %q' "${build_command[@]}"
  printf '\n'
  printf 'Deploy command:'
  printf ' %q' "${deploy_command[@]}"
  printf '\n'
  "${build_command[@]}"
  "${deploy_command[@]}"
}

{
  printf '\n[%s] Start static export + deploy pipeline\n' "$(date -u '+%Y-%m-%d %H:%M:%S %Z')"
  printf 'Project: %s\n' "${PROJECT_ROOT}"
  printf 'Web dist dir: %s\n' "${WEB_DIST_DIR}"
  printf 'Env file: %s\n' "${WPM_ENV_FILE_SOURCE:-inline-defaults}"
  bash "${SCRIPT_DIR}/run-static-export-local.sh"
  bun run web:build
  rsync -a --delete "${PROJECT_ROOT}/out/" "${WEB_DIST_DIR}/"
  if [ -n "${STATIC_DEPLOY_COMMAND:-}" ]; then
    printf 'Deploy command: %s\n' "${STATIC_DEPLOY_COMMAND}"
    /bin/zsh -lc "${STATIC_DEPLOY_COMMAND}"
  elif command -v vercel >/dev/null 2>&1 && [ -f "${PROJECT_ROOT}/.vercel/project.json" ]; then
    run_default_vercel_deploy
  else
    printf 'No STATIC_DEPLOY_COMMAND configured; synced build artifacts only.\n'
    if ! command -v vercel >/dev/null 2>&1; then
      printf 'Reason: Vercel CLI not found in PATH.\n'
    elif [ ! -f "${PROJECT_ROOT}/.vercel/project.json" ]; then
      printf 'Reason: no linked Vercel project found. Run `vercel link --project world-press-monitor` once.\n'
    fi
  fi
} >>"${LOG_FILE}" 2>&1
