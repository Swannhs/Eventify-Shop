package com.eventify.inventoryservice.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "inventory_items")
public class InventoryItemEntity {

    @Id
    private String sku;

    @Column(name = "available_qty", nullable = false)
    private int availableQty;

    protected InventoryItemEntity() {
    }

    public InventoryItemEntity(String sku, int availableQty) {
        this.sku = sku;
        this.availableQty = availableQty;
    }

    public String getSku() {
        return sku;
    }

    public int getAvailableQty() {
        return availableQty;
    }

    public void decrease(int quantity) {
        this.availableQty -= quantity;
    }
}
