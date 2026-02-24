<?php

namespace App\Services;

use App\Models\OrderView;
use App\Models\ProcessedEvent;
use App\Models\ShipmentView;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

class ProjectionService
{
    public function apply(array $event): array
    {
        try {
            return DB::transaction(function () use ($event): array {
                ProcessedEvent::query()->create([
                    'event_id' => $event['eventId'],
                    'processed_at' => now(),
                ]);

                $this->applyByType($event);

                return ['status' => 'applied'];
            });
        } catch (QueryException $exception) {
            if ($exception->getCode() === '23505') {
                return ['status' => 'duplicate'];
            }

            throw $exception;
        }
    }

    private function applyByType(array $event): void
    {
        $eventType = $event['eventType'];
        $payload = $event['payload'];

        if ($eventType === 'OrderPlaced') {
            $this->applyOrderPlaced($payload, $event['occurredAt']);
            return;
        }

        if ($eventType === 'OrderConfirmed' || $eventType === 'OrderCancelled') {
            $status = $eventType === 'OrderConfirmed' ? 'CONFIRMED' : 'CANCELLED';
            $this->applyOrderLifecycle($payload['orderId'], $status, $event['occurredAt']);
            return;
        }

        if ($eventType === 'ShipmentCreated') {
            $this->applyShipmentCreated($payload, $event['occurredAt']);
        }
    }

    private function applyOrderPlaced(array $payload, string $occurredAt): void
    {
        $orderId = $payload['orderId'];
        $total = $this->resolveTotal($payload);

        OrderView::query()->updateOrCreate(
            ['order_id' => $orderId],
            [
                'status' => 'PLACED',
                'total' => $total,
                'created_at' => $occurredAt,
                'updated_at' => $occurredAt,
            ]
        );
    }

    private function applyOrderLifecycle(string $orderId, string $status, string $occurredAt): void
    {
        $existing = OrderView::query()->where('order_id', $orderId)->first();

        if ($existing === null) {
            OrderView::query()->create([
                'order_id' => $orderId,
                'status' => $status,
                'total' => null,
                'created_at' => $occurredAt,
                'updated_at' => $occurredAt,
            ]);

            return;
        }

        $existing->status = $status;
        $existing->updated_at = $occurredAt;
        $existing->save();
    }

    private function applyShipmentCreated(array $payload, string $occurredAt): void
    {
        ShipmentView::query()->updateOrCreate(
            ['shipment_id' => $payload['shipmentId']],
            [
                'order_id' => $payload['orderId'],
                'carrier' => $payload['carrier'] ?? 'DEMO-CARRIER',
                'status' => $payload['status'] ?? 'CREATED',
                'created_at' => $occurredAt,
            ]
        );
    }

    private function resolveTotal(array $payload): ?float
    {
        if (isset($payload['total']) && is_numeric($payload['total'])) {
            return (float) $payload['total'];
        }

        $items = $payload['items'] ?? [];
        if (!is_array($items)) {
            return null;
        }

        $sum = 0;
        foreach ($items as $item) {
            if (is_array($item) && isset($item['quantity']) && is_numeric($item['quantity'])) {
                $sum += (int) $item['quantity'];
            }
        }

        return (float) $sum;
    }
}
