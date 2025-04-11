import type { NextApiRequest, NextApiResponse } from 'next';
import { getRegistryInstance } from '@/src/server/pluginRegistryInstance';
import { PluginManifest, PluginRegistryEntry } from '@/src/plugins/core/registry';
import formidable from 'formidable';
import fs from 'fs/promises';
import fsSync from 'fs'; // Use sync stream for piping fetch response
import path from 'path';
import os from 'os';
import unzipper from 'unzipper'; // Added unzipper import

// Disable Next.js body parsing for formidable
export const config = {
  api: {
    bodyParser: false,
  },
};

// Helper function to read manifest from a zip/vsix package
async function readManifestFromPackage(filePath: string): Promise<PluginManifest> {
  return new Promise((resolve, reject) => {
    const stream = fsSync.createReadStream(filePath);
    let manifestFound = false;

    stream.pipe(unzipper.Parse())
      .on('entry', (entry: unzipper.Entry) => {
        // Match manifest.json at root OR inside a single top-level directory
        // Regex: Optional non-slash characters (directory name), followed by /manifest.json
        const isManifestPath = /^([^\/]+\/)?manifest\.json$/i.test(entry.path);
        
        if (isManifestPath && entry.type === 'File' && !manifestFound) {
           manifestFound = true; // Process only the first match
           console.log(`[Install API] Found manifest entry at path: ${entry.path}`);
           entry.buffer()
            .then((buffer: Buffer) => {
              try {
                const manifest = JSON.parse(buffer.toString('utf-8'));
                 // --- MODIFIED VALIDATION ---
                 // Check for presence AND non-empty string for id
                 if (!manifest.id || typeof manifest.id !== 'string' || manifest.id.trim() === '' || !manifest.version || !manifest.main) {
                   reject(new Error("Extracted manifest is missing required fields (non-empty id, version, main)."));
                 } else {
                   resolve(manifest);
                 }
                 // --- END MODIFIED VALIDATION ---
              } catch (parseError) {
                reject(new Error(`Failed to parse manifest.json: ${parseError instanceof Error ? parseError.message : String(parseError)}`));
              }
            })
            .catch(err => {
                 console.error(`[Install API] Error buffering manifest entry ${entry.path}:`, err);
                 reject(new Error(`Failed to buffer manifest entry: ${err.message}`));
             });
        } else {
          // Drain other entries to allow processing to continue
          entry.autodrain();
        }
      })
      .on('error', (err: Error) => {
           console.error("[Install API] Error piping or parsing package stream:", err);
           reject(new Error(`Error reading package archive: ${err.message}`));
       })
      .on('close', () => {
         // Only reject if the stream closes *without* having found and resolved the manifest
         if (!manifestFound) {
             console.error("[Install API] Stream closed, manifest.json not found at root or one level deep.");
             reject(new Error('manifest.json not found in package root or a single sub-directory.'));
         }
      });
  });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PluginRegistryEntry | { error: string }>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const form = formidable({});
  let tempDir: string | null = null;
  let packagePath: string | null = null; // Path to the original zip/vsix file
  let extractedManifest: PluginManifest | null = null;
  let downloadedFilePath: string | null = null; // Keep track if we downloaded

  try {
    // --- Parse Request ---
    const [fields, files] = await form.parse(req);
    const url = fields.url?.[0];
    const uploadedFile = files.file?.[0];

    if (!url && !uploadedFile) {
      return res.status(400).json({ error: 'Missing plugin file or URL' });
    }

    // --- Create Temp Directory ---
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'plugin-install-'));

    // --- Handle Source (URL or File) ---
    if (url) {
      console.log(`Install requested from URL: ${url}`);
      // --- Download URL ---
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to download from URL: ${response.status} ${response.statusText}`);
        }
        if (!response.body) {
           throw new Error("Response body is empty.");
        }

        // Determine a filename (basic example)
        const contentDisposition = response.headers.get('content-disposition');
        let filename = 'plugin_download.zip'; // Default
         if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename="?(.+?)"?$/i);
            if (filenameMatch && filenameMatch[1]) {
                filename = path.basename(filenameMatch[1]); // Sanitize basename
            }
         } else {
             // Try getting from URL path
             try {
                const urlPath = new URL(url).pathname;
                const base = path.basename(urlPath);
                if (base) filename = base;
             } catch { /* Ignore URL parsing errors */ }
         }

        downloadedFilePath = path.join(tempDir, filename);
        packagePath = downloadedFilePath;

        console.log(`Downloading to temporary path: ${packagePath}`);
        const writer = fsSync.createWriteStream(packagePath);
        const { Readable } = await import('node:stream');
        const readableWebStream = Readable.fromWeb(response.body as any);

        await new Promise<void>((resolve, reject) => {
            readableWebStream.pipe(writer);
            readableWebStream.on('error', reject);
            writer.on('finish', () => resolve());
            writer.on('error', reject);
        });

        console.log(`Downloaded successfully from URL: ${url}`);

      } catch (downloadError) {
         console.error("Download failed:", downloadError);
         throw new Error(`Failed to download plugin from URL: ${downloadError instanceof Error ? downloadError.message : String(downloadError)}`);
      }
      // --- End URL Download ---

    } else if (uploadedFile) {
      console.log(`Install requested from file: ${uploadedFile.originalFilename}`);
      // Formidable already saved the uploaded file to a temporary path
      packagePath = uploadedFile.filepath;
    } else {
        // This case should not be reachable due to the initial check
        throw new Error("Could not determine plugin source.");
    }

    // --- Extract Manifest from Package ---
    if (!packagePath) {
       throw new Error("Package path is not set."); // Should not happen
    }
    console.log(`Extracting manifest from: ${packagePath}`);
    try {
       extractedManifest = await readManifestFromPackage(packagePath);
       console.log(`Extracted manifest for plugin ID: ${extractedManifest.id}`);
    } catch (extractError) {
        throw new Error(`Failed to extract or parse manifest: ${extractError instanceof Error ? extractError.message : String(extractError)}`);
    }
    // --- End Manifest Extraction ---

    // --- Install via Registry ---
    const registry = getRegistryInstance();
    console.log(`Calling registry.installPlugin for ${extractedManifest.id} with package at ${packagePath}`);

    // Pass the *extracted* manifest for validation and the *original package path*
    const installedEntry = await registry.installPlugin(extractedManifest, packagePath);

    console.log(`Plugin ${installedEntry.id} installed successfully.`);
    res.status(200).json(installedEntry);

  } catch (error) {
    console.error('Plugin installation API failed:', error);
    res.status(500).json({ error: `Installation failed: ${error instanceof Error ? error.message : String(error)}` });
  } finally {
    // --- Clean up Temporary Directory and downloaded file ---
    if (tempDir) {
      fs.rm(tempDir, { recursive: true, force: true }).catch(err => {
        console.error(`Failed to clean up temp directory ${tempDir}:`, err);
      });
    }
    // If we downloaded the file manually (not using formidable's tmp path), delete it
    // Note: Formidable usually cleans its own tmp files unless moved.
    // If packagePath === downloadedFilePath, it means we created it.
    if (downloadedFilePath && packagePath === downloadedFilePath) {
        // No need to delete explicitly as it's inside tempDir which is deleted above.
    }
  }
} 