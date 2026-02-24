package com.eventify.inventoryservice.domain;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

@Component
public class InventoryBootstrap {

    private final InventoryItemRepository inventoryItemRepository;

    public InventoryBootstrap(InventoryItemRepository inventoryItemRepository) {
        this.inventoryItemRepository = inventoryItemRepository;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void seedInventory() {
        createIfMissing("SKU-RED-TSHIRT", 100);
        createIfMissing("SKU-BLUE-CAP", 50);
        createIfMissing("SKU-GREEN-HOODIE", 0);
    }

    private void createIfMissing(String sku, int qty) {
        if (inventoryItemRepository.findById(sku).isEmpty()) {
            inventoryItemRepository.save(new InventoryItemEntity(sku, qty));
        }
    }
}
