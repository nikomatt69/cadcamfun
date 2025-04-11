import { useState, useEffect, useCallback } from 'react';
import { PluginRegistry, PluginRegistryEvent, PluginManifest } from '../plugins/core/registry';
import { PluginRegistryEntry } from '../plugins/core/registry';

// Singleton instance of the registry
let globalRegistry: PluginRegistry | null = null;

/**
 * Initialize the global plugin registry
 */
export function initializePluginRegistry(registry: PluginRegistry) {
  globalRegistry = registry;
}

/**
 * Get the global plugin registry
 */
export function getPluginRegistry(): PluginRegistry | null {
  return globalRegistry;
}

/**
 * Hook to access the plugin registry from React components
 */
export function usePluginRegistry() {
  const [plugins, setPlugins] = useState<PluginRegistryEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  // Force a refresh of the plugin list
  const refreshPlugins = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  // Load plugins from registry
  useEffect(() => {
    if (!globalRegistry) {
      setError(new Error('Plugin registry not initialized'));
      setLoading(false);
      return;
    }

    const loadPlugins = async () => {
      try {
        setLoading(true);
        const allPlugins = globalRegistry?.getAllPlugins();
        setPlugins(allPlugins || []);
        setError(null);
      } catch (e) {
        console.error('Failed to load plugins:', e);
        setError(e as Error);
      } finally {
        setLoading(false);
      }
    };

    loadPlugins();

    // Set up event listeners for registry updates
    const handleRegistryUpdate = () => {
      loadPlugins();
    };

    globalRegistry.on(PluginRegistryEvent.REGISTRY_UPDATED, handleRegistryUpdate);
    globalRegistry.on(PluginRegistryEvent.PLUGIN_INSTALLED, handleRegistryUpdate);
    globalRegistry.on(PluginRegistryEvent.PLUGIN_UNINSTALLED, handleRegistryUpdate);
    globalRegistry.on(PluginRegistryEvent.PLUGIN_UPDATED, handleRegistryUpdate);

    return () => {
      if (globalRegistry) {
        globalRegistry.removeListener(PluginRegistryEvent.REGISTRY_UPDATED, handleRegistryUpdate);
        globalRegistry.removeListener(PluginRegistryEvent.PLUGIN_INSTALLED, handleRegistryUpdate);
        globalRegistry.removeListener(PluginRegistryEvent.PLUGIN_UNINSTALLED, handleRegistryUpdate);
        globalRegistry.removeListener(PluginRegistryEvent.PLUGIN_UPDATED, handleRegistryUpdate);
      }
    };
  }, [refreshTrigger]);

  // Install a new plugin - handles fetching/reading and passing to registry
  const installPlugin = useCallback(async (source: File | string, type: 'file' | 'url') => {
    if (!globalRegistry) {
      throw new Error('Plugin registry not initialized');
    }

    try {
      let manifest: PluginManifest;
      let packagePath: string;

      if (type === 'file' && source instanceof File) {
         console.log(`Processing uploaded file: ${source.name}`);
         // TODO: Upload file, unzip, read manifest, get original/temp path
         // manifest = { ... }; // Removed placeholder
         // packagePath = ...; // Removed placeholder
         throw new Error("File installation not yet implemented in hook."); // Added throw
      } else if (type === 'url' && typeof source === 'string') {
         console.log(`Processing URL: ${source}`);
         // TODO: Fetch URL, save temporarily, unzip, read manifest, get temp path
         // manifest = { ... }; // Removed placeholder
         // packagePath = ...; // Removed placeholder
         throw new Error("URL installation not yet implemented in hook."); // Added throw
      } else {
          throw new Error('Invalid source or type provided.');
      }
      // === End Placeholder ===

      // Call the registry's install method (Will not be reached with current placeholders)
      // const result = await globalRegistry.installPlugin(manifest, packagePath);
      // return result;
    } catch (e) {
      console.error('Failed to install plugin:', e);
      throw e;
    }
  }, []);

  // Uninstall a plugin
  const uninstallPlugin = useCallback(async (pluginId: string) => {
    if (!globalRegistry) {
      throw new Error('Plugin registry not initialized');
    }

    try {
      await globalRegistry.uninstallPlugin(pluginId);
    } catch (e) {
      console.error(`Failed to uninstall plugin ${pluginId}:`, e);
      throw e;
    }
  }, []);

  // Enable a plugin
  const enablePlugin = useCallback(async (pluginId: string) => {
    if (!globalRegistry) {
      throw new Error('Plugin registry not initialized');
    }

    try {
      await globalRegistry.enablePlugin(pluginId);
    } catch (e) {
      console.error(`Failed to enable plugin ${pluginId}:`, e);
      throw e;
    }
  }, []);

  // Disable a plugin
  const disablePlugin = useCallback(async (pluginId: string) => {
    if (!globalRegistry) {
      throw new Error('Plugin registry not initialized');
    }

    try {
      await globalRegistry.disablePlugin(pluginId);
    } catch (e) {
      console.error(`Failed to disable plugin ${pluginId}:`, e);
      throw e;
    }
  }, []);

  // Update a plugin
  const updatePlugin = useCallback(async (pluginId: string, newManifest: PluginManifest, packagePath: string) => {
    if (!globalRegistry) {
      throw new Error('Plugin registry not initialized');
    }

    try {
      const result = await globalRegistry.updatePlugin(pluginId, newManifest, packagePath);
      return result;
    } catch (e) {
      console.error(`Failed to update plugin ${pluginId}:`, e);
      throw e;
    }
  }, []);

  return {
    plugins,
    loading,
    error,
    refreshPlugins,
    installPlugin,
    uninstallPlugin,
    enablePlugin,
    disablePlugin,
    updatePlugin,
    registry: globalRegistry,
  };
}