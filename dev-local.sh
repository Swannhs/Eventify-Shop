#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$ROOT_DIR/infra/docker-compose.yml"
STATE_DIR="$ROOT_DIR/.dev-local"
MAVEN_REPO_DIR="$ROOT_DIR/.m2/repository"
ORDER_PID_FILE="$STATE_DIR/order-service.pid"
ORCHESTRATOR_PID_FILE="$STATE_DIR/order-orchestrator.pid"
SHIPPING_PID_FILE="$STATE_DIR/shipping-service.pid"
INVENTORY_PID_FILE="$STATE_DIR/inventory-service.pid"
ORDER_LOG="$STATE_DIR/order-service.log"
ORCHESTRATOR_LOG="$STATE_DIR/order-orchestrator.log"
SHIPPING_LOG="$STATE_DIR/shipping-service.log"
INVENTORY_LOG="$STATE_DIR/inventory-service.log"

mkdir -p "$STATE_DIR"
mkdir -p "$MAVEN_REPO_DIR"

if [[ -f "$ROOT_DIR/.env" ]]; then
  set -a
  # shellcheck source=/dev/null
  . "$ROOT_DIR/.env"
  set +a
fi

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

start_detached() {
  local log_file="$1"
  shift

  setsid "$@" >"$log_file" 2>&1 < /dev/null &
  echo $!
}

ensure_kafka_topics() {
  local topics=(
    orders.events
    inventory.events
    payments.events
    order.lifecycle.events
    shipping.events
    payments.dlq
    inventory.dlq
  )

  echo "Ensuring Kafka topics exist..."
  for topic in "${topics[@]}"; do
    docker exec eventify-kafka /opt/kafka/bin/kafka-topics.sh \
      --bootstrap-server localhost:9092 \
      --create \
      --if-not-exists \
      --topic "$topic" \
      --partitions 3 \
      --replication-factor 1 >/dev/null
  done
}

is_pid_running() {
  local pid="$1"
  kill -0 "$pid" >/dev/null 2>&1
}

stop_pid_file() {
  local pid_file="$1"
  local service_name="$2"

  if [[ -f "$pid_file" ]]; then
    local pid
    pid="$(cat "$pid_file")"
    if [[ -n "$pid" ]] && is_pid_running "$pid"; then
      echo "Stopping $service_name (pid=$pid)..."
      kill "$pid" >/dev/null 2>&1 || true
      sleep 1
      if is_pid_running "$pid"; then
        kill -9 "$pid" >/dev/null 2>&1 || true
      fi
    fi
    rm -f "$pid_file"
  fi
}

start_order_service() {
  if [[ -f "$ORDER_PID_FILE" ]] && is_pid_running "$(cat "$ORDER_PID_FILE")"; then
    echo "order-service already running (pid=$(cat "$ORDER_PID_FILE"))."
    return
  fi

  require_cmd mvn
  echo "Starting order-service (Spring Boot) on ORDER_SERVICE_PORT (default 8081)..."
  local pid
  pid="$(start_detached "$ORDER_LOG" bash -lc "cd \"$ROOT_DIR/services/order-service-spring\" && exec mvn -Dmaven.repo.local=\"$MAVEN_REPO_DIR\" spring-boot:run")"

  echo "$pid" >"$ORDER_PID_FILE"
  echo "order-service started. Log: $ORDER_LOG"
}

start_shipping_service() {
  if [[ -f "$SHIPPING_PID_FILE" ]] && is_pid_running "$(cat "$SHIPPING_PID_FILE")"; then
    echo "shipping-service already running (pid=$(cat "$SHIPPING_PID_FILE"))."
    return
  fi

  require_cmd npm
  echo "Starting shipping-service (Express + TypeScript) on SHIPPING_SERVICE_PORT (default 8084)..."
  pushd "$ROOT_DIR/services/shipping-service-express-ts" >/dev/null
  if [[ ! -d node_modules ]]; then
    npm install --no-audit --no-fund >/dev/null
  fi
  popd >/dev/null

  local pid
  pid="$(start_detached "$SHIPPING_LOG" bash -lc "cd \"$ROOT_DIR/services/shipping-service-express-ts\" && exec ./node_modules/.bin/tsx src/index.ts")"

  echo "$pid" >"$SHIPPING_PID_FILE"
  echo "shipping-service started. Log: $SHIPPING_LOG"
}

start_inventory_service() {
  if [[ -f "$INVENTORY_PID_FILE" ]] && is_pid_running "$(cat "$INVENTORY_PID_FILE")"; then
    echo "inventory-service already running (pid=$(cat "$INVENTORY_PID_FILE"))."
    return
  fi

  require_cmd mvn
  echo "Starting inventory-service (Spring Boot Kafka consumer)..."
  local pid
  pid="$(start_detached "$INVENTORY_LOG" bash -lc "cd \"$ROOT_DIR/services/inventory-service-spring\" && exec env KAFKA_GROUP_ID=inventory-service mvn -Dmaven.repo.local=\"$MAVEN_REPO_DIR\" spring-boot:run")"

  echo "$pid" >"$INVENTORY_PID_FILE"
  echo "inventory-service started. Log: $INVENTORY_LOG"
}

