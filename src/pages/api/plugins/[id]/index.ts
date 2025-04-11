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
    // Get single plugin details including its saved configuration
     try {
      const registry = getRegistryInstance();
      const storage = registry.getStorage(); // Get storage provider
      if (!storage) { throw new Error('Storage provider not available.'); }

      // Fetch the main plugin data directly from storage
      storage.getPluginConfig(id)
      // Or, fetch all and filter (less efficient for single item)
      // TEMPORARY: Fetch all and filter, assuming getPlugin(id) on storage doesn't exist yet
      const allPlugins = await storage.getPlugins();
      const plugin = allPlugins.find(p => p.id === id);

      // Check if found
      if (!plugin) {
         return res.status(404).json({ error: 'Plugin not found' });
      }

      // Fetch the saved configuration for this plugin
      const savedConfig = await storage.getPluginConfig(id);

      // Combine plugin data with its configuration
      const pluginWithConfig = {
          ...plugin,
          config: savedConfig || {}, 
      };

      res.status(200).json(pluginWithConfig); 

    } catch (error) {
      console.error(`Failed to get plugin ${id}:`, error);
      res.status(500).json({ error: 'Failed to retrieve plugin details' });
    }
  } else {
    res.setHeader('Allow', ['GET', 'DELETE']);
    res.status(405).json({ error: 'Method Not Allowed' });
  }
} 