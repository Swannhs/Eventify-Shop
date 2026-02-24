import type { NextApiRequest, NextApiResponse } from 'next';
import { getReadModelBaseUrl } from '../../../lib/readModel';

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  try {
    const upstream = await fetch(`${getReadModelBaseUrl()}/orders`);
    const text = await upstream.text();
    res.status(upstream.status).send(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to reach read-model API';
    res.status(502).json({ message });
  }
}
