import { fetchJson } from './http';
import {
  type OrderDetailResponse,
  type OrdersResponse,
  parseOrderDetailResponse,
  parseOrdersResponse,
} from '../types/readModel';

export async function getOrders(signal?: AbortSignal): Promise<OrdersResponse> {
  return fetchJson('/api/orders', parseOrdersResponse, { signal });
}

export async function getOrderDetail(orderId: string, signal?: AbortSignal): Promise<OrderDetailResponse> {
  return fetchJson(`/api/orders/${orderId}`, parseOrderDetailResponse, { signal });
}
