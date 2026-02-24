package com.eventify.inventoryservice.messaging;

import java.util.List;

public record OrderPlacedEvent(
        String eventId,
        String eventType,
        String occurredAt,
        String correlationId,
        String producer,
        int version,
        Payload payload
) {
    public record Payload(String orderId, List<Item> items) {
    }

    public record Item(String sku, int quantity) {
    }
}
