package com.eventify.inventoryservice.messaging;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

class InventoryEventFactoryTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final InventoryEventFactory inventoryEventFactory = new InventoryEventFactory(objectMapper);

    @Test
    void buildsInventoryReservedEnvelope() throws Exception {
        String eventJson = inventoryEventFactory.buildInventoryReserved(
                "11111111-1111-1111-1111-111111111111",
                "22222222-2222-2222-2222-222222222222"
        );

        JsonNode event = objectMapper.readTree(eventJson);
        assertThat(event.path("eventType").asText()).isEqualTo("InventoryReserved");
        assertThat(event.path("producer").asText()).isEqualTo("inventory-service");
        assertThat(event.path("payload").path("orderId").asText()).isEqualTo("22222222-2222-2222-2222-222222222222");
        assertThat(event.path("eventId").asText()).isNotBlank();
    }

    @Test
    void buildsDlqEnvelopeWithOriginalEvent() throws Exception {
        String original = "{\"eventId\":\"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\"}";
        String eventJson = inventoryEventFactory.buildDlqEvent(
                original,
                "11111111-1111-1111-1111-111111111111",
                "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
                "boom"
        );

        JsonNode event = objectMapper.readTree(eventJson);
        assertThat(event.path("eventType").asText()).isEqualTo("InventoryEventFailed");
        assertThat(event.path("payload").path("error").asText()).isEqualTo("boom");
        assertThat(event.path("payload").path("originalEvent").path("eventId").asText())
                .isEqualTo("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    }
}
