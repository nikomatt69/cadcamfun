/**
 * SDK Utilities
 * 
 * Provides common utility functions for the CAD/CAM FUN Plugin SDK.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync } from 'child_process';

/**
 * Get the API version from the package.json
 * 
 * @returns The API version string
 */
export function getApiVersion(): string {
  try {
    // Try to read the package.json from the SDK
    const packageJson = require('../package.json');
    return packageJson.version || '1.0.0';
  } catch (error) {
    // Fallback version
    return '1.0.0';
  }
}

/**
 * Check if a specific npm package is installed globally
 * 
 * @param packageName The package name to check
 * @returns Whether the package is installed globally
 */
export function isPackageInstalledGlobally(packageName: string): boolean {
  try {
    const output = execSync(`npm list -g ${packageName} --depth=0`).toString();
    return output.includes(packageName);
  } catch (error) {
    return false;
  }
}

/**
 * Check if a directory is a valid plugin project
 * 
 * @param directory The directory to check
 * @returns Whether the directory is a valid plugin project
 */
export async function isPluginProject(directory: string): Promise<boolean> {
  try {
    // Check if plugin.json exists
    await fs.access(path.join(directory, 'plugin.json'));
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Generate a random plugin ID
 * 
 * @param prefix Optional prefix for the ID
 * @returns A random plugin ID
 */
export function generateRandomPluginId(prefix: string = 'com.example'): string {
  const randomId = Math.random().toString(36).substring(2, 10);
  return `${prefix}.plugin-${randomId}`;
}

/**
 * Sanitize a string for use in a plugin ID
 * 
 * @param input The input string
 * @returns The sanitized string
 */
export function sanitizeForPluginId(input: string): string {
  // Remove invalid characters and convert to lowercase
  let sanitized = input
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  
  // Ensure it has at least one dot for namespace
  if (!sanitized.includes('.')) {
    sanitized = `com.example.${sanitized}`;
  }
  
  return sanitized;
}

/**
 * Generate a human-readable name from a plugin ID
 * 
 * @param pluginId The plugin ID
 * @returns A human-readable name
 */
export function nameFromPluginId(pluginId: string): string {
  // Extract the last part of the ID
  const parts = pluginId.split('.');
  const lastName = parts[parts.length - 1] || pluginId;
  
  // Convert to title case and replace hyphens with spaces
  return lastName
    .replace(/-/g, ' ')
    .replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase());
}

/**
 * Check for updates to the SDK
 * 
 * @returns Information about available updates
 */
export async function checkForUpdates(): Promise<{
  available: boolean;
  currentVersion: string;
  latestVersion: string;
}> {
  try {
    const currentVersion = getApiVersion();
    const output = execSync('npm view cadcam-plugin-sdk version').toString().trim();
    
    return {
      available: output !== currentVersion,
      currentVersion,
      latestVersion: output
    };
  } catch (error) {
    return {
      available: false,
      currentVersion: getApiVersion(),
      latestVersion: getApiVersion()
    };
  }
}

/**
 * Run a specific scaffold script for a template
 * 
 * @param directory The target directory
 * @param template The template name
 * @returns Whether the script was successful
 */
export async function runTemplateScaffold(
  directory: string,
  template: string
): Promise<boolean> {
  try {
    const scaffoldPath = path.join(__dirname, '../templates', template, 'scaffold.js');
    
    // Check if the scaffold script exists
    try {
      await fs.access(scaffoldPath);
    } catch (error) {
      // No scaffold script, that's fine
      return false;
    }
    
    // Execute the scaffold script
    const { scaffold } = require(scaffoldPath);
    await scaffold(directory);
    
    return true;
  } catch (error) {
    console.error('Failed to run template scaffold:', error);
    return false;
  }
}