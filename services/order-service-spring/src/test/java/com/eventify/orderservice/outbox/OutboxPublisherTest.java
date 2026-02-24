package com.eventify.orderservice.outbox;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.kafka.core.KafkaOperations;

@ExtendWith(MockitoExtension.class)
class OutboxPublisherTest {

    @Mock
    private OutboxEventRepository outboxEventRepository;

    @Mock
    private KafkaOperations<String, String> kafkaOperations;

    @Test
    void publishPendingMarksOutboxRowAsSent() {
        OutboxEventEntity event = new OutboxEventEntity(
                "evt-1",
                "order-1",
                "OrderPlaced",
                "orders.events",
                "{\"eventType\":\"OrderPlaced\"}",
                OffsetDateTime.now()
        );

        when(outboxEventRepository.findTop50ByStatusOrderByCreatedAtAsc(OutboxStatus.PENDING)).thenReturn(List.of(event));
        when(kafkaOperations.send("orders.events", "order-1", "{\"eventType\":\"OrderPlaced\"}"))
                .thenReturn(CompletableFuture.completedFuture(null));

        OutboxPublisher publisher = new OutboxPublisher(outboxEventRepository, kafkaOperations);
        publisher.publishPending();

        verify(kafkaOperations).send("orders.events", "order-1", "{\"eventType\":\"OrderPlaced\"}");
        assertEquals(OutboxStatus.SENT, event.getStatus());
        assertNotNull(event.getSentAt());
    }
}
