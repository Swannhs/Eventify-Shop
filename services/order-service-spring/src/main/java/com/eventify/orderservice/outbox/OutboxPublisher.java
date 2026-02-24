package com.eventify.orderservice.outbox;

import java.time.OffsetDateTime;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class OutboxPublisher {

    private static final Logger log = LoggerFactory.getLogger(OutboxPublisher.class);

    private final OutboxEventRepository outboxEventRepository;
    private final KafkaTemplate<String, String> kafkaTemplate;

    public OutboxPublisher(OutboxEventRepository outboxEventRepository, KafkaTemplate<String, String> kafkaTemplate) {
        this.outboxEventRepository = outboxEventRepository;
        this.kafkaTemplate = kafkaTemplate;
    }

    @Scheduled(fixedDelayString = "${app.outbox.poll-interval-ms:3000}")
    @Transactional
    public void publishPending() {
        List<OutboxEventEntity> pendingEvents = outboxEventRepository.findTop50ByPublishedFalseOrderByCreatedAtAsc();

        for (OutboxEventEntity event : pendingEvents) {
            try {
                kafkaTemplate.send(event.getTopic(), event.getAggregateId(), event.getPayload()).get();
                event.markPublished(OffsetDateTime.now());
                log.info("Published outbox event {} of type {}", event.getId(), event.getEventType());
            } catch (Exception ex) {
                log.error("Outbox publish failed for event {}", event.getId(), ex);
                return;
            }
        }
    }
}
