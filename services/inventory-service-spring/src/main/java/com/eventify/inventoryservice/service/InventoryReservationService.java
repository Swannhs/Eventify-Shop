package com.eventify.inventoryservice.service;

import com.eventify.inventoryservice.domain.InventoryItemEntity;
import com.eventify.inventoryservice.domain.InventoryItemRepository;
import com.eventify.inventoryservice.domain.InventoryReservationEntity;
import com.eventify.inventoryservice.domain.InventoryReservationRepository;
import com.eventify.inventoryservice.messaging.InventoryEventFactory;
import com.eventify.inventoryservice.messaging.OrderPlacedEvent;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class InventoryReservationService {

    private static final Logger log = LoggerFactory.getLogger(InventoryReservationService.class);

    private final InventoryItemRepository inventoryItemRepository;
    private final InventoryReservationRepository inventoryReservationRepository;
    private final KafkaTemplate<String, String> kafkaTemplate;
    private final InventoryEventFactory inventoryEventFactory;
    private final JdbcTemplate jdbcTemplate;

    @Value("${app.kafka.inventory-topic:inventory.events}")
    private String inventoryTopic;

    public InventoryReservationService(InventoryItemRepository inventoryItemRepository,
                                       InventoryReservationRepository inventoryReservationRepository,
                                       KafkaTemplate<String, String> kafkaTemplate,
                                       InventoryEventFactory inventoryEventFactory,
                                       JdbcTemplate jdbcTemplate) {
        this.inventoryItemRepository = inventoryItemRepository;
        this.inventoryReservationRepository = inventoryReservationRepository;
        this.kafkaTemplate = kafkaTemplate;
        this.inventoryEventFactory = inventoryEventFactory;
        this.jdbcTemplate = jdbcTemplate;
    }

    @Transactional
    public boolean processOrderPlaced(OrderPlacedEvent event) throws Exception {
        if (!"OrderPlaced".equals(event.eventType())) {
            return false;
        }

        boolean firstTime = markProcessed(event.eventId());
        if (!firstTime) {
            log.info("Duplicate event ignored eventId={} correlationId={}", event.eventId(), event.correlationId());
            return false;
        }

        String orderId = event.payload().orderId();
        List<OrderPlacedEvent.Item> items = event.payload().items();
        List<InventoryItemEntity> lockedItems = new ArrayList<>();

        for (OrderPlacedEvent.Item item : items) {
            Optional<InventoryItemEntity> maybeInventory = inventoryItemRepository.findBySkuForUpdate(item.sku());
            if (maybeInventory.isEmpty() || maybeInventory.get().getAvailableQty() < item.quantity()) {
                publishOutOfStock(event.correlationId(), orderId);
                return true;
            }
            lockedItems.add(maybeInventory.get());
        }

        for (InventoryItemEntity inventoryItem : lockedItems) {
            OrderPlacedEvent.Item requestedItem = findItemBySku(items, inventoryItem.getSku());
            if (requestedItem == null) {
                continue;
            }

            inventoryItem.decrease(requestedItem.quantity());
            inventoryItemRepository.save(inventoryItem);
            inventoryReservationRepository.save(new InventoryReservationEntity(
                    UUID.randomUUID().toString(),
                    orderId,
                    requestedItem.sku(),
                    requestedItem.quantity(),
                    OffsetDateTime.now()
            ));
        }

        publishReserved(event.correlationId(), orderId);
        return true;
    }

    private void publishReserved(String correlationId, String orderId) throws Exception {
        String payload = inventoryEventFactory.buildInventoryReserved(correlationId, orderId);
        kafkaTemplate.send(inventoryTopic, orderId, payload).get();
        log.info("Published InventoryReserved orderId={} correlationId={}", orderId, correlationId);
    }

    private void publishOutOfStock(String correlationId, String orderId) throws Exception {
        String payload = inventoryEventFactory.buildOutOfStock(correlationId, orderId);
        kafkaTemplate.send(inventoryTopic, orderId, payload).get();
        log.info("Published OutOfStock orderId={} correlationId={}", orderId, correlationId);
    }

    private boolean markProcessed(String eventId) {
        int updated = jdbcTemplate.update(
                "INSERT INTO processed_events(event_id, processed_at) VALUES (?, NOW()) ON CONFLICT (event_id) DO NOTHING",
                eventId
        );
        return updated == 1;
    }

    private OrderPlacedEvent.Item findItemBySku(List<OrderPlacedEvent.Item> items, String sku) {
        for (OrderPlacedEvent.Item item : items) {
            if (item.sku().equals(sku)) {
                return item;
            }
        }

        return null;
    }
}
