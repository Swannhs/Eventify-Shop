import { Kafka } from 'kafkajs';
import crypto from 'node:crypto';

const brokers = (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',');
const groupId = process.env.KAFKA_GROUP_ID ?? 'payment-service';
const apiUrl = process.env.PAYMENT_API_URL ?? 'http://localhost:8085/api/internal/payments/process-order-placed';
const maxAttempts = Number(process.env.PAYMENT_RETRY_ATTEMPTS ?? 3);
const retryDelayMs = Number(process.env.PAYMENT_RETRY_DELAY_MS ?? 500);

const kafka = new Kafka({ clientId: 'payment-service-adapter', brokers });
const consumer = kafka.consumer({ groupId });
const producer = kafka.producer();

let shuttingDown = false;

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function nowIso() {
  return new Date().toISOString();
}

function parseJsonSafe(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function dlqEnvelope(originalEvent, reason, correlationId, sourceEventId) {
  return {
    eventId: crypto.randomUUID(),
    eventType: 'PaymentProcessingFailed',
    occurredAt: nowIso(),
    correlationId,
    producer: 'payment-service-adapter',
    version: 1,
    payload: {
      sourceEventId,
      reason,
      originalEvent
    }
  };
}

async function publishDlq(originalEvent, reason) {
  const correlationId = originalEvent?.correlationId ?? crypto.randomUUID();
  const sourceEventId = originalEvent?.eventId ?? 'unknown';
  const message = dlqEnvelope(originalEvent ?? {}, reason, correlationId, sourceEventId);

  await producer.send({
    topic: 'payments.dlq',
    messages: [{
      key: originalEvent?.payload?.orderId ?? sourceEventId,
      value: JSON.stringify(message)
    }]
  });

  console.error(`[payment-adapter] published DLQ sourceEventId=${sourceEventId} correlationId=${correlationId} reason=${reason}`);
}

async function publishPaymentEvent(paymentEvent) {
  await producer.send({
    topic: 'payments.events',
    messages: [{
      key: paymentEvent.payload.orderId,
      value: JSON.stringify(paymentEvent)
    }]
  });

  console.log(`[payment-adapter] published ${paymentEvent.eventType} orderId=${paymentEvent.payload.orderId} correlationId=${paymentEvent.correlationId}`);
}

async function processOrderPlaced(event) {
  if (event?.eventType !== 'OrderPlaced') {
    return;
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify(event)
      });

      const data = parseJsonSafe(await response.text()) ?? {};

      if (response.ok) {
        if (data.status === 'duplicate') {
          console.log(`[payment-adapter] duplicate ignored eventId=${event.eventId} correlationId=${event.correlationId}`);
          return;
        }

        if (data.paymentEvent) {
          await publishPaymentEvent(data.paymentEvent);
        }
        return;
      }

      const transient = response.status >= 500 || response.status === 503;
      const reason = `HTTP ${response.status}: ${data.message ?? 'payment endpoint error'}`;

      if (!transient || attempt === maxAttempts) {
        await publishDlq(event, reason);
        return;
      }

      console.warn(`[payment-adapter] transient failure attempt=${attempt}/${maxAttempts} eventId=${event.eventId} correlationId=${event.correlationId} reason=${reason}`);
      await sleep(retryDelayMs);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);

      if (attempt === maxAttempts) {
        await publishDlq(event, reason);
        return;
      }

      console.warn(`[payment-adapter] request error attempt=${attempt}/${maxAttempts} eventId=${event.eventId} correlationId=${event.correlationId} reason=${reason}`);
      await sleep(retryDelayMs);
    }
  }
}

async function run() {
  await producer.connect();
  await consumer.connect();
  await consumer.subscribe({ topic: 'orders.events', fromBeginning: true });

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) {
        return;
      }

      const raw = message.value.toString('utf-8');
      const event = parseJsonSafe(raw);

      if (!event) {
        await publishDlq({ raw }, 'Invalid JSON payload');
        return;
      }

      console.log(`[payment-adapter] received eventId=${event.eventId ?? 'unknown'} correlationId=${event.correlationId ?? 'unknown'} eventType=${event.eventType ?? 'unknown'}`);
      await processOrderPlaced(event);
    }
  });
}

async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`[payment-adapter] shutdown requested by ${signal}`);

  try {
    await consumer.disconnect();
  } catch {
    // ignore
  }

  try {
    await producer.disconnect();
  } catch {
    // ignore
  }

  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

void run().catch(async (error) => {
  console.error('[payment-adapter] fatal error', error);
  await shutdown('fatal');
});
