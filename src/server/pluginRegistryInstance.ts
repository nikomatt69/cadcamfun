// src/server/pluginRegistryInstance.ts
// NOTE: This is a basic singleton for server-side use.
// In a real app, consider dependency injection or a more robust pattern.
import { PluginRegistry, PluginStorage, FileSystemPluginStorage } from '@/src/plugins/core/registry';

let registryInstance: PluginRegistry | null = null;

export function getRegistryInstance(): PluginRegistry {
  if (!registryInstance) {
    // Use FileSystem storage on the server
    // Ensure the necessary classes are imported from the correct path
    const storage = new PluginStorage(new FileSystemPluginStorage());
    registryInstance = new PluginRegistry(storage);
    console.log("Server-side PluginRegistry initialized.");
  }
  return registryInstance;
} 