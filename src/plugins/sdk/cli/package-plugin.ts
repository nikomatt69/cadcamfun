/**
 * Plugin Packaging Utility
 * 
 * Creates a distributable package for a plugin, including all necessary files
 * and validating the package contents.
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import chalk from 'chalk';
import * as AdmZip from 'adm-zip';
import { validateManifest } from '../validation/plugin-schema-validator';

/**
 * Package a plugin for distribution
 * 
 * @param pluginDir The directory containing the plugin
 * @param outputFile Optional output file name
 * @returns Path to the created package file
 */
export async function packagePlugin(pluginDir: string, outputFile?: string): Promise<string> {
  try {
    console.log(chalk.blue('📦 Packaging plugin...'));
    
    // Read the plugin manifest
    const manifestPath = path.join(pluginDir, 'plugin.json');
    let manifest;
    
    try {
      const manifestContent = await fs.readFile(manifestPath, 'utf-8');
      manifest = JSON.parse(manifestContent);
    } catch (error) {
      throw new Error(`Failed to read plugin.json: ${error}`);
    }
    
    // Validate the manifest
    const validationResult = validateManifest(manifest);
    if (!validationResult.valid) {
      throw new Error(`Invalid plugin.json: ${validationResult.errors?.join(', ')}`);
    }
    
    // Check if dist directory exists
    const distDir = path.join(pluginDir, 'dist');
    try {
      await fs.access(distDir);
    } catch (error) {
      throw new Error('Dist directory not found. Build the plugin first with "cadcam-plugin build"');
    }
    
    // Create a default output file name if not provided
    if (!outputFile) {
      outputFile = path.join(pluginDir, `${manifest.id.replace(/\./g, '-')}-${manifest.version}.zip`);
    }
    
    // Create the package
    await createPackage(pluginDir, outputFile, manifest);
    
    // Verify the package
    await verifyPackage(outputFile, manifest);
    
    return outputFile;
  } catch (error) {
    console.error(chalk.red('Error packaging plugin:'), error);
    throw error;
  }
}

/**
 * Create a plugin package
 * 
 * @param pluginDir The directory containing the plugin
 * @param outputFile The output file path
 * @param manifest The plugin manifest
 */
async function createPackage(
  pluginDir: string,
  outputFile: string,
  manifest: any
): Promise<void> {
  // Create a new zip file
  const zip = new AdmZip.default();
  
  // Add the manifest
  zip.addLocalFile(path.join(pluginDir, 'plugin.json'));
  
  // Add the dist directory
  await addDirectoryToZip(zip, path.join(pluginDir, 'dist'), '');
  
  // Add additional files if they exist
  const filesToAdd = [
    'README.md',
    'LICENSE',
    'CHANGELOG.md'
  ];
  
  for (const file of filesToAdd) {
    try {
      await fs.access(path.join(pluginDir, file));
      zip.addLocalFile(path.join(pluginDir, file));
    } catch (error) {
      // File doesn't exist, skip it
    }
  }
  
  // Add the assets directory if it exists
  try {
    await fs.access(path.join(pluginDir, 'assets'));
    await addDirectoryToZip(zip, path.join(pluginDir, 'assets'), 'assets');
  } catch (error) {
    // Assets directory doesn't exist, skip it
  }
  
  // Generate the package metadata
  const metadata = {
    id: manifest.id,
    version: manifest.version,
    name: manifest.name,
    description: manifest.description,
    author: manifest.author,
    license: manifest.license,
    createdAt: new Date().toISOString(),
    checksum: '',
    files: [] as string[]
  };
  
  // Get entries from the zip
  const entries = zip.getEntries();
  
  // Add file list to metadata
  for (const entry of entries) {
    metadata.files.push(entry.name);
  }
  
  // Add metadata.json to the package
  zip.addFile('metadata.json', Buffer.from(JSON.stringify(metadata, null, 2)));
  
  // Calculate checksum
  const zipBuffer = zip.toBuffer();
  const checksum = crypto.createHash('sha256').update(zipBuffer).digest('hex');
  
  // Update metadata with checksum
  metadata.checksum = checksum;
  zip.updateFile('metadata.json', Buffer.from(JSON.stringify(metadata, null, 2)));
  
  // Write the zip file
  zip.writeZip(outputFile);
  
  console.log(chalk.green(`✅ Plugin packaged successfully: ${outputFile}`));
  console.log(chalk.blue(`📊 Package size: ${formatBytes(zipBuffer.length)}`));
  console.log(chalk.blue(`🔐 Checksum (SHA-256): ${checksum}`));
}

