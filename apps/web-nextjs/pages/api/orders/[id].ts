import type { NextApiRequest, NextApiResponse } from 'next';
import { getReadModelBaseUrl } from '../../../lib/readModel';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = req.query.id;
  if (typeof id !== 'string') {
    res.status(400).json({ message: 'Invalid id' });
    return;
  }

  try {
    const upstream = await fetch(`${getReadModelBaseUrl()}/orders/${id}`);
    const text = await upstream.text();
    res.status(upstream.status).send(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to reach read-model API';
    res.status(502).json({ message });
  }
}
