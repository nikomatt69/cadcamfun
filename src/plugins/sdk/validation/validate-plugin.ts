/**
 * Plugin Validation Utility
 * 
 * Validates a plugin project or package for compliance with the CAD/CAM FUN
 * plugin specification.
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import AdmZip from 'adm-zip';
import { validateManifest } from '../validation/plugin-schema-validator';

/**
 * Validation options
 */
export interface ValidateOptions {
  /** Plugin directory */
  directory?: string;
  
  /** Plugin package file */
  file?: string;
}

/**
 * Validation result
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;
  
  /** Validation errors */
  errors?: string[];
  
  /** Validated manifest */
  manifest?: any;
}

/**
 * Validate a plugin project or package
 * 
 * @param options Validation options
 * @returns Validation result
 */
export async function validatePlugin(options: ValidateOptions): Promise<ValidationResult> {
  try {
    if (options.file) {
      // Validate a plugin package file
      return await validatePluginPackage(options.file);
    } else if (options.directory) {
      // Validate a plugin project directory
      return await validatePluginDirectory(options.directory);
    } else {
      throw new Error('Either directory or file must be specified');
    }
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : String(error)]
    };
  }
}

/**
 * Validate a plugin project directory
 * 
 * @param directory The plugin directory
 * @returns Validation result
 */
async function validatePluginDirectory(directory: string): Promise<ValidationResult> {
  const errors: string[] = [];
  
  // Check if plugin.json exists
  const manifestPath = path.join(directory, 'plugin.json');
  let manifest;
  
  try {
    const manifestContent = await fs.readFile(manifestPath, 'utf-8');
    manifest = JSON.parse(manifestContent);
  } catch (error) {
    errors.push(`Failed to read plugin.json: ${error}`);
    return { valid: false, errors };
  }
  
  // Validate the manifest
  const validationResult = validateManifest(manifest);
  if (!validationResult.valid) {
    errors.push(...(validationResult.errors || []));
  }
  
  // Check if the main file exists
  if (manifest.main) {
    try {
      const mainPath = path.join(directory, manifest.main);
      await fs.access(mainPath);
    } catch (error) {
      errors.push(`Main file ${manifest.main} not found`);
    }
  } else {
    errors.push('No main file specified in plugin.json');
  }
  
  // Check if other required files exist
  if (manifest.contributes?.sidebar?.entry) {
    try {
      const sidebarPath = path.join(directory, manifest.contributes.sidebar.entry);
      await fs.access(sidebarPath);
    } catch (error) {
      errors.push(`Sidebar entry file ${manifest.contributes.sidebar.entry} not found`);
    }
  }
  
  // Check for package.json
  try {
    const packagePath = path.join(directory, 'package.json');
    await fs.access(packagePath);
  } catch (error) {
    errors.push('No package.json found');
  }
  
  // Check for README.md
  try {
    const readmePath = path.join(directory, 'README.md');
    await fs.access(readmePath);
  } catch (error) {
    errors.push('No README.md found (recommended)');
  }
  
  // Check if dist directory exists
  try {
    const distPath = path.join(directory, 'dist');
    await fs.access(distPath);
  } catch (error) {
    errors.push('No dist directory found. Build the plugin with "cadcam-plugin build"');
  }
  
  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
    manifest
  };
}

/**
 * Validate a plugin package file
 * 
 * @param file The package file path
 * @returns Validation result
 */
async function validatePluginPackage(file: string): Promise<ValidationResult> {
  const errors: string[] = [];
  
  // Check if the file exists
  try {
    await fs.access(file);
  } catch (error) {
    errors.push(`Package file ${file} not found`);
    return { valid: false, errors };
  }
  
  // Open the package
  let zip: AdmZip;
  try {
    zip = new AdmZip(file);
  } catch (error) {
    errors.push(`Failed to open package file: ${error}`);
    return { valid: false, errors };
  }
  
  // Check for required files
  const requiredFiles = [
    'plugin.json',
    'metadata.json'
  ];
  
  for (const requiredFile of requiredFiles) {
    const entry = zip.getEntry(requiredFile);
    if (!entry) {
      errors.push(`Required file not found in package: ${requiredFile}`);
    }
  }
  
  // If one of the required files is missing, return early
  if (errors.length > 0) {
    return { valid: false, errors };
  }
  
  // Extract and validate the manifest
  const manifestEntry = zip.getEntry('plugin.json');
  let manifest;
  if (!manifestEntry) {
    errors.push(`plugin.json entry not found in package`);
    return { valid: false, errors };
  }
  try {
    const manifestContent = manifestEntry.getData().toString('utf-8');
    manifest = JSON.parse(manifestContent);
  } catch (error) {
    errors.push(`Failed to parse plugin.json: ${error}`);
    return { valid: false, errors };
  
  }
  
  // Validate the manifest
  const validationResult = validateManifest(manifest);
  if (!validationResult.valid) {
    errors.push(...(validationResult.errors || []));
  }
  
  // Check if the main file exists in the package
  if (manifest.main) {
    const mainEntry = zip.getEntry(manifest.main);
    if (!mainEntry) {
      errors.push(`Main file ${manifest.main} not found in package`);
    }
  } else {
    errors.push('No main file specified in plugin.json');
  }
  
  // Check if other required files exist in the package
  if (manifest.contributes?.sidebar?.entry) {
    const sidebarEntry = zip.getEntry(manifest.contributes.sidebar.entry);
    if (!sidebarEntry) {
      errors.push(`Sidebar entry file ${manifest.contributes.sidebar.entry} not found in package`);
    }
  }
  
  // Extract and validate the metadata
  const metadataEntry = zip.getEntry('metadata.json');
  let metadata;
  
  if (!metadataEntry) {
    errors.push('metadata.json entry not found in package');
    return { valid: false, errors };
  }
  try {
    const metadataContent = metadataEntry.getData().toString('utf-8');
    metadata = JSON.parse(metadataContent);
  } catch (error) {
    errors.push(`Failed to parse metadata.json: ${error}`);
    return { valid: false, errors };
  }
  
  // Check metadata for required fields
  const requiredMetadataFields = ['id', 'version', 'name', 'checksum'];
  for (const field of requiredMetadataFields) {
    if (!metadata[field]) {
      errors.push(`Required field '${field}' missing in metadata.json`);
    }
  }
  
  // Verify the checksum
  if (metadata.checksum) {
    // Remove the metadata.json entry to calculate the checksum
    zip.deleteFile('metadata.json');
    
    // Calculate checksum
    const zipBuffer = zip.toBuffer();
    const crypto = require('crypto');
    const calculatedChecksum = crypto.createHash('sha256').update(zipBuffer).digest('hex');
    
    // Restore metadata.json
    zip.addFile('metadata.json', Buffer.from(JSON.stringify(metadata, null, 2)));
    
    // Verify the checksum
    if (metadata.checksum !== calculatedChecksum) {
      errors.push(`Checksum mismatch: ${metadata.checksum} !== ${calculatedChecksum}`);
    }
  }
  
  // Check if the metadata matches the manifest
  if (metadata.id !== manifest.id) {
    errors.push(`Metadata ID (${metadata.id}) doesn't match manifest ID (${manifest.id})`);
  }
  
  if (metadata.version !== manifest.version) {
    errors.push(`Metadata version (${metadata.version}) doesn't match manifest version (${manifest.version})`);
  }
  
  if (metadata.name !== manifest.name) {
    errors.push(`Metadata name (${metadata.name}) doesn't match manifest name (${manifest.name})`);
  }
  
  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
    manifest
  };
}

