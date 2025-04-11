import type { NextApiRequest, NextApiResponse } from 'next';
import { PluginRegistryEntry } from '@/src/plugins/core/registry';
import { getRegistryInstance } from '@/src/server/pluginRegistryInstance'; // Needed to get storage
import { DatabasePluginStorage } from '@/src/server/storage/DatabasePluginStorage'; // Assuming direct access or via registry

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PluginRegistryEntry[] | { error: string }>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // Get storage provider directly or via registry instance
    // Option 1: Direct (if you export DatabasePluginStorage instance or have a singleton)
    // const storage = getDatabaseStorageInstance(); 
    // Option 2: Via Registry (safer if registry manages storage lifecycle)
    const registry = getRegistryInstance();
    const storage = registry.getStorage(); // Assumes getStorage() exists on registry
    
    if (!storage) { throw new Error('Storage provider not available.'); }

    // Fetch directly from storage (which queries the database)
    const plugins = await storage.getPlugins(); 

    res.status(200).json(plugins);
  } catch (error) {
    console.error('Failed to get plugins:', error);
    res.status(500).json({ error: 'Failed to retrieve plugin list' });
  }
} 