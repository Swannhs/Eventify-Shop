import Link from 'next/link';
import type { OrderSummary } from '../../types/readModel';

type OrderCardProps = {
  order: OrderSummary;
};

export function OrderCard({ order }: OrderCardProps) {
  return (
    <article className="card">
      <h2>
        <Link href={`/orders/${order.order_id}`}>{order.order_id}</Link>
      </h2>
      <p>Status: {order.status}</p>
      <p>Total: {order.total ?? 0}</p>
      <p className="muted">Updated: {new Date(order.updated_at).toLocaleString()}</p>
    </article>
  );
}
