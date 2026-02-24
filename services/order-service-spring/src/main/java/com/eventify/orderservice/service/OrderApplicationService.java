package com.eventify.orderservice.service;

import com.eventify.orderservice.controller.CreateOrderRequest;
import com.eventify.orderservice.controller.CreateOrderResponse;
import com.eventify.orderservice.domain.OrderEntity;
import com.eventify.orderservice.domain.OrderRepository;
import com.eventify.orderservice.domain.OrderStatus;
import com.eventify.orderservice.outbox.OutboxEventEntity;
import com.eventify.orderservice.outbox.OutboxEventRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.transaction.Transactional;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class OrderApplicationService {

    private final OrderRepository orderRepository;
    private final OutboxEventRepository outboxEventRepository;
    private final ObjectMapper objectMapper;

    public OrderApplicationService(OrderRepository orderRepository,
                                   OutboxEventRepository outboxEventRepository,
                                   ObjectMapper objectMapper) {
        this.orderRepository = orderRepository;
        this.outboxEventRepository = outboxEventRepository;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public CreateOrderResponse createOrder(CreateOrderRequest request) {
        String orderId = UUID.randomUUID().toString();
        String correlationId = UUID.randomUUID().toString();

        String itemsJson;
        String eventPayload;
        try {
            itemsJson = objectMapper.writeValueAsString(request.items());
            eventPayload = buildOrderPlacedEnvelope(orderId, correlationId, request.items());
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Failed to serialize order payload", e);
        }

        OrderEntity order = new OrderEntity(
                orderId,
                request.customerId(),
                itemsJson,
                OrderStatus.CREATED.name(),
                OffsetDateTime.now()
        );
        orderRepository.save(order);

        OutboxEventEntity outbox = new OutboxEventEntity(
                UUID.randomUUID().toString(),
                orderId,
                "OrderPlaced",
                "orders.events",
                eventPayload,
                OffsetDateTime.now()
        );
        outboxEventRepository.save(outbox);

        return new CreateOrderResponse(orderId, OrderStatus.CREATED.name(), correlationId);
    }

    private String buildOrderPlacedEnvelope(String orderId,
                                            String correlationId,
                                            List<CreateOrderRequest.Item> items) throws JsonProcessingException {
        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("eventId", UUID.randomUUID().toString());
        envelope.put("eventType", "OrderPlaced");
        envelope.put("occurredAt", OffsetDateTime.now().toString());
        envelope.put("correlationId", correlationId);
        envelope.put("producer", "order-service");
        envelope.put("version", 1);

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("orderId", orderId);
        payload.put("items", items);

        envelope.put("payload", payload);

        return objectMapper.writeValueAsString(envelope);
    }
}
