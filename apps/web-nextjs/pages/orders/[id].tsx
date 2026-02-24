import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

type Shipment = {
  shipment_id: string;
  order_id: string;
  carrier: string;
  status: string;
  created_at: string;
};

type Order = {
  order_id: string;
  status: string;
  total: number | null;
  created_at: string;
  updated_at: string;
};

type OrderDetailResponse = {
  data: {
    order: Order;
    shipments: Shipment[];
  };
};

export default function OrderDetailPage() {
  const router = useRouter();
  const orderId = router.query.id;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [shipments, setShipments] = useState<Shipment[]>([]);

  useEffect(() => {
    if (typeof orderId !== 'string') {
      return;
    }

    let mounted = true;

    async function loadOrder(): Promise<void> {
      try {
        setLoading(true);
        const response = await fetch(`/api/orders/${orderId}`);
        if (!response.ok) {
          throw new Error(`Failed to load order (${response.status})`);
        }

        const body = (await response.json()) as OrderDetailResponse;
        if (mounted) {
          setOrder(body.data?.order ?? null);
          setShipments(body.data?.shipments ?? []);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Unexpected error');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadOrder();
    return () => {
      mounted = false;
    };
  }, [orderId]);

  return (
    <main className="container">
      <p>
        <Link href="/orders">Back to Orders</Link>
      </p>
      <h1>Order Detail</h1>

      {loading && <p>Loading order detail...</p>}
      {error && <p className="error">{error}</p>}

      {!loading && !error && order && (
        <>
          <section className="card">
            <h2>{order.order_id}</h2>
            <p>Status: {order.status}</p>
            <p>Total: {order.total ?? 0}</p>
            <p className="muted">Updated: {new Date(order.updated_at).toLocaleString()}</p>
          </section>

          <section className="card">
            <h3>Shipments</h3>
            {shipments.length === 0 && <p className="muted">No shipment yet.</p>}
            {shipments.length > 0 && (
              <ul className="inline-list">
                {shipments.map((shipment) => (
                  <li key={shipment.shipment_id}>
                    {shipment.shipment_id} | {shipment.status} | {shipment.carrier}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}
