import type { NextApiRequest, NextApiResponse } from 'next';
import { getRegistryInstance } from '@/src/server/pluginRegistryInstance';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ success: boolean } | { error: string } | any> // Added any for GET response
) {
  const { id } = req.query;

  if (typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid plugin ID' });
  }

  if (req.method === 'DELETE') {
    try {
      const registry = getRegistryInstance();
      await registry.uninstallPlugin(id);
      res.status(200).json({ success: true });
    } catch (error) {
      console.error(`Failed to uninstall plugin ${id}:`, error);
      res.status(500).json({ error: `Failed to uninstall plugin: ${error instanceof Error ? error.message : String(error)}` });
    }
  } else if (req.method === 'GET') {
    // Optional: Get single plugin details
     try {
      const registry = getRegistryInstance();
      const plugin = registry.getPlugin(id);
      if (!plugin) {
         return res.status(404).json({ error: 'Plugin not found' });
      }
      res.status(200).json(plugin); // Return the PluginRegistryEntry
    } catch (error) {
      console.error(`Failed to get plugin ${id}:`, error);
      res.status(500).json({ error: 'Failed to retrieve plugin details' });
    }
  } else {
    res.setHeader('Allow', ['GET', 'DELETE']);
    res.status(405).json({ error: 'Method Not Allowed' });
  }
} 