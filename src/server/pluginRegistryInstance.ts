// src/server/pluginRegistryInstance.ts
// NOTE: This is a basic singleton for server-side use.
// In a real app, consider dependency injection or a more robust pattern.
import { PluginRegistry } from '@/src/plugins/core/registry';
import { PluginStorage } from '@/src/plugins/core/registry/pluginStorage';
// Import the specific provider needed for the server
import { DatabasePluginStorage } from '@/src/server/storage/DatabasePluginStorage';
import { PluginLifecycle } from '@/src/plugins/core/registry/pluginLifecycle';

let registryInstance: PluginRegistry | null = null;

export function getRegistryInstance(): PluginRegistry {
  if (!registryInstance) {
    console.log("[RegistryInstance] Creating server-side PluginRegistry instance...");
    // Explicitly create and pass the DatabasePluginStorage provider
    const storageProvider = new DatabasePluginStorage();
    const storage = new PluginStorage(storageProvider); 
    registryInstance = new PluginRegistry(storage);
    
    // Crea il Lifecycle (passando il registry appena creato)
    const lifecycle = new PluginLifecycle(registryInstance as any); // Cast temporaneo se il tipo completo dà problemi
    
    // Inietta il Lifecycle nel Registry
    registryInstance.setLifecycle(lifecycle);

    console.log("[RegistryInstance] PluginRegistry instance created and lifecycle injected.");
  }
  return registryInstance;
} 