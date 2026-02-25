export type OrderSummary = {
  order_id: string;
  status: string;
  total: number | null;
  created_at: string;
  updated_at: string;
};

export type ShipmentView = {
  shipment_id: string;
  order_id: string;
  carrier: string;
  status: string;
  created_at: string;
};

export type OrdersResponse = {
  data: OrderSummary[];
};

export type OrderDetailResponse = {
  data: {
    order: OrderSummary;
    shipments: ShipmentView[];
  };
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isOrderSummary(value: unknown): value is OrderSummary {
  if (!isObject(value)) {
    return false;
  }

  return (
    typeof value.order_id === 'string' &&
    typeof value.status === 'string' &&
    (typeof value.total === 'number' || value.total === null) &&
    typeof value.created_at === 'string' &&
    typeof value.updated_at === 'string'
  );
}

function isShipment(value: unknown): value is ShipmentView {
  if (!isObject(value)) {
    return false;
  }

  return (
    typeof value.shipment_id === 'string' &&
    typeof value.order_id === 'string' &&
    typeof value.carrier === 'string' &&
    typeof value.status === 'string' &&
    typeof value.created_at === 'string'
  );
}

export function parseOrdersResponse(value: unknown): OrdersResponse {
  if (!isObject(value) || !Array.isArray(value.data) || !value.data.every(isOrderSummary)) {
    throw new Error('Invalid orders response shape');
  }

  return { data: value.data };
}

export function parseOrderDetailResponse(value: unknown): OrderDetailResponse {
  if (!isObject(value) || !isObject(value.data)) {
    throw new Error('Invalid order detail response shape');
  }

  const order = value.data.order;
  const shipments = value.data.shipments;

  if (!isOrderSummary(order) || !Array.isArray(shipments) || !shipments.every(isShipment)) {
    throw new Error('Invalid order detail response shape');
  }

  return {
    data: {
      order,
      shipments,
    },
  };
}
