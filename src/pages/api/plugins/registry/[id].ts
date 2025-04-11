import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

// Define plugin manifest type for response
type PluginManifest = {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  entryPoint: string;
  homepage?: string;
  repository?: string;
  dependencies: Record<string, string>;
  permissions: string[];
  extensionPoints: string[];
  minAppVersion: string;
  maxAppVersion?: string;
};

// Base directory for plugin registry
const PLUGINS_REGISTRY_DIR = process.env.PLUGINS_REGISTRY_DIR || path.join(process.cwd(), 'public', 'plugins','plugins-data');

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PluginManifest | { error: string }>
) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  // Get plugin ID from the request
  const { id } = req.query;
  
  if (!id || Array.isArray(id)) {
    return res.status(400).json({ error: 'Invalid plugin ID' });
  }
  
  try {
    // Sanitize the plugin ID to prevent directory traversal attacks
    const sanitizedId = id.replace(/[^a-zA-Z0-9-_]/g, '');
    const pluginDir = path.join(PLUGINS_REGISTRY_DIR, sanitizedId);
    
    // Check if the plugin directory exists
    if (!fs.existsSync(pluginDir)) {
      return res.status(404).json({ error: 'Plugin not found' });
    }
    
    // Read the manifest file
    const manifestPath = path.join(pluginDir, 'manifest.json');
    
    if (!fs.existsSync(manifestPath)) {
      return res.status(404).json({ error: 'Plugin manifest not found' });
    }
    
    // Parse the manifest
    const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestContent) as PluginManifest;
    
    // Validate the manifest
    if (!manifest.id || !manifest.name) {
      return res.status(400).json({ error: 'Invalid plugin manifest' });
    }
    
    // Return the plugin manifest
    return res.status(200).json(manifest);
  } catch (error) {
    console.error(`Failed to fetch plugin ${id}:`, error);
    return res.status(500).json({ error: 'Failed to fetch plugin details' });
  }
}