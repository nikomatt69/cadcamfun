/**
 * Plugin Registry System - Primary Export
 * Centralizes exports for the plugin registry system
 */

// Main Components
export { PluginRegistry, PluginRegistryEvent, type PluginRegistryEntry } from './pluginRegistry';
export { validateManifest, hasPermission, createDefaultManifest, type PluginManifest, PluginPermission } from './pluginManifest';
// export { PluginLifecycle } from './pluginLifecycle';
// Export only the main class and the provider type from pluginStorage
export { PluginStorage, type PluginStorageProvider } from './pluginStorage';
export { PluginState } from './pluginTypes';

// Removed the createPluginRegistry helper function as its default behavior is ambiguous
// Server/client instances should be created with explicit storage providers.