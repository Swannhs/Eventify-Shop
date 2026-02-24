# Eventify Commerce

Eventify Commerce is a production-style, event-driven microservices system built to demonstrate how modern distributed e-commerce workflows are designed in practice.

It focuses on asynchronous communication, eventual consistency, and resilient processing using Kafka with proven architecture patterns such as Saga orchestration, Outbox, and CQRS.

## Architecture Overview

This project follows Event-Driven Architecture (EDA) principles:

- Services communicate through domain events
- No direct service-to-service HTTP coupling for core workflows
- Asynchronous processing via Kafka
- Eventual consistency across bounded contexts
- Fault tolerance through retries, idempotency, and DLQ

## Core Workflow

1. Customer places an order -> `OrderPlaced`
2. Inventory service reserves stock -> `InventoryReserved` or `OutOfStock`
3. Payment service processes payment -> `PaymentSucceeded` or `PaymentFailed`
4. Order orchestrator resolves final state -> `OrderConfirmed` or `OrderCancelled`
5. Shipping service creates shipment -> `ShipmentCreated`
6. Notification service reacts to lifecycle events
7. Read model updates projections for the UI

## Tech Stack

### Backend Services

- NestJS (Node.js / TypeScript): Order, Orchestrator, Shipping, Notification
- Spring Boot (Java): Inventory
- Laravel (PHP): Payment + Read Model Projection
- Kafka: Event streaming platform
- PostgreSQL: service-specific data stores

### Frontend

- Next.js (TypeScript): UI consuming CQRS read model APIs

### Infrastructure

- Docker + Docker Compose
- Kafka UI
- Domain-oriented topic organization

## Architectural Patterns Implemented

- Event-Driven Architecture: immutable domain events between services
- Outbox Pattern: atomic state change + event publication safety
- Saga Orchestration: coordinated order lifecycle across services
- CQRS: write-side workflows separated from read-optimized projections
- Idempotent Consumers: safe duplicate event handling
- Dead Letter Queues (DLQ): failed event routing and recovery
- Event Versioning: schema evolution support
- Observability: correlation IDs and structured logs

## Event Envelope (Standard Metadata)

Every event includes:

- `eventId`
- `eventType`
- `correlationId`
- `producer`
- `version`
- `occurredAt`

## Services

- Order Service (NestJS): `POST /orders`, persists orders, writes outbox, emits `OrderPlaced`
- Inventory Service (Spring Boot): consumes `OrderPlaced`, reserves stock, emits inventory result events
- Payment Service (Laravel): consumes `OrderPlaced`, simulates payment gateway, emits payment outcomes
- Order Orchestrator (NestJS): consumes payment/inventory events, manages order state machine
- Shipping Service (NestJS): consumes `OrderConfirmed`, emits `ShipmentCreated`
- Notification Service (NestJS): reacts to lifecycle events and sends mock notifications
- Read Model Service (Laravel): builds query-optimized projections for UI
- Web App (Next.js): visualizes order lifecycle and eventual consistency states

## Example Event Flow

```text
OrderPlaced
  -> InventoryReserved
  -> PaymentSucceeded
  -> OrderConfirmed
  -> ShipmentCreated
```

## Learning Objectives

- Design scalable event-driven systems
- Implement distributed workflows without 2PC
- Handle eventual consistency correctly
- Prevent dual-write issues with Outbox
- Build reliable consumers with retries and idempotency
- Coordinate polyglot microservices via event contracts

## Running the Project

This project is intended to run through Docker Compose with:

- Kafka cluster
- Kafka UI
- PostgreSQL
- All microservices

Each service is independently deployable and loosely coupled.

> Setup scripts and service bootstrapping are being added incrementally.

## Roadmap

- Schema Registry + Avro/Protobuf
- Exactly-once processing strategy
- Kubernetes deployment manifests
- OpenTelemetry distributed tracing
- Real-time UI updates via WebSockets
- Event sourcing experiment for the Order domain
- Kafka Streams analytics pipeline

## Why This Project

Most microservice demos stop at CRUD + REST.
Eventify Commerce is intentionally focused on reliability patterns used in real distributed systems where correctness and recoverability matter.

## Author

Built as a deep-dive project to master Event-Driven Architecture, Kafka, and production-grade distributed system design.
