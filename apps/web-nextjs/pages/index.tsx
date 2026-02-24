import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="container">
      <h1>Eventify Shop UI</h1>
      <p className="muted">Read-model driven UI.</p>
      <p>
        <Link href="/orders">Go to Orders</Link>
      </p>
    </main>
  );
}
