package com.eventify.inventoryservice.messaging;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
public class InventoryEventFactory {

    private final ObjectMapper objectMapper;

    public InventoryEventFactory(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public String buildInventoryReserved(String correlationId, String orderId) throws JsonProcessingException {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("orderId", orderId);

        return buildEnvelope("InventoryReserved", correlationId, payload);
    }

    public String buildOutOfStock(String correlationId, String orderId) throws JsonProcessingException {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("orderId", orderId);
        payload.put("reason", "Insufficient stock");

        return buildEnvelope("OutOfStock", correlationId, payload);
    }

    public String buildDlqEvent(String originalEventJson,
                                String correlationId,
                                String sourceEventId,
                                String errorMessage) throws JsonProcessingException {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("sourceEventId", sourceEventId);
        payload.put("error", errorMessage);
        payload.put("originalEvent", objectMapper.readTree(originalEventJson));

        return buildEnvelope("InventoryEventFailed", correlationId, payload);
    }

    private String buildEnvelope(String eventType, String correlationId, Map<String, Object> payload) throws JsonProcessingException {
        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("eventId", UUID.randomUUID().toString());
        envelope.put("eventType", eventType);
        envelope.put("occurredAt", OffsetDateTime.now().toString());
        envelope.put("correlationId", correlationId);
        envelope.put("producer", "inventory-service");
        envelope.put("version", 1);
        envelope.put("payload", payload);

        return objectMapper.writeValueAsString(envelope);
    }

    public String randomCorrelationId() {
        return UUID.randomUUID().toString();
    }

    public String safeCorrelationId(String input) {
        try {
            return UUID.fromString(input).toString();
        } catch (Exception ex) {
            return randomCorrelationId();
        }
    }

    public String firstValidationError(List<String> errors) {
        if (errors.isEmpty()) {
            return "Unknown validation error";
        }

        return errors.get(0);
    }
}