start_orchestrator_service() {
  if [[ -f "$ORCHESTRATOR_PID_FILE" ]] && is_pid_running "$(cat "$ORCHESTRATOR_PID_FILE")"; then
    echo "order-orchestrator already running (pid=$(cat "$ORCHESTRATOR_PID_FILE"))."
    return
  fi

  require_cmd npm
  echo "Starting order-orchestrator (TypeScript) on ORDER_ORCHESTRATOR_PORT (default 8082)..."
  pushd "$ROOT_DIR/services/order-orchestrator-nest" >/dev/null
  if [[ ! -d node_modules ]]; then
    npm install --no-audit --no-fund >/dev/null
  fi
  popd >/dev/null

  local pid
  pid="$(start_detached "$ORCHESTRATOR_LOG" bash -lc "cd \"$ROOT_DIR/services/order-orchestrator-nest\" && exec ./node_modules/.bin/tsx src/main.ts")"

  echo "$pid" >"$ORCHESTRATOR_PID_FILE"
  echo "order-orchestrator started. Log: $ORCHESTRATOR_LOG"
}

start_all() {
  require_cmd docker
  echo "Starting infra (Kafka, Kafka UI, Postgres)..."
  docker compose -f "$COMPOSE_FILE" up -d --remove-orphans
  ensure_kafka_topics
  start_order_service
  start_inventory_service
  start_orchestrator_service
  start_shipping_service
  echo
  status
}

stop_all() {
  stop_pid_file "$ORDER_PID_FILE" "order-service"
  stop_pid_file "$INVENTORY_PID_FILE" "inventory-service"
  stop_pid_file "$ORCHESTRATOR_PID_FILE" "order-orchestrator"
  stop_pid_file "$SHIPPING_PID_FILE" "shipping-service"

  require_cmd docker
  echo "Stopping infra..."
  docker compose -f "$COMPOSE_FILE" down --remove-orphans
}

status() {
  echo "== Infra =="
  docker compose -f "$COMPOSE_FILE" ps || true

  echo
  echo "== Local services =="

  if [[ -f "$ORDER_PID_FILE" ]] && is_pid_running "$(cat "$ORDER_PID_FILE")"; then
    echo "order-service: running (pid=$(cat "$ORDER_PID_FILE"))"
  else
    echo "order-service: stopped"
  fi

  if [[ -f "$ORCHESTRATOR_PID_FILE" ]] && is_pid_running "$(cat "$ORCHESTRATOR_PID_FILE")"; then
    echo "order-orchestrator: running (pid=$(cat "$ORCHESTRATOR_PID_FILE"))"
  else
    echo "order-orchestrator: stopped"
  fi

  if [[ -f "$INVENTORY_PID_FILE" ]] && is_pid_running "$(cat "$INVENTORY_PID_FILE")"; then
    echo "inventory-service: running (pid=$(cat "$INVENTORY_PID_FILE"))"
  else
    echo "inventory-service: stopped"
  fi

  if [[ -f "$SHIPPING_PID_FILE" ]] && is_pid_running "$(cat "$SHIPPING_PID_FILE")"; then
    echo "shipping-service: running (pid=$(cat "$SHIPPING_PID_FILE"))"
  else
    echo "shipping-service: stopped"
  fi

  echo
  echo "Logs:"
  echo "- $ORDER_LOG"
  echo "- $INVENTORY_LOG"
  echo "- $ORCHESTRATOR_LOG"
  echo "- $SHIPPING_LOG"
}

show_logs() {
  local target="${1:-all}"
  case "$target" in
    order)
      tail -n 100 -f "$ORDER_LOG"
      ;;
    shipping)
      tail -n 100 -f "$SHIPPING_LOG"
      ;;
    inventory)
      tail -n 100 -f "$INVENTORY_LOG"
      ;;
    all)
      echo "---- order-service ----"
      tail -n 80 "$ORDER_LOG" 2>/dev/null || true
      echo
      echo "---- inventory-service ----"
      tail -n 80 "$INVENTORY_LOG" 2>/dev/null || true
      echo
      echo "---- order-orchestrator ----"
      tail -n 80 "$ORCHESTRATOR_LOG" 2>/dev/null || true
      echo
      echo "---- shipping-service ----"
      tail -n 80 "$SHIPPING_LOG" 2>/dev/null || true
      ;;
    orchestrator)
      tail -n 100 -f "$ORCHESTRATOR_LOG"
      ;;
    *)
      echo "Unknown log target: $target"
      echo "Usage: $0 logs [order|inventory|orchestrator|shipping|all]"
      exit 1
      ;;
  esac
}

usage() {
  cat <<USAGE
Usage: ./dev-local.sh <command>

Commands:
  up                 Start infra + order-service + inventory-service + order-orchestrator + shipping-service
  down               Stop local services + infra
  restart            Restart everything
  status             Show infra and local process status
  logs [target]      Show logs (target: order|inventory|orchestrator|shipping|all)
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
