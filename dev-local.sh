#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$ROOT_DIR/infra/docker-compose.yml"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

dc() {
  docker compose -f "$COMPOSE_FILE" "$@"
}

start_all() {
  require_cmd docker
  echo "Starting full dockerized stack..."
  dc up -d --build --remove-orphans
  echo
  status
}

stop_all() {
  require_cmd docker
  echo "Stopping dockerized stack..."
  dc down --remove-orphans
}

status() {
  require_cmd docker
  echo "== Docker services =="
  dc ps -a
}

show_logs() {
  require_cmd docker

  local target="${1:-all}"
  case "$target" in
    order)
      dc logs -f --tail=100 order-service
      ;;
    inventory)
      dc logs -f --tail=100 inventory-service
      ;;
    orchestrator)
      dc logs -f --tail=100 order-orchestrator
      ;;
    shipping)
      dc logs -f --tail=100 shipping-service
      ;;
    payment)
      dc logs -f --tail=100 payment-service payment-adapter
      ;;
    read-model)
      dc logs -f --tail=100 read-model-service read-model-adapter
      ;;
    notification)
      dc logs -f --tail=100 notification-service
      ;;
    web)
      dc logs -f --tail=100 web-nextjs
      ;;
    all)
      dc logs -f --tail=100
      ;;
    *)
      echo "Unknown log target: $target"
      echo "Usage: $0 logs [order|inventory|orchestrator|shipping|payment|read-model|notification|web|all]"
      exit 1
      ;;
  esac
}

usage() {
  cat <<USAGE
Usage: ./dev-local.sh <command>

Commands:
  up                 Start full Docker stack (infra + services)
  down               Stop all Docker services
  restart            Restart all Docker services
  status             Show Docker service status
  logs [target]      Stream logs (target: order|inventory|orchestrator|shipping|payment|read-model|notification|web|all)
USAGE
}

cmd="${1:-}"
case "$cmd" in
  up)
    start_all
    ;;
  down)
    stop_all
    ;;
  restart)
    stop_all
    start_all
    ;;
  status)
    status
    ;;
  logs)
    show_logs "${2:-all}"
    ;;
  *)
    usage
    exit 1
    ;;
esac
