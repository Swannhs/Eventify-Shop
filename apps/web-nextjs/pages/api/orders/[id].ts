import type { NextApiRequest, NextApiResponse } from 'next';
import { proxyReadModel } from '../../../lib/server/proxyReadModel';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = req.query.id;
  if (typeof id !== 'string') {
    res.status(400).json({ message: 'Invalid id' });
    return;
  }

  await proxyReadModel(res, `/orders/${encodeURIComponent(id)}`);
}
