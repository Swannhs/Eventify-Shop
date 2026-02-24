import Link from 'next/link';
import { useEffect, useState } from 'react';

type Order = {
  order_id: string;
  status: string;
  total: number | null;
  created_at: string;
  updated_at: string;
};

type OrdersResponse = {
  data: Order[];
};

export default function OrdersPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    let mounted = true;

    async function loadOrders(): Promise<void> {
      try {
        setLoading(true);
        const response = await fetch('/api/orders');
        if (!response.ok) {
          throw new Error(`Failed to load orders (${response.status})`);
        }

        const body = (await response.json()) as OrdersResponse;
        if (mounted) {
          setOrders(body.data ?? []);
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

    void loadOrders();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <main className="container">
      <h1>Orders</h1>
      <p className="muted">Refresh page to pull latest read-model projection.</p>

      {loading && <p>Loading orders...</p>}
      {error && <p className="error">{error}</p>}
      {!loading && !error && orders.length === 0 && <p>No orders found.</p>}

      {orders.map((order) => (
        <article key={order.order_id} className="card">
          <h2>
            <Link href={`/orders/${order.order_id}`}>{order.order_id}</Link>
          </h2>
          <p>Status: {order.status}</p>
          <p>Total: {order.total ?? 0}</p>
          <p className="muted">Updated: {new Date(order.updated_at).toLocaleString()}</p>
        </article>
      ))}
    </main>
  );
}
