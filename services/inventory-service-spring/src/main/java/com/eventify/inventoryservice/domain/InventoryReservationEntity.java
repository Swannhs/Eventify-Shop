package com.eventify.inventoryservice.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

@Entity
@Table(name = "inventory_reservations")
public class InventoryReservationEntity {

    @Id
    @Column(name = "reservation_id")
    private String reservationId;

    @Column(name = "order_id", nullable = false)
    private String orderId;

    @Column(nullable = false)
    private String sku;

    @Column(nullable = false)
    private int qty;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    protected InventoryReservationEntity() {
    }

    public InventoryReservationEntity(String reservationId, String orderId, String sku, int qty, OffsetDateTime createdAt) {
        this.reservationId = reservationId;
        this.orderId = orderId;
        this.sku = sku;
        this.qty = qty;
        this.createdAt = createdAt;
    }
}
