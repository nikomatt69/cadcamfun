import type { NextApiRequest, NextApiResponse } from 'next';
import { getRegistryInstance } from '@/src/server/pluginRegistryInstance';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ success: boolean } | { error: string }>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { id } = req.query;

  if (typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid plugin ID' });
  }

  try {
    const registry = getRegistryInstance();
    await registry.disablePlugin(id);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error(`Failed to disable plugin ${id}:`, error);
    res.status(500).json({ error: `Failed to disable plugin: ${error instanceof Error ? error.message : String(error)}` });
  }
} 