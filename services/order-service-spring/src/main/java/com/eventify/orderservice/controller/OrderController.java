package com.eventify.orderservice.controller;

import com.eventify.orderservice.service.OrderApplicationService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/orders")
public class OrderController {

    private static final String CORRELATION_HEADER = "X-Correlation-Id";

    private final OrderApplicationService orderApplicationService;

    public OrderController(OrderApplicationService orderApplicationService) {
        this.orderApplicationService = orderApplicationService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public CreateOrderResponse create(
            @Valid @RequestBody CreateOrderRequest request,
            @RequestHeader(name = CORRELATION_HEADER, required = false) String correlationId
    ) {
        return orderApplicationService.createOrder(request, correlationId);
    }
}
