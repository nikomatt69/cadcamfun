import type { NextApiRequest, NextApiResponse } from 'next';
import { PluginRegistryEntry } from '@/src/plugins/core/registry';
import { getRegistryInstance } from '@/src/server/pluginRegistryInstance'; // Adjust path as needed

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PluginRegistryEntry[] | { error: string }>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const registry = getRegistryInstance();
    // Ensure registry is loaded (if init is async and not awaited in constructor)
    // await registry.waitForInitialization(); // Example if needed
    const plugins = registry.getAllPlugins();
    // We only send the serializable registry entries, not live host instances
    res.status(200).json(plugins);
  } catch (error) {
    console.error('Failed to get plugins:', error);
    res.status(500).json({ error: 'Failed to retrieve plugin list' });
  }
} 