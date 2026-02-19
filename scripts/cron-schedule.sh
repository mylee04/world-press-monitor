#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CRON_TAG_START="# >>> wpm-auto >>>"
CRON_TAG_END="# <<< wpm-auto <<<"
BUN_BIN="$(command -v bun || true)"
SHELL_BIN="$(command -v zsh || echo /bin/zsh)"

if [[ -z "$BUN_BIN" ]]; then
  echo "bun not found in PATH"
  exit 1
fi

build_block() {
  cat <<EOF
$CRON_TAG_START
*/5 * * * * cd "$ROOT_DIR" && $SHELL_BIN -lc 'set -a; source ./.env.local; set +a; "$BUN_BIN" scripts/ingest-worker.ts --once >> ./audits/cron-ingest.log 2>&1'
*/5 * * * * cd "$ROOT_DIR" && $SHELL_BIN -lc 'set -a; source ./.env.local; set +a; bash scripts/watch-ingest-health.sh >> ./audits/cron-watch-ingest-health.log 2>&1'
0 0 * * * cd "$ROOT_DIR" && $SHELL_BIN -lc 'set -a; source ./.env.local; set +a; ("$BUN_BIN" scripts/verify-readme-rss.ts && "$BUN_BIN" scripts/export-rss-catalog.ts) >> ./audits/cron-verify-readme-rss.log 2>&1'
0 * * * * cd "$ROOT_DIR" && $SHELL_BIN -lc 'set -a; source ./.env.local; set +a; "$BUN_BIN" scripts/post-hourly-ops-discord.ts >> ./audits/cron-hourly-ops.log 2>&1'
15 0 * * * cd "$ROOT_DIR" && $SHELL_BIN -lc 'set -a; source ./.env.local; set +a; ("$BUN_BIN" scripts/report-daily-source-counts.ts && "$BUN_BIN" scripts/post-daily-discord.ts) >> ./audits/cron-report.log 2>&1'
$CRON_TAG_END
EOF
}

current_crontab() {
  crontab -l 2>/dev/null || true
}

strip_block() {
  awk -v start="$CRON_TAG_START" -v end="$CRON_TAG_END" '
    $0 == start { skip=1; next }
    $0 == end { skip=0; next }
    !skip { print }
  '
}

install_cron() {
  mkdir -p "$ROOT_DIR/audits"
  local existing stripped
  existing="$(current_crontab)"
  stripped="$(printf "%s\n" "$existing" | strip_block)"
  {
    printf "%s\n" "$stripped"
    build_block
  } | crontab -
  echo "Installed WPM cron schedule."
  status_cron
}

remove_cron() {
  local existing stripped
  existing="$(current_crontab)"
  stripped="$(printf "%s\n" "$existing" | strip_block)"
  printf "%s\n" "$stripped" | crontab -
  echo "Removed WPM cron schedule."
}

status_cron() {
  local existing
  existing="$(current_crontab)"
  if printf "%s\n" "$existing" | grep -qF "$CRON_TAG_START"; then
    echo "WPM cron schedule: installed"
    printf "%s\n" "$existing" | awk -v start="$CRON_TAG_START" -v end="$CRON_TAG_END" '
      $0 == start { inside=1; next }
      $0 == end { inside=0; next }
      inside { print }
    '
  else
    echo "WPM cron schedule: not installed"
  fi
}

case "${1:-}" in
  install)
    install_cron
    ;;
  remove)
    remove_cron
    ;;
  status)
    status_cron
    ;;
  *)
    echo "Usage: scripts/cron-schedule.sh {install|remove|status}"
    exit 1
    ;;
esac
