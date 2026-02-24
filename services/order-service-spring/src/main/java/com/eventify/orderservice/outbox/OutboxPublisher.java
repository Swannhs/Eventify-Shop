package com.eventify.orderservice.outbox;

import java.time.OffsetDateTime;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.core.KafkaOperations;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class OutboxPublisher {

    private static final Logger log = LoggerFactory.getLogger(OutboxPublisher.class);

    private final OutboxEventRepository outboxEventRepository;
    private final KafkaOperations<String, String> kafkaOperations;

    public OutboxPublisher(OutboxEventRepository outboxEventRepository, KafkaOperations<String, String> kafkaOperations) {
        this.outboxEventRepository = outboxEventRepository;
        this.kafkaOperations = kafkaOperations;
    }

    @Scheduled(fixedDelayString = "${app.outbox.poll-interval-ms:3000}")
    @Transactional
    public void publishPending() {
        List<OutboxEventEntity> pendingEvents = outboxEventRepository.findTop50ByStatusOrderByCreatedAtAsc(OutboxStatus.PENDING);

        for (OutboxEventEntity event : pendingEvents) {
            try {
                kafkaOperations.send(event.getTopic(), event.getAggregateId(), event.getPayload()).get();
                event.markSent(OffsetDateTime.now());
                log.info("Published outbox event {} of type {}", event.getId(), event.getEventType());
            } catch (Exception ex) {
                log.error("Outbox publish failed for event {}", event.getId(), ex);
                return;
            }
        }
    }
}