/**
 * Add a directory to a zip file recursively
 * 
 * @param zip The AdmZip instance
 * @param directory The directory to add
 * @param zipPath The path within the zip file
 */
async function addDirectoryToZip(
  zip: AdmZip,
  directory: string,
  zipPath: string
): Promise<void> {
  // Get all entries in the directory
  const entries = await fs.readdir(directory, { withFileTypes: true });
  
  // Process each entry
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    const entryZipPath = zipPath ? path.join(zipPath, entry.name) : entry.name;
    
    if (entry.isDirectory()) {
      // Add directory recursively
      await addDirectoryToZip(zip, entryPath, entryZipPath);
    } else {
      // Add file
      zip.addLocalFile(entryPath, path.dirname(entryZipPath));
    }
  }
}

/**
 * Verify a plugin package
 * 
 * @param packageFile The package file path
 * @param expectedManifest The expected plugin manifest
 */
async function verifyPackage(packageFile: string, expectedManifest: any): Promise<void> {
  // Open the package
  const zip = new AdmZip.default(packageFile);
  
  // Check for required files
  const requiredFiles = [
    'plugin.json',
    'metadata.json'
  ];
  
  // Get main entry point from manifest
  if (expectedManifest.main) {
    requiredFiles.push(expectedManifest.main);
  }
  
  // Check for sidebar entry point
  if (expectedManifest.contributes?.sidebar?.entry) {
    requiredFiles.push(expectedManifest.contributes.sidebar.entry);
  }
  
  // Verify required files
  for (const file of requiredFiles) {
    const entry = zip.getEntry(file);
    if (!entry) {
      throw new Error(`Required file not found in package: ${file}`);
    }
  }
  
  // Extract and verify the manifest
  const manifestEntry = zip.getEntry('plugin.json');
  if (!manifestEntry) {
    throw new Error('plugin.json not found in package');
  }
  
  const manifestContent = manifestEntry.getData().toString('utf-8');
  let manifest;
  
  try {
    manifest = JSON.parse(manifestContent);
  } catch (error) {
    throw new Error(`Invalid plugin.json: ${error}`);
  }
  
  // Validate the manifest
  const validationResult = validateManifest(manifest);
  if (!validationResult.valid) {
    throw new Error(`Invalid plugin.json: ${validationResult.errors?.join(', ')}`);
  }
  
  // Verify the manifest matches the expected values
  if (manifest.id !== expectedManifest.id) {
    throw new Error(`Manifest ID mismatch: ${manifest.id} !== ${expectedManifest.id}`);
  }
  
  if (manifest.version !== expectedManifest.version) {
    throw new Error(`Manifest version mismatch: ${manifest.version} !== ${expectedManifest.version}`);
  }
  
  // Verify the checksum in metadata
  const metadataEntry = zip.getEntry('metadata.json');
  if (!metadataEntry) {
    throw new Error('metadata.json not found in package');
  }
  
  const metadataContent = metadataEntry.getData().toString('utf-8');
  let metadata;
  
  try {
    metadata = JSON.parse(metadataContent);
  } catch (error) {
    throw new Error(`Invalid metadata.json: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  // Remove the metadata.json entry to calculate the checksum
  zip.deleteFile('metadata.json');
  
  // Calculate checksum
  const zipBuffer = zip.toBuffer();
  const calculatedChecksum = crypto.createHash('sha256').update(zipBuffer).digest('hex');
  
  // Restore metadata.json
  zip.addFile('metadata.json', Buffer.from(metadataContent));
  
  // Verify the checksum
  if (metadata.checksum !== calculatedChecksum) {
    throw new Error(`Checksum mismatch: ${metadata.checksum} !== ${calculatedChecksum}`);
  }
  
  console.log(chalk.green('✅ Package verification successful'));
}

/**
 * Format bytes into a human-readable string
 * 
 * @param bytes Number of bytes
 * @returns Human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  
  return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(2))} ${sizes[i]}`;
}