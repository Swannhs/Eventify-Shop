# Eventify Commerce

Production-style Event-Driven Architecture (EDA) demo for e-commerce workflows.

## Current Scope

Implemented in this repository:

- `infra/docker-compose.yml`: Kafka, Kafka UI, PostgreSQL, topic initialization, and all implemented services
- `contracts/event-envelope.json`: standard event envelope schema
- `contracts/events/*.json`: per-event schemas
- `services/order-service-spring`: Spring Boot order service with Outbox pattern (`POST /orders`)
- `services/order-orchestrator-nest`: event-driven order orchestrator consuming inventory/payment outcomes
- `services/shipping-service-express-ts`: Express + TypeScript shipping service consuming lifecycle events

Planned next: inventory, payment, notifications, read-model, and web app.

## Architecture Principles

- Event-first communication via Kafka topics
- No direct synchronous coupling in the order workflow
- Eventual consistency
- Outbox pattern to avoid dual writes
- Idempotent consumers (shipping service persists processed `eventId` values in Postgres)

## Required Event Envelope

All events follow:

- `eventId` (uuid)
- `eventType` (string)
- `occurredAt` (ISO timestamp)
- `correlationId` (uuid)
- `producer` (service name)
- `version` (integer)
- `payload` (object)

Schema file: `contracts/event-envelope.json`

## Topics

- `orders.events`
- `inventory.events`
- `payments.events`
- `order.lifecycle.events`
- `shipping.events`
- `payments.dlq`
- `inventory.dlq`

## Repository Layout

```text
infra/
  docker-compose.yml
contracts/
  event-envelope.json
  events/*.json
services/
  order-service-spring/
  shipping-service-express-ts/
```

## Prerequisites

- Docker + Docker Compose
- Java 17+ (project compiles with release 17)
- Maven
- Node.js 20+ and npm

## Environment

Copy defaults from `.env.example`:

```bash
cp .env.example .env
```

Default values:

- `KAFKA_BROKERS=localhost:9092`
- `DB_HOST=localhost`
- `DB_PORT=5432`
- `DB_USER=app`
- `DB_PASS=app`
- `DB_NAME=eventify`
- `ORDER_SERVICE_PORT=8081`
- `SHIPPING_SERVICE_PORT=8084`

## Local Dev Script

Use the root helper script to run everything locally:

```bash
./dev-local.sh up
```

This script also ensures all required Kafka topics exist before starting services.

Useful commands:

```bash
./dev-local.sh status
./dev-local.sh logs all
./dev-local.sh logs order
./dev-local.sh logs orchestrator
./dev-local.sh logs shipping
./dev-local.sh restart
./dev-local.sh down
```

## Start Full Stack (Docker)

```bash
docker compose -f infra/docker-compose.yml up -d --build
```

Verify:

```bash
docker compose -f infra/docker-compose.yml ps
curl -sS http://localhost:8082/health
curl -sS http://localhost:8084/health
docker exec eventify-kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --list | sort
```

Expected:

- Kafka running on `localhost:9092`
- Kafka UI on `http://localhost:8080`
- Postgres on `localhost:5432`
- Order service on `localhost:8081`
- Order orchestrator on `localhost:8082`
- Shipping service on `localhost:8084`
- required topics are listed (`orders.events`, `inventory.events`, `payments.events`, `order.lifecycle.events`, `shipping.events`, `payments.dlq`, `inventory.dlq`)

Stop everything:

```bash
docker compose -f infra/docker-compose.yml down -v
```

## Manual Verification Path

1. Create an order and confirm outbox event emission.

```bash
curl -i -X POST http://localhost:8081/orders \
  -H 'X-Correlation-Id: 11111111-1111-1111-1111-111111111111' \
  -H 'Content-Type: application/json' \
  -d '{
    "customerId":"c-1001",
    "items":[
      {"sku":"SKU-RED-TSHIRT","quantity":2},
      {"sku":"SKU-BLUE-CAP","quantity":1}
    ]
  }'
```

Expected:

- HTTP `201` from order service
- response includes the same `correlationId` (if header is provided and valid UUID)
- Message appears in Kafka UI topic `orders.events` with `eventType=OrderPlaced`

2. Let orchestrator emit lifecycle events automatically (no manual `OrderConfirmed`).

Publish matching inventory + payment outcomes for the same `orderId`:

```bash
docker exec -i eventify-kafka /opt/kafka/bin/kafka-console-producer.sh \
  --bootstrap-server localhost:9092 \
  --topic inventory.events <<'EOF'
{"eventId":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","eventType":"InventoryReserved","occurredAt":"2026-01-01T00:00:00Z","correlationId":"11111111-1111-1111-1111-111111111111","producer":"inventory-service","version":1,"payload":{"orderId":"33333333-3333-3333-3333-333333333333"}}
EOF

docker exec -i eventify-kafka /opt/kafka/bin/kafka-console-producer.sh \
  --bootstrap-server localhost:9092 \
  --topic payments.events <<'EOF'
{"eventId":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","eventType":"PaymentSucceeded","occurredAt":"2026-01-01T00:00:05Z","correlationId":"11111111-1111-1111-1111-111111111111","producer":"payment-service","version":1,"payload":{"orderId":"33333333-3333-3333-3333-333333333333"}}
EOF
```

Expected:

- Orchestrator publishes `OrderConfirmed` to `order.lifecycle.events`
- `orders.status` for that `orderId` becomes `CONFIRMED` in Postgres
- Duplicate input `eventId` values are ignored by orchestrator idempotency (`processed_events`)

3. Verify cancellation path.

Publish either `OutOfStock` or `PaymentFailed` for another `orderId`.

Expected:

- Orchestrator publishes `OrderCancelled` to `order.lifecycle.events`
- `orders.status` for that `orderId` becomes `CANCELLED`

4. Prove shipping idempotency survives restart.

Restart shipping service and publish the exact same `OrderConfirmed` event again (same `eventId`):

```bash
pkill -f "shipping-service-express-ts" || true
cd services/shipping-service-express-ts
npm run dev
```

Then publish the same `OrderConfirmed` JSON (same `eventId`) again.

Expected:

- No second `ShipmentCreated` event is produced for that `eventId`
- `shipping.events` still has exactly one shipment event for that replayed `eventId`

## Local Checks Run

The following were run for this state:

- `docker compose -f infra/docker-compose.yml config`
- `mvn -Dmaven.repo.local=/workspaces/Eventify-Shop/.m2/repository test` in `services/order-service-spring`
- `npm install --no-audit --no-fund`
- `npm run typecheck`
- `npm run build` in `services/shipping-service-express-ts`

## Notes

- Shipping service reads consumer group from `SHIPPING_KAFKA_GROUP_ID` (default: `shipping-service-group`).
- Orchestrator reads consumer group from `KAFKA_GROUP_ID` (default: `order-orchestrator`).
- Order service currently uses JPA `ddl-auto=update`; migrations can be added next.
