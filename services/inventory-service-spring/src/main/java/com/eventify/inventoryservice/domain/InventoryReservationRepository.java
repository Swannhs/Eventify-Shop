package com.eventify.inventoryservice.domain;

import org.springframework.data.jpa.repository.JpaRepository;

public interface InventoryReservationRepository extends JpaRepository<InventoryReservationEntity, String> {
}
