package com.eventify.inventoryservice.messaging;

import com.eventify.inventoryservice.service.InventoryReservationService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.common.header.internals.RecordHeader;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

@Component
public class InventoryEventConsumer {

    private static final Logger log = LoggerFactory.getLogger(InventoryEventConsumer.class);

    private final ObjectMapper objectMapper;
    private final KafkaTemplate<String, String> kafkaTemplate;
    private final InventoryReservationService inventoryReservationService;
    private final InventoryEventFactory inventoryEventFactory;

    @Value("${app.kafka.inventory-dlq-topic:inventory.dlq}")
    private String inventoryDlqTopic;

    @Value("${app.retry.max-attempts:3}")
    private int maxAttempts;

    @Value("${app.retry.backoff-ms:500}")
    private long backoffMs;

    public InventoryEventConsumer(ObjectMapper objectMapper,
                                  KafkaTemplate<String, String> kafkaTemplate,
                                  InventoryReservationService inventoryReservationService,
                                  InventoryEventFactory inventoryEventFactory) {
        this.objectMapper = objectMapper;
        this.kafkaTemplate = kafkaTemplate;
        this.inventoryReservationService = inventoryReservationService;
        this.inventoryEventFactory = inventoryEventFactory;
    }

    @KafkaListener(topics = "${app.kafka.orders-topic:orders.events}")
    public void onOrderPlaced(String rawEvent) {
        OrderPlacedEvent event;
        try {
            event = objectMapper.readValue(rawEvent, OrderPlacedEvent.class);
            validate(event);
        } catch (Exception ex) {
            publishDlq(rawEvent, inventoryEventFactory.randomCorrelationId(), "unknown", "Validation failed: " + ex.getMessage());
            return;
        }

        for (int attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                inventoryReservationService.processOrderPlaced(event);
                return;
            } catch (Exception ex) {
                if (attempt >= maxAttempts) {
                    publishDlq(rawEvent, event.correlationId(), event.eventId(), ex.getMessage());
                    return;
                }

                log.warn("Inventory processing failed; retrying attempt={}/{} eventId={} correlationId={}",
                        attempt, maxAttempts, event.eventId(), event.correlationId(), ex);
                sleep(backoffMs);
            }
        }
    }

    private void validate(OrderPlacedEvent event) {
        List<String> errors = new ArrayList<>();

        if (event.eventId() == null || event.eventId().isBlank()) {
            errors.add("eventId is required");
        }

        if (event.correlationId() == null || event.correlationId().isBlank()) {
            errors.add("correlationId is required");
        }

        if (!"OrderPlaced".equals(event.eventType())) {
            errors.add("eventType must be OrderPlaced");
        }

        if (event.payload() == null || event.payload().orderId() == null || event.payload().orderId().isBlank()) {
            errors.add("payload.orderId is required");
        }

        if (event.payload() == null || event.payload().items() == null || event.payload().items().isEmpty()) {
            errors.add("payload.items is required");
        }

        if (!errors.isEmpty()) {
            throw new IllegalArgumentException(inventoryEventFactory.firstValidationError(errors));
        }

        UUID.fromString(event.eventId());
        UUID.fromString(event.correlationId());
    }

    private void publishDlq(String originalEventJson, String correlationId, String sourceEventId, String error) {
        try {
            String safeCorrelationId = inventoryEventFactory.safeCorrelationId(correlationId);
            String payload = inventoryEventFactory.buildDlqEvent(originalEventJson, safeCorrelationId, sourceEventId, error);

            ProducerRecord<String, String> record = new ProducerRecord<>(inventoryDlqTopic, sourceEventId, payload);
            record.headers().add(new RecordHeader("x-source-event-id", sourceEventId.getBytes(StandardCharsets.UTF_8)));
            record.headers().add(new RecordHeader("x-error", error.getBytes(StandardCharsets.UTF_8)));

            kafkaTemplate.send(record);
            log.error("Published event to inventory.dlq sourceEventId={} correlationId={} error={}", sourceEventId, safeCorrelationId, error);
        } catch (Exception ex) {
            log.error("Failed to publish to inventory.dlq", ex);
        }
    }

    private void sleep(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException interruptedException) {
            Thread.currentThread().interrupt();
        }
    }
}
