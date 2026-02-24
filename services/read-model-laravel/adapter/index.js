import { Kafka } from 'kafkajs';

const brokers = (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',');
const groupId = process.env.KAFKA_GROUP_ID ?? 'read-model-service';
const apiUrl = process.env.READ_MODEL_API_URL ?? 'http://localhost:8086/api/internal/projections/apply';

const kafka = new Kafka({ clientId: 'read-model-adapter', brokers });
const consumer = kafka.consumer({ groupId });

let shuttingDown = false;

function parseJsonSafe(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function shouldProcess(event) {
  if (!event || typeof event !== 'object') {
    return false;
  }

  return ['OrderPlaced', 'OrderConfirmed', 'OrderCancelled', 'ShipmentCreated'].includes(event.eventType);
}

async function applyProjection(event) {
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(event)
  });

  const data = parseJsonSafe(await response.text()) ?? {};
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${data.message ?? 'projection endpoint error'}`);
  }

  if (data.status === 'duplicate') {
    console.log(`[read-model-adapter] duplicate ignored eventId=${event.eventId} correlationId=${event.correlationId}`);
    return;
  }

  console.log(`[read-model-adapter] applied eventId=${event.eventId} eventType=${event.eventType} correlationId=${event.correlationId}`);
}

async function run() {
  await consumer.connect();
  await Promise.all([
    consumer.subscribe({ topic: 'orders.events', fromBeginning: true }),
    consumer.subscribe({ topic: 'order.lifecycle.events', fromBeginning: true }),
    consumer.subscribe({ topic: 'shipping.events', fromBeginning: true })
  ]);

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      if (!message.value) {
        return;
      }

      const event = parseJsonSafe(message.value.toString('utf-8'));
      if (!shouldProcess(event)) {
        return;
      }

      console.log(`[read-model-adapter] received topic=${topic} eventId=${event.eventId} eventType=${event.eventType} correlationId=${event.correlationId}`);
      await applyProjection(event);
    }
  });
}

async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`[read-model-adapter] shutdown requested by ${signal}`);

  try {
    await consumer.disconnect();
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
  console.error('[read-model-adapter] fatal error', error);
  await shutdown('fatal');
});
