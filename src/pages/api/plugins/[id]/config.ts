import type { NextApiRequest, NextApiResponse } from 'next';
import { getRegistryInstance } from '@/src/server/pluginRegistryInstance';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ success: boolean } | { error: string }>
) {
  // Only allow PUT requests
  if (req.method !== 'PUT') {
    res.setHeader('Allow', ['PUT']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  const { id } = req.query;

  if (typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid plugin ID' });
  }

  // Ensure request body is present and is an object
  if (!req.body || typeof req.body !== 'object') {
       return res.status(400).json({ error: 'Invalid request body: Configuration object expected.' });
  }

  const newConfigData = req.body; // Next.js automatically parses JSON body if Content-Type is correct

  try {
    const registry = getRegistryInstance();
    const storage = registry.getStorage();
    if (!storage) { throw new Error('Storage provider not available.'); }

    // --- Check if plugin exists directly via storage --- 
    const allPlugins = await storage.getPlugins(); 
    const pluginExists = allPlugins.some(p => p.id === id);
    
    if (!pluginExists) {
        return res.status(404).json({ error: `Plugin with ID '${id}' not found.` });
    }
    // ----------------------------------------------------

    // TODO: Add validation here? Compare newConfigData against plugin.manifest.configuration schema?
    // This would require fetching the specific plugin manifest, potentially add storage.getPlugin(id)

    await storage.savePluginConfig(id, newConfigData);

    console.log(`Configuration saved successfully for plugin ${id}`);
    res.status(200).json({ success: true });

  } catch (error) {
    console.error(`Failed to save configuration for plugin ${id}:`, error);
    res.status(500).json({ error: `Failed to save configuration: ${error instanceof Error ? error.message : String(error)}` });
  }
} 