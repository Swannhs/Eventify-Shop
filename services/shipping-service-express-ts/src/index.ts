import 'dotenv/config';
import express from 'express';
import { Kafka } from 'kafkajs';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

const app = express();
const port = Number(process.env.SHIPPING_SERVICE_PORT ?? 8084);
const brokers = (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',');

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

const processedEventIds = new Set<string>();

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'shipping-service' });
});

const kafka = new Kafka({
  clientId: 'shipping-service',
  brokers
});

const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: 'shipping-service-group' });

async function startKafkaLoop(): Promise<void> {
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

      if (processedEventIds.has(envelope.data.eventId)) {
        return;
      }

      const confirmed = orderConfirmedSchema.safeParse(envelope.data);
      if (!confirmed.success) {
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

      processedEventIds.add(envelope.data.eventId);
      console.log(`ShipmentCreated published for order ${confirmed.data.payload.orderId}`);
    }
  });
}

app.listen(port, () => {
  console.log(`shipping-service listening on port ${port}`);
  void startKafkaLoop().catch((error) => {
    console.error('shipping-service kafka loop failed', error);
    process.exit(1);
  });
});
