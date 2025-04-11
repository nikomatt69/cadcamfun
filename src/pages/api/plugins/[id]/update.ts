import type { NextApiRequest, NextApiResponse } from 'next';
import { getRegistryInstance } from '@/src/server/pluginRegistryInstance';
import formidable, { File } from 'formidable';
import {  PluginManifest, validateManifest  } from '@/src/plugins/core/registry/pluginManifest'; // Assuming validation is refactored
import fs, { readFile } from 'fs/promises';
import path from 'path';
import os from 'os';
import { PluginRegistryEntry } from '@/src/plugins/core/registry';

// Disable Next.js body parsing, formidable will handle it
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ success: boolean; updatedPlugin?: PluginRegistryEntry } | { error: string }>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { id } = req.query;
  if (typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid plugin ID' });
  }

  const form = formidable({
    uploadDir: os.tmpdir(), // Use OS temporary directory
    keepExtensions: true,
    multiples: false, // Allow only one file
    filter: ({ mimetype }) => {
        // Ensure it's a zip file or vsix
        return mimetype === 'application/zip' || mimetype === 'application/vnd.vsix';
    },
    filename: (name, ext) => `plugin-upload-${id}-${Date.now()}${ext}`
  });

  let tempPackagePath: string | undefined;
  let newManifest: PluginManifest | null = null; // Initialize as null

  try {
    const { files } = await new Promise<{ files: formidable.Files }>((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) {
          console.error('[API Update] Error parsing form:', err);
          return reject(new Error('Failed to process upload: ' + err.message));
        }
        // Type assertion for single file upload
        const file = files?.file?.[0]; 
        if (!file) {
          return reject(new Error('No plugin package file uploaded. Ensure the file input name is "file".'));
        }
        tempPackagePath = file.filepath; // Assign path here for cleanup
        resolve({ files });
      });
    });

    // Check if path was assigned (should be)
    if (!tempPackagePath) {
        throw new Error('Could not determine temporary package path after upload.');
    }
    const packagePath = tempPackagePath;
    console.log(`[API Update] Received update package for ${id} at temp path: ${packagePath}`);

    // 1. Read the manifest from the new package
    try {
        newManifest = await readFile(packagePath) as unknown as PluginManifest;
    } catch (manifestError) {
        newManifest = null;
        throw new Error(`Failed to read manifest from package: ${manifestError instanceof Error ? manifestError.message : manifestError}`);
    }

    // Type guard for manifest
    if (!newManifest) {
        throw new Error('Manifest could not be read from the package.');
    }

    // 2. Basic Manifest Validation 
    // Assuming validateManifest returns string error or null/undefined if valid
    const validationResult = validateManifest(newManifest); 
    if (validationResult && validationResult.errors && validationResult.errors.length > 0) {
        throw new Error(`Invalid manifest: ${validationResult.errors.join(', ')}`);
    }

    // 3. Check if the manifest ID matches the URL ID
    if (newManifest.id !== id) {
        throw new Error(`Manifest ID (${newManifest.id}) does not match the update target ID (${id}).`);
    }

    // 4. Get Registry and call the update method
    const registry = getRegistryInstance();
    console.log(`[API Update] Calling registry.updatePlugin for ${id} with new manifest version ${newManifest.version}`);

    // This method needs to be implemented in PluginRegistry
    const updatedEntry = await registry.updatePlugin(id, newManifest, packagePath);

    // Assuming updatePlugin handles cleanup of packagePath if successful
    tempPackagePath = undefined; // Prevent double cleanup in finally block

    console.log(`[API Update] Plugin ${id} updated successfully to version ${newManifest.version}`);
    res.status(200).json({ success: true, updatedPlugin: updatedEntry });

  } catch (error) {
    console.error(`[API Update] Failed to update plugin ${id}:`, error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal Server Error during update' });
  } finally {
    // Ensure temporary file is cleaned up if something failed *before* updatePlugin was called or if updatePlugin threw
    if (tempPackagePath) {
        await fs.rm(tempPackagePath, { force: true, recursive: true }).catch(e => console.error("[API Update] Cleanup failed:", e));
    }
  }
}
