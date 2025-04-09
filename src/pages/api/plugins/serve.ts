// src/pages/api/plugins/serve.ts (enhanced)
import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';

// Base directory for plugin registry
const PLUGINS_REGISTRY_DIR = process.env.PLUGINS_REGISTRY_DIR || path.join(process.cwd(), 'public', 'plugins');

// Map of file extensions to MIME types
const MIME_TYPES: Record<string, string> = {
  '.js': 'application/javascript',
  '.ts': 'application/typescript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.html': 'text/html',
  '.txt': 'text/plain',
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  // Get plugin ID and file path from the request
  const { id, file } = req.query;
  
  if (!id || Array.isArray(id) || !file || Array.isArray(file)) {
    return res.status(400).json({ error: 'Invalid request parameters' });
  }
  
  try {
    // Sanitize the plugin ID and file path to prevent directory traversal attacks
    const sanitizedId = id.replace(/[^a-zA-Z0-9-_]/g, '');
    const sanitizedFile = file.replace(/\.\./g, ''); // Remove attempts to navigate up
    
    // Construct the full file path
    const filePath = path.join(PLUGINS_REGISTRY_DIR, sanitizedId, sanitizedFile);
    
    // Check if the file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Get file extension to determine MIME type
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = MIME_TYPES[ext] || 'application/octet-stream';
    
    // Read the file content
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // For JavaScript files, wrap in a security wrapper
    if (ext === '.js' || ext === '.ts') {
      // Generate a content hash for integrity checks
      const contentHash = createHash('sha256').update(content).digest('hex');
      
      // Wrap the code in a security wrapper
      const wrappedContent = `
        // CAD/CAM FUN Plugin Security Wrapper
        // Plugin ID: ${sanitizedId}
        // File: ${sanitizedFile}
        // Content Hash: ${contentHash}
        // Timestamp: ${new Date().toISOString()}
        
        (function(window) {
          // Create a restricted window object
          const restrictedWindow = {
            // Allow limited access to the window object
            setTimeout: window.setTimeout,
            clearTimeout: window.clearTimeout,
            setInterval: window.setInterval,
            clearInterval: window.clearInterval,
            console: {
              log: (...args) => console.log(\`[Plugin ${sanitizedId}]\`, ...args),
              warn: (...args) => console.warn(\`[Plugin ${sanitizedId}]\`, ...args),
              error: (...args) => console.error(\`[Plugin ${sanitizedId}]\`, ...args),
              info: (...args) => console.info(\`[Plugin ${sanitizedId}]\`, ...args)
            },
            
            // Plugin registry
            plugin_${sanitizedId}: null
          };
          
          // Execute the plugin code with the restricted window
          try {
            (function(window) {
              ${content}
            })(restrictedWindow);
            
            // Expose the plugin to the global window
            window.plugin_${sanitizedId} = restrictedWindow.plugin_${sanitizedId};
          } catch (error) {
            console.error(\`[Plugin ${sanitizedId}] Error executing plugin code:\`, error);
          }
        })(window);
      `;
      
      // Set headers
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Security-Policy', "script-src 'self'");
      res.setHeader('X-Content-Type-Options', 'nosniff');
      
      // Return the wrapped content
      return res.status(200).send(wrappedContent);
    }
    
    // For non-JavaScript files, serve as-is
    // Set headers
    res.setHeader('Content-Type', mimeType);
    
    // Return the content
    return res.status(200).send(content);
  } catch (error) {
    console.error(`Failed to serve plugin file ${id}/${file}:`, error);
    return res.status(500).json({ error: 'Failed to serve plugin file' });
  }
}