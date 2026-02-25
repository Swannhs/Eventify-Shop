import { useCallback } from 'react';
import { OrderCard } from '../../components/orders/OrderCard';
import { StateMessage } from '../../components/ui/StateMessage';
import { useAsyncResource } from '../../hooks/useAsyncResource';
import { getOrders } from '../../lib/readModelClient';

export default function OrdersPage() {
  const loadOrders = useCallback((signal: AbortSignal) => getOrders(signal), []);
  const { data, error, loading } = useAsyncResource(loadOrders, [loadOrders]);

  return (
    <main className="container">
      <h1>Orders</h1>
      <p className="muted">Refresh page to pull latest read-model projection.</p>

      {loading && <StateMessage tone="muted" message="Loading orders..." />}
      {!loading && error && <StateMessage tone="error" message={error} />}
      {!loading && !error && data && data.data.length === 0 && (
        <StateMessage tone="muted" message="No orders found." />
      )}

      {!loading && !error && data && data.data.map((order) => <OrderCard key={order.order_id} order={order} />)}
    </main>
  );
}
