import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Kafka, Producer, Consumer } from 'kafkajs';
import { Pool, PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

type InventoryStatus = 'RESERVED' | 'OUT_OF_STOCK' | null;
type PaymentStatus = 'SUCCEEDED' | 'FAILED' | null;
type FinalStatus = 'CONFIRMED' | 'CANCELLED' | null;

const eventEnvelopeSchema = z.object({
  eventId: z.string().uuid(),
  eventType: z.string().min(1),
  occurredAt: z.string().datetime(),
  correlationId: z.string().uuid(),
  producer: z.string().min(1),
  version: z.number().int().positive(),
  payload: z.record(z.unknown())
});

const orchestratorInputSchema = eventEnvelopeSchema.extend({
  eventType: z.enum(['InventoryReserved', 'OutOfStock', 'PaymentSucceeded', 'PaymentFailed']),
  payload: z
    .object({
      orderId: z.string().uuid()
    })
    .passthrough()
});

type OrchestratorInput = z.infer<typeof orchestratorInputSchema>;

@Injectable()
export class OrchestratorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrchestratorService.name);
  private shuttingDown = false;
  private readonly dbPool = new Pool({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER ?? 'app',
    password: process.env.DB_PASS ?? 'app',
    database: process.env.DB_NAME ?? 'eventify'
  });

  private readonly kafka = new Kafka({
    clientId: 'order-orchestrator',
    brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',')
  });

  private readonly producer: Producer = this.kafka.producer();
  private readonly consumer: Consumer = this.kafka.consumer({
    groupId: process.env.KAFKA_GROUP_ID ?? 'order-orchestrator'
  });

  async onModuleInit(): Promise<void> {
    void this.startKafkaLoopWithRetry();
  }

  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;

    try {
      await this.consumer.disconnect();
    } catch (error) {
      this.logger.error('consumer disconnect failed', error);
    }

    try {
      await this.producer.disconnect();
    } catch (error) {
      this.logger.error('producer disconnect failed', error);
    }

    try {
      await this.dbPool.end();
    } catch (error) {
      this.logger.error('db pool close failed', error);
    }
  }

  private async initStore(): Promise<void> {
    await this.dbPool.query(`
      CREATE TABLE IF NOT EXISTS processed_events (
        event_id UUID PRIMARY KEY,
        processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await this.dbPool.query(`
      CREATE TABLE IF NOT EXISTS order_orchestrator_state (
        order_id UUID PRIMARY KEY,
        inventory_status TEXT,
        payment_status TEXT,
        final_status TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  private mapStatus(eventType: string): { inventory: InventoryStatus; payment: PaymentStatus } {
    switch (eventType) {
      case 'InventoryReserved':
        return { inventory: 'RESERVED', payment: null };
      case 'OutOfStock':
        return { inventory: 'OUT_OF_STOCK', payment: null };
      case 'PaymentSucceeded':
        return { inventory: null, payment: 'SUCCEEDED' };
      case 'PaymentFailed':
        return { inventory: null, payment: 'FAILED' };
      default:
        return { inventory: null, payment: null };
    }
  }

  private decideFinalState(inventoryStatus: InventoryStatus, paymentStatus: PaymentStatus): FinalStatus {
    if (inventoryStatus === 'OUT_OF_STOCK' || paymentStatus === 'FAILED') {
      return 'CANCELLED';
    }

    if (inventoryStatus === 'RESERVED' && paymentStatus === 'SUCCEEDED') {
      return 'CONFIRMED';
    }

    return null;
  }

  private async tryInsertProcessedEvent(client: PoolClient, eventId: string): Promise<boolean> {
    try {
      await client.query(
        `INSERT INTO processed_events (event_id, processed_at)
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

  private async processEvent(rawEvent: OrchestratorInput): Promise<void> {
    const client = await this.dbPool.connect();

    try {
      await client.query('BEGIN');

      const shouldProcess = await this.tryInsertProcessedEvent(client, rawEvent.eventId);
      if (!shouldProcess) {
        await client.query('ROLLBACK');
        this.logger.log(
          `duplicate ignored eventId=${rawEvent.eventId} correlationId=${rawEvent.correlationId}`
        );
        return;
      }

      const mapped = this.mapStatus(rawEvent.eventType);

      await client.query(
        `INSERT INTO order_orchestrator_state (order_id, inventory_status, payment_status, final_status, updated_at)
         VALUES ($1, $2, $3, NULL, NOW())
         ON CONFLICT (order_id)
         DO UPDATE SET
           inventory_status = COALESCE(EXCLUDED.inventory_status, order_orchestrator_state.inventory_status),
           payment_status = COALESCE(EXCLUDED.payment_status, order_orchestrator_state.payment_status),
           updated_at = NOW()`,
        [rawEvent.payload.orderId, mapped.inventory, mapped.payment]
      );

      const stateResult = await client.query<{
        inventory_status: InventoryStatus;
        payment_status: PaymentStatus;
        final_status: FinalStatus;
      }>(
        `SELECT inventory_status, payment_status, final_status
         FROM order_orchestrator_state
         WHERE order_id = $1
         FOR UPDATE`,
        [rawEvent.payload.orderId]
      );

      const state = stateResult.rows[0];
      if (!state) {
        await client.query('ROLLBACK');
        return;
      }

      if (state.final_status) {
        await client.query('COMMIT');
        this.logger.log(
          `already finalized orderId=${rawEvent.payload.orderId} final=${state.final_status} correlationId=${rawEvent.correlationId}`
        );
        return;
      }

      const finalStatus = this.decideFinalState(state.inventory_status, state.payment_status);
      if (!finalStatus) {
        await client.query('COMMIT');
        return;
      }

      await client.query(
        `UPDATE order_orchestrator_state
         SET final_status = $2, updated_at = NOW()
         WHERE order_id = $1`,
        [rawEvent.payload.orderId, finalStatus]
      );

      await client.query(
        `UPDATE orders
         SET status = $2
         WHERE id = $1`,
        [rawEvent.payload.orderId, finalStatus]
      );

      await client.query('COMMIT');

      const lifecycleEvent = {
        eventId: uuidv4(),
        eventType: finalStatus === 'CONFIRMED' ? 'OrderConfirmed' : 'OrderCancelled',
        occurredAt: new Date().toISOString(),
        correlationId: rawEvent.correlationId,
        producer: 'order-orchestrator',
        version: 1,
        payload: {
          orderId: rawEvent.payload.orderId,
          ...(finalStatus === 'CANCELLED' ? { reason: 'Inventory or payment failure' } : {})
        }
      };

      await this.producer.send({
        topic: 'order.lifecycle.events',
        messages: [
          {
            key: rawEvent.payload.orderId,
            value: JSON.stringify(lifecycleEvent)
          }
        ]
      });

      this.logger.log(
        `published ${lifecycleEvent.eventType} orderId=${rawEvent.payload.orderId} correlationId=${rawEvent.correlationId}`
      );
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async startKafkaLoop(): Promise<void> {
    await this.initStore();
    await this.producer.connect();
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: 'inventory.events', fromBeginning: true });
    await this.consumer.subscribe({ topic: 'payments.events', fromBeginning: true });

    await this.consumer.run({
      eachMessage: async ({ topic, message }) => {
        if (!message.value) {
          return;
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(message.value.toString('utf-8'));
        } catch {
          return;
        }

        const envelope = orchestratorInputSchema.safeParse(parsed);
        if (!envelope.success) {
          return;
        }

        this.logger.log(
          `received topic=${topic} eventId=${envelope.data.eventId} eventType=${envelope.data.eventType} correlationId=${envelope.data.correlationId}`
        );
        await this.processEvent(envelope.data);
      }
    });
  }

  private async startKafkaLoopWithRetry(): Promise<void> {
    const retryDelayMs = 3000;
    while (!this.shuttingDown) {
      try {
        await this.startKafkaLoop();
        return;
      } catch (error) {
        if (this.shuttingDown) {
          return;
        }

        this.logger.error('kafka loop failed, retrying in 3s', error);
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }
  }
}
