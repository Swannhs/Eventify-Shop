<?php

namespace App\Services;

use App\Exceptions\TransientPaymentException;
use App\Models\PaymentRecord;
use App\Models\ProcessedEvent;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class PaymentProcessingService
{
    public function process(array $event): array
    {
        if (ProcessedEvent::query()->where('event_id', $event['eventId'])->exists()) {
            return [
                'status' => 'duplicate',
                'paymentEvent' => null,
            ];
        }

        if (($event['payload']['forceException'] ?? false) === true) {
            throw new TransientPaymentException('Forced transient payment exception');
        }

        $decision = $this->decide($event['payload']);

        return DB::transaction(function () use ($event, $decision): array {
            ProcessedEvent::query()->create([
                'event_id' => $event['eventId'],
                'processed_at' => now(),
            ]);

            PaymentRecord::query()->create([
                'id' => (string) Str::uuid(),
                'source_event_id' => $event['eventId'],
                'order_id' => $event['payload']['orderId'],
                'correlation_id' => $event['correlationId'],
                'status' => $decision,
                'input_payload' => $event['payload'],
                'created_at' => now(),
            ]);

            return [
                'status' => $decision,
                'paymentEvent' => $this->buildPaymentEvent($event, $decision),
            ];
        });
    }

    private function decide(array $payload): string
    {
        $threshold = (float) env('PAYMENT_FAIL_THRESHOLD', 1000);

        if (($payload['forcePaymentFailed'] ?? false) === true || ($payload['forcePaymentFailure'] ?? false) === true) {
            return 'failed';
        }

        if (isset($payload['total']) && (float) $payload['total'] > $threshold) {
            return 'failed';
        }

        return 'succeeded';
    }

    private function buildPaymentEvent(array $sourceEvent, string $decision): array
    {
        $eventType = $decision === 'succeeded' ? 'PaymentSucceeded' : 'PaymentFailed';

        $payload = [
            'orderId' => $sourceEvent['payload']['orderId'],
        ];

        if ($decision === 'failed') {
            $payload['reason'] = 'Payment rule triggered';
        }

        return [
            'eventId' => (string) Str::uuid(),
            'eventType' => $eventType,
            'occurredAt' => now()->toIso8601String(),
            'correlationId' => $sourceEvent['correlationId'],
            'producer' => 'payment-service',
            'version' => 1,
            'payload' => $payload,
        ];
    }
}
