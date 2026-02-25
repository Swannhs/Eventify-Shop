export function getReadModelBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_READ_MODEL_URL ?? 'http://localhost:8086';

  try {
    return new URL(raw).toString().replace(/\/$/, '');
  } catch {
    throw new Error('NEXT_PUBLIC_READ_MODEL_URL must be a valid absolute URL');
  }
}
