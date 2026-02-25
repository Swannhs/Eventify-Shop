import type { NextApiResponse } from 'next';
import { getReadModelBaseUrl } from '../readModel';

export async function proxyReadModel(res: NextApiResponse, path: string): Promise<void> {
  try {
    const upstream = await fetch(`${getReadModelBaseUrl()}${path}`);
    const text = await upstream.text();

    res.status(upstream.status);
    res.setHeader('content-type', upstream.headers.get('content-type') ?? 'application/json; charset=utf-8');
    res.send(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to reach read-model API';
    res.status(502).json({ message });
  }
}
