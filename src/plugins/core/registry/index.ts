/**
 * Plugin Registry System - Primary Export
 * Centralizes exports for the plugin registry system
 */

import { PluginRegistry } from './pluginRegistry';
import { PluginStorage } from './pluginStorage';

// Main Components
export { PluginRegistry, PluginRegistryEvent, type PluginRegistryEntry } from './pluginRegistry';
export { validateManifest, hasPermission, createDefaultManifest, type PluginManifest, PluginPermission } from './pluginManifest';
export { PluginLifecycle, PluginState } from './pluginLifecycle';
export { PluginStorage, FileSystemPluginStorage, InMemoryPluginStorage, type PluginStorageProvider } from './pluginStorage';

/**
 * Create and initialize a new plugin registry with default configuration
 */
export function createPluginRegistry() {
  const storage = new PluginStorage();
  const registry = new PluginRegistry(storage);
  return registry;
}