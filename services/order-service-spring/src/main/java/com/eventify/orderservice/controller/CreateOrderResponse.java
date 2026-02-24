package com.eventify.orderservice.controller;

public record CreateOrderResponse(String orderId, String status, String correlationId) {
}
