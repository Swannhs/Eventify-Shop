import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCallback } from 'react';
import { ShipmentList } from '../../components/orders/ShipmentList';
import { StateMessage } from '../../components/ui/StateMessage';
import { useAsyncResource } from '../../hooks/useAsyncResource';
import { getOrderDetail } from '../../lib/readModelClient';

export default function OrderDetailPage() {
  const router = useRouter();
  const orderId = typeof router.query.id === 'string' ? router.query.id : null;

  const loadOrder = useCallback(
    (signal: AbortSignal) => {
      if (!orderId) {
        return Promise.reject(new Error('Order ID is required'));
      }

      return getOrderDetail(orderId, signal);
    },
    [orderId]
  );

  const { data, error, loading } = useAsyncResource(loadOrder, [loadOrder], {
    enabled: router.isReady && !!orderId,
  });

  return (
    <main className="container">
      <p>
        <Link href="/orders">Back to Orders</Link>
      </p>
      <h1>Order Detail</h1>

      {loading && <StateMessage tone="muted" message="Loading order detail..." />}
      {!loading && error && <StateMessage tone="error" message={error} />}

      {!loading && !error && data && (
        <>
          <section className="card">
            <h2>{data.data.order.order_id}</h2>
            <p>Status: {data.data.order.status}</p>
            <p>Total: {data.data.order.total ?? 0}</p>
            <p className="muted">Updated: {new Date(data.data.order.updated_at).toLocaleString()}</p>
          </section>

          <section className="card">
            <h3>Shipments</h3>
            <ShipmentList shipments={data.data.shipments} />
          </section>
        </>
      )}
    </main>
  );
}
