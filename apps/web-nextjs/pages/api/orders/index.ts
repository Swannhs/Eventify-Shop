import type { NextApiRequest, NextApiResponse } from 'next';
import { proxyReadModel } from '../../../lib/server/proxyReadModel';

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  await proxyReadModel(res, '/orders');
}
