# Eventify Commerce

Production-style Event-Driven Architecture (EDA) demo for e-commerce workflows.

## Current Scope

Implemented in this repository:

- `infra/docker-compose.yml`: Kafka, Kafka UI, PostgreSQL, and required topic initialization
- `contracts/event-envelope.json`: standard event envelope schema
- `contracts/events/*.json`: per-event schemas
- `services/order-service-spring`: Spring Boot order service with Outbox pattern (`POST /orders`)
- `services/shipping-service-express-ts`: Express + TypeScript shipping service consuming lifecycle events

Planned next: orchestrator, inventory, payment, notifications, read-model, and web app.

## Architecture Principles

- Event-first communication via Kafka topics
- No direct synchronous coupling in the order workflow
- Eventual consistency
- Outbox pattern to avoid dual writes
- Idempotent consumers (shipping service tracks processed event IDs in-memory for now)

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
./dev-local.sh logs shipping
./dev-local.sh restart
./dev-local.sh down
```

## Start Infra

```bash
docker compose -f infra/docker-compose.yml up -d
```

Verify:

```bash
docker compose -f infra/docker-compose.yml ps
docker exec eventify-kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --list
```

Expected:

- Kafka running on `localhost:9092`
- Kafka UI on `http://localhost:8080`
- Postgres on `localhost:5432`
- required topics are listed (`orders.events`, `inventory.events`, `payments.events`, `order.lifecycle.events`, `shipping.events`, `payments.dlq`, `inventory.dlq`)

## Run Services

Order Service (Spring Boot):

```bash
cd services/order-service-spring
mvn spring-boot:run
```

Shipping Service (Express + TS):

```bash
cd services/shipping-service-express-ts
npm install
npm run dev
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

2. Simulate lifecycle confirmation and verify shipping emits `ShipmentCreated`.

Publish an `OrderConfirmed` message via Kafka CLI:

```bash
docker exec -i eventify-kafka /opt/kafka/bin/kafka-console-producer.sh \
  --bootstrap-server localhost:9092 \
  --topic order.lifecycle.events <<'EOF'
{"eventId":"22222222-2222-2222-2222-222222222222","eventType":"OrderConfirmed","occurredAt":"2026-01-01T00:00:00Z","correlationId":"11111111-1111-1111-1111-111111111111","producer":"order-orchestrator","version":1,"payload":{"orderId":"33333333-3333-3333-3333-333333333333"}}
EOF
```

Expected:

- A `ShipmentCreated` event is published
- Duplicate `eventId` is ignored by shipping consumer using `processed_events` table
- Logs include `correlationId` for receive/duplicate/publish paths

## Local Checks Run

The following were run for this state:

- `docker compose -f infra/docker-compose.yml config`
- `mvn -Dmaven.repo.local=/workspaces/Eventify-Shop/.m2/repository test` in `services/order-service-spring`
- `npm install --no-audit --no-fund`
- `npm run typecheck`
- `npm run build` in `services/shipping-service-express-ts`

## Notes

- Shipping idempotency is currently in-memory; move to persistent store for production behavior.
- Order service currently uses JPA `ddl-auto=update`; migrations can be added next.
