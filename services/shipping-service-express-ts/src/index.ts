import 'dotenv/config';
import express from 'express';
import { Kafka } from 'kafkajs';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

const app = express();
const port = Number(process.env.SHIPPING_SERVICE_PORT ?? 8084);
const brokers = (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',');
const kafkaGroupId = process.env.SHIPPING_KAFKA_GROUP_ID ?? 'shipping-service-group';
let shuttingDown = false;

const dbPool = new Pool({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.DB_USER ?? 'app',
  password: process.env.DB_PASS ?? 'app',
  database: process.env.DB_NAME ?? 'eventify'
});

const eventEnvelopeSchema = z.object({
  eventId: z.string().uuid(),
  eventType: z.string().min(1),
  occurredAt: z.string().datetime(),
  correlationId: z.string().uuid(),
  producer: z.string().min(1),
  version: z.number().int().positive(),
  payload: z.record(z.unknown())
});

const orderConfirmedSchema = eventEnvelopeSchema.extend({
  eventType: z.literal('OrderConfirmed'),
  payload: z.object({
    orderId: z.string().uuid()
  })
});

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'shipping-service' });
});

const kafka = new Kafka({
  clientId: 'shipping-service',
  brokers
});

const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: kafkaGroupId });

async function initIdempotencyStore(): Promise<void> {
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS shipping_processed_events (
      event_id UUID PRIMARY KEY,
      processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function tryMarkEventAsProcessing(eventId: string): Promise<boolean> {
  try {
    await dbPool.query(
      `INSERT INTO shipping_processed_events (event_id, processed_at)
       VALUES ($1, NOW())`,
      [eventId]
    );
    return true;
  } catch (error: unknown) {
    const code = (error as { code?: string }).code;
    if (code === '23505') {
      return false;
    }
    throw error;
  }
}

async function startKafkaLoop(): Promise<void> {
  await initIdempotencyStore();
  await producer.connect();
  await consumer.connect();
  await consumer.subscribe({ topic: 'order.lifecycle.events', fromBeginning: true });

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) {
        return;
      }

      const raw = message.value.toString('utf-8');
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return;
      }

      const envelope = eventEnvelopeSchema.safeParse(parsed);
      if (!envelope.success) {
        return;
      }

      const confirmed = orderConfirmedSchema.safeParse(envelope.data);
      if (!confirmed.success) {
        return;
      }

      console.log(
        `[shipping-service] received eventId=${confirmed.data.eventId} correlationId=${confirmed.data.correlationId} eventType=${confirmed.data.eventType}`
      );

      const shouldProcess = await tryMarkEventAsProcessing(confirmed.data.eventId);
      if (!shouldProcess) {
        console.log(
          `[shipping-service] duplicate ignored eventId=${confirmed.data.eventId} correlationId=${confirmed.data.correlationId}`
        );
        return;
      }

      const shipmentCreated = {
        eventId: uuidv4(),
        eventType: 'ShipmentCreated',
        occurredAt: new Date().toISOString(),
        correlationId: confirmed.data.correlationId,
        producer: 'shipping-service',
        version: 1,
        payload: {
          orderId: confirmed.data.payload.orderId,
          shipmentId: uuidv4(),
          status: 'CREATED'
        }
      };

      await producer.send({
        topic: 'shipping.events',
        messages: [
          {
            key: confirmed.data.payload.orderId,
            value: JSON.stringify(shipmentCreated)
          }
        ]
      });

      console.log(
        `[shipping-service] published ShipmentCreated orderId=${confirmed.data.payload.orderId} correlationId=${confirmed.data.correlationId}`
      );
    }
  });
}

async function startKafkaLoopWithRetry(): Promise<void> {
  const retryDelayMs = 3000;
  // Keep retrying startup so transient broker/topic timing does not crash the service.
  // This is important during local startup while infra and topic init are still converging.
  while (!shuttingDown) {
    try {
      await startKafkaLoop();
      return;
    } catch (error) {
      if (shuttingDown) {
        return;
      }
      console.error('shipping-service kafka loop failed, retrying in 3s', error);
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
}

const server = app.listen(port, () => {
  console.log(`shipping-service listening on port ${port}`);
  void startKafkaLoopWithRetry();
});

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`[shipping-service] shutdown requested by ${signal}`);

  try {
    await consumer.disconnect();
  } catch (error) {
    console.error('[shipping-service] consumer disconnect failed', error);
  }

  try {
    await producer.disconnect();
  } catch (error) {
    console.error('[shipping-service] producer disconnect failed', error);
  }

  try {
    await dbPool.end();
  } catch (error) {
    console.error('[shipping-service] db pool close failed', error);
  }

  server.close(() => {
    process.exit(0);
  });
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
