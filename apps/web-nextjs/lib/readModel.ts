export function getReadModelBaseUrl(): string {
  return process.env.NEXT_PUBLIC_READ_MODEL_URL ?? 'http://localhost:8086';
}
