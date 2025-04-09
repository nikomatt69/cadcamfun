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
const PLUGINS_REGISTRY_DIR = process.env.PLUGINS_REGISTRY_DIR || path.join(process.cwd(), 'public', 'plugins');

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PluginManifest[] | { error: string }>
) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  // Get search query from request
  const { q: query } = req.query;
  
  if (!query || Array.isArray(query) || !query.trim()) {
    return res.status(400).json({ error: 'Invalid search query' });
  }
  
  try {
    // Read plugin directories
    const plugins: PluginManifest[] = [];
    
    // Check if directory exists
    if (!fs.existsSync(PLUGINS_REGISTRY_DIR)) {
      return res.status(200).json([]);
    }
    
    const pluginDirs = fs.readdirSync(PLUGINS_REGISTRY_DIR, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
    
    // Normalize search query
    const searchQuery = query.toLowerCase().trim();
    
    // Read manifest from each plugin directory
    for (const pluginDir of pluginDirs) {
      const manifestPath = path.join(PLUGINS_REGISTRY_DIR, pluginDir, 'manifest.json');
      
      if (fs.existsSync(manifestPath)) {
        try {
          const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
          const manifest = JSON.parse(manifestContent) as PluginManifest;
          
          // Check if the plugin matches the search query
          const matches = 
            manifest.id?.toLowerCase().includes(searchQuery) ||
            manifest.name?.toLowerCase().includes(searchQuery) ||
            manifest.description?.toLowerCase().includes(searchQuery) ||
            manifest.author?.toLowerCase().includes(searchQuery);
          
          // Add the plugin to the list if it matches
          if (matches && manifest.id && manifest.name) {
            plugins.push(manifest);
          }
        } catch (err) {
          console.error(`Failed to read manifest for plugin ${pluginDir}:`, err);
          // Skip this plugin but continue with others
        }
      }
    }
    
    // Return the list of matching plugins
    return res.status(200).json(plugins);
  } catch (error) {
    console.error('Failed to search plugin registry:', error);
    return res.status(500).json({ error: 'Failed to search plugin registry' });
  }
}