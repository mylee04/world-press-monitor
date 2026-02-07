#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$ROOT_DIR/.warm-daemon.pid"
LOG_FILE="$ROOT_DIR/audits/warm-daemon.log"
CMD=(bun scripts/warm-news-cache.ts)

is_running() {
  if [[ ! -f "$PID_FILE" ]]; then
    return 1
  fi
  local pid
  pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -z "$pid" ]]; then
    return 1
  fi
  if kill -0 "$pid" 2>/dev/null; then
    return 0
  fi
  return 1
}

start_daemon() {
  mkdir -p "$ROOT_DIR/audits"
  if is_running; then
    echo "warm-daemon already running (pid $(cat "$PID_FILE"))"
    exit 0
  fi

  echo "Starting warm-daemon..."
  (
    cd "$ROOT_DIR"
    nohup "${CMD[@]}" >>"$LOG_FILE" 2>&1 &
    echo $! >"$PID_FILE"
  )
  sleep 0.5
  if is_running; then
    echo "warm-daemon started (pid $(cat "$PID_FILE"))"
    echo "logs: $LOG_FILE"
  else
    echo "failed to start warm-daemon"
    exit 1
  fi
}

stop_daemon() {
  if ! is_running; then
    echo "warm-daemon not running"
    rm -f "$PID_FILE"
    exit 0
  fi

  local pid
  pid="$(cat "$PID_FILE")"
  echo "Stopping warm-daemon (pid $pid)..."
  kill "$pid" || true

  for _ in {1..20}; do
    if kill -0 "$pid" 2>/dev/null; then
      sleep 0.25
    else
      rm -f "$PID_FILE"
      echo "warm-daemon stopped"
      exit 0
    fi
  done

  echo "warm-daemon still running, forcing kill..."
  kill -9 "$pid" || true
  rm -f "$PID_FILE"
  echo "warm-daemon killed"
}

status_daemon() {
  if is_running; then
    echo "warm-daemon running (pid $(cat "$PID_FILE"))"
    exit 0
  fi
  echo "warm-daemon not running"
  exit 1
}

logs_daemon() {
  mkdir -p "$ROOT_DIR/audits"
  touch "$LOG_FILE"
  tail -n 80 -f "$LOG_FILE"
}

case "${1:-}" in
  start)
    start_daemon
    ;;
  stop)
    stop_daemon
    ;;
  restart)
    stop_daemon || true
    start_daemon
    ;;
  status)
    status_daemon
    ;;
  logs)
    logs_daemon
    ;;
  *)
    cat <<EOF
Usage: scripts/warm-daemon.sh {start|stop|restart|status|logs}
EOF
    exit 1
    ;;
esac
