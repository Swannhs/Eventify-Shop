import 'dotenv/config';
import express from 'express';
import { Kafka } from 'kafkajs';
import { Pool } from 'pg';
import { z } from 'zod';

type NotificationRecord = {
  eventId: string;
  eventType: 'OrderConfirmed' | 'OrderCancelled' | 'ShipmentCreated';
  correlationId: string;
  orderId: string;
  occurredAt: string;
  receivedAt: string;
};

const app = express();
const port = Number(process.env.NOTIFICATION_SERVICE_PORT ?? 8087);
const brokers = (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',');
const kafkaGroupId = process.env.KAFKA_GROUP_ID ?? 'notification-service';
const maxNotifications = Number(process.env.NOTIFICATIONS_MAX ?? 200);

const dbPool = new Pool({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.DB_USER ?? 'app',
  password: process.env.DB_PASS ?? 'app',
  database: process.env.DB_NAME ?? 'eventify'
});

const notifications: NotificationRecord[] = [];
let shuttingDown = false;

const envelopeSchema = z.object({
  eventId: z.string().uuid(),
  eventType: z.string().min(1),
  occurredAt: z.string().datetime(),
  correlationId: z.string().uuid(),
  producer: z.string().min(1),
  version: z.number().int().positive(),
  payload: z.record(z.unknown())
});

const handledEventSchema = envelopeSchema.extend({
  eventType: z.enum(['OrderConfirmed', 'OrderCancelled', 'ShipmentCreated']),
  payload: z.object({
    orderId: z.string().uuid()
  }).passthrough()
});

const kafka = new Kafka({ clientId: 'notification-service', brokers });
const consumer = kafka.consumer({ groupId: kafkaGroupId });

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'notification-service' });
});

app.get('/notifications', (req, res) => {
  const limit = Number(req.query.limit ?? 50);
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, maxNotifications) : 50;
  const recent = notifications.slice(-safeLimit).reverse();
  res.status(200).json({ count: recent.length, data: recent });
});

function addNotification(record: NotificationRecord): void {
  notifications.push(record);
  if (notifications.length > maxNotifications) {
    notifications.splice(0, notifications.length - maxNotifications);
  }
}

async function initIdempotencyStore(): Promise<void> {
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS notification_processed_events (
      event_id UUID PRIMARY KEY,
      processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function tryMarkEventProcessed(eventId: string): Promise<boolean> {
  try {
    await dbPool.query(
      `INSERT INTO notification_processed_events (event_id, processed_at)
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

async function consumeLoop(): Promise<void> {
  await initIdempotencyStore();
  await consumer.connect();
  await consumer.subscribe({ topic: 'order.lifecycle.events' });
  await consumer.subscribe({ topic: 'shipping.events' });

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) {
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(message.value.toString('utf-8'));
      } catch {
        return;
      }

      const envelope = envelopeSchema.safeParse(parsed);
      if (!envelope.success) {
        return;
      }

      const handled = handledEventSchema.safeParse(envelope.data);
      if (!handled.success) {
        return;
      }

      const isNew = await tryMarkEventProcessed(handled.data.eventId);
      if (!isNew) {
        console.log(
          `[notification-service] duplicate ignored eventId=${handled.data.eventId} correlationId=${handled.data.correlationId}`
        );
        return;
      }

      const record: NotificationRecord = {
        eventId: handled.data.eventId,
        eventType: handled.data.eventType,
        correlationId: handled.data.correlationId,
        orderId: handled.data.payload.orderId,
        occurredAt: handled.data.occurredAt,
        receivedAt: new Date().toISOString()
      };

      console.log(
        `[notification-service] eventType=${record.eventType} correlationId=${record.correlationId} orderId=${record.orderId}`
      );
      addNotification(record);
    }
  });
}

async function consumeLoopWithRetry(): Promise<void> {
  while (!shuttingDown) {
    try {
      await consumeLoop();
      return;
    } catch (error) {
      if (shuttingDown) {
        return;
      }
      console.error('[notification-service] consumer loop failed, retrying in 3s', error);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

const server = app.listen(port, () => {
  console.log(`notification-service listening on port ${port}`);
  void consumeLoopWithRetry();
});

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`[notification-service] shutdown requested by ${signal}`);

  try {
    await consumer.disconnect();
  } catch {
    // ignore
  }

  try {
    await dbPool.end();
  } catch {
    // ignore
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
