import React, { createContext, useState, useEffect, useContext, ReactNode, useMemo, useCallback, useRef } from 'react';

// --- Core Plugin Types (Adjust paths as needed) ---
import { IPluginHost } from '../plugins/core/host/pluginHost';
// Remove direct host imports, rely on factory
// import { IFramePluginHost } from '../plugins/core/host/iframeHost';
// import { WorkerPluginHost } from '../plugins/core/host/workerHost';
import { PluginRegistryEntry } from '../plugins/core/registry/pluginRegistry';
import { SandboxOptions } from '../plugins/core/host/sandbox';
import { PluginManifest } from '../plugins/core/registry/pluginManifest';
import { PluginState } from '../plugins/core/registry/pluginTypes';
import { createPluginHost } from '../plugins/core/host/hostFactory'; // Ensure factory is imported

// Define the shape of the context value
interface PluginClientContextValue {
  plugins: PluginRegistryEntry[]; // List of all plugins from API
  activeHosts: Map<string, IPluginHost>; // Map of live client-side hosts
  loading: boolean;
  error: string | null;
  getHost: (pluginId: string) => IPluginHost | undefined;
  activatePlugin: (pluginId: string) => Promise<IPluginHost | null>; // Return host or null
  deactivatePlugin: (pluginId: string) => Promise<void>;
  executeCommand: (pluginId: string, commandId: string, args?: any) => Promise<any>;
  refreshPlugins: () => Promise<void>; 
}

// Create the context with a default value
const PluginClientContext = createContext<PluginClientContextValue | undefined>(undefined);

// Props for the Provider
interface PluginClientProviderProps {
  children: ReactNode;
}

// --- Default Sandbox Options (Define or import from a config file) ---
const defaultSandboxOptions: SandboxOptions = {
    csp: { 
        scriptSrc: ["'self'"], 
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"], // Example
        imgSrc: ["'self'", "https:", "data:"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        connectSrc: ["'self'", "https://*"],
        frameSrc: ["'none'"], // Example: Disallow framing by default
    },
    allowEval: false,
    allowParentAccess: false, 
};
// --- --- 

export const PluginClientProvider: React.FC<PluginClientProviderProps> = ({ children }) => {
  const [plugins, setPlugins] = useState<PluginRegistryEntry[]>([]);
  // Use a ref for managing hosts to simplify state updates
  const activeHostsRef = useRef<Map<string, IPluginHost>>(new Map());
  // State to trigger re-renders when hosts change
  const [hostMapVersion, setHostMapVersion] = useState(0); 
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Function to fetch plugins from API
  const fetchPlugins = useCallback(async (): Promise<void> => {
    console.log("[Client] Fetching plugins...");
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/plugins');
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to fetch plugins: ${res.statusText}`);
      }
      const data: PluginRegistryEntry[] = await res.json();
      console.log(`[Client] Fetched ${data.length} plugins.`);
      setPlugins(data);
    } catch (err) {
      console.error("[Client] PluginClientProvider fetch error:", err);
      setError(err instanceof Error ? err.message : String(err));
      setPlugins([]); // Clear plugins on error
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchPlugins();
  }, [fetchPlugins]);

  // *** REMOVED complex useEffect for automatic host synchronization ***
  // Host activation/deactivation is now handled explicitly via activatePlugin/deactivatePlugin

  // Function to get a specific host
  const getHost = useCallback((pluginId: string): IPluginHost | undefined => {
    return activeHostsRef.current.get(pluginId);
  }, []);

  const activatePlugin = useCallback(async (pluginId: string): Promise<IPluginHost | null> => {
    if (activeHostsRef.current.has(pluginId)) {
      console.warn(`[Client] Host for ${pluginId} already exists.`);
      return activeHostsRef.current.get(pluginId)!;
    }

    const plugin = plugins.find(p => p.id === pluginId);
    if (!plugin) {
        console.error(`[Client] Cannot activate: Plugin ${pluginId} not found in registry list.`);
        return null;
    }
    // Ensure the plugin is marked as enabled in the fetched data
    if (!plugin.enabled) { 
        console.warn(`[Client] Cannot activate: Plugin ${pluginId} is not enabled.`);
        // Optionally call the enable API endpoint first?
        // Or rely on the UI to call enable first, then activate.
        return null;
    }

    console.log(`[Client] Activating plugin: ${pluginId}`);
    let host: IPluginHost | null = null; // Initialize host variable
    try {
      const manifest = plugin.manifest;

      // --- Use the factory function --- 
      console.log(`[Client] Creating host for ${pluginId} using factory...`);
      host = createPluginHost(manifest, defaultSandboxOptions);
      if (!host) {
           throw new Error('Plugin host creation failed (factory returned null).');
      }
      // --------------------------------

      activeHostsRef.current.set(pluginId, host);
      setHostMapVersion(v => v + 1); // Trigger re-render
      console.log(`[Client] Host instance created for ${pluginId}. Loading...`);
      
      await host.load();
      console.log(`[Client] Host loaded for ${pluginId}. Activating...`);
      
      await host.activate();
      console.log(`[Client] Host activated successfully for ${pluginId}`);
      
      // Update host state in map if needed (though activation should handle internal state)
      // No need to call setActiveHosts - the ref update + version bump handles it.

      return host; // Return the activated host

    } catch (err) {
      console.error(`[Client] Failed to activate plugin ${pluginId}:`, err);
      // Clean up if activation failed
      if (activeHostsRef.current.has(pluginId)) {
        const failedHost = activeHostsRef.current.get(pluginId);
        activeHostsRef.current.delete(pluginId);
        setHostMapVersion(v => v + 1); // Trigger re-render
        // Attempt to unload the failed host
        if (failedHost) {
            failedHost.unload().catch(unloadErr => { // Unload async
                 console.error(`[Client] Error during cleanup unload for failed activation of ${pluginId}:`, unloadErr);
            });
        }
      }
      // Do not re-throw, return null to indicate failure
      return null; 
    }
  }, [plugins]); // Depends on the current list of plugins

  const deactivatePlugin = useCallback(async (pluginId: string): Promise<void> => {
    const host = activeHostsRef.current.get(pluginId);
    if (!host) {
      console.warn(`[Client] Cannot deactivate plugin ${pluginId}: Host not found.`);
      return;
    }
    console.log(`[Client] Deactivating plugin: ${pluginId}`);
    try {
      // Perform deactivation and unloading
      await host.deactivate();
      await host.unload();
      
      // Remove from the map *after* successful unload
      activeHostsRef.current.delete(pluginId);
      setHostMapVersion(v => v + 1); // Trigger re-render
      console.log(`[Client] Plugin ${pluginId} deactivated and host unloaded.`);
    } catch (err) {
      console.error(`[Client] Failed to deactivate/unload plugin ${pluginId}:`, err);
      // Even on error, remove it from the active list?
      if (activeHostsRef.current.has(pluginId)) {
           activeHostsRef.current.delete(pluginId);
           setHostMapVersion(v => v + 1);
      }
      // Do not re-throw, let caller handle UI feedback if needed
    }
  }, []);

  const executeCommand = useCallback(async (pluginId: string, commandId: string, args?: any): Promise<any> => {
    const host = activeHostsRef.current.get(pluginId);
    if (!host) {
      throw new Error(`Cannot execute command: Plugin ${pluginId} host not found.`);
    }
    // Add check for host state if needed (e.g., only if ACTIVATED)
    // if (host.getState() !== PluginState.ACTIVATED) { ... }
    
    try {
      const bridge = host.getBridge();
      console.log(`[Client] Executing command '${commandId}' on plugin ${pluginId}`);
      // Ensure bridge and call method exist
      if (bridge && typeof bridge.call === 'function') {
          return await bridge.call('commands.execute', { commandId, args });
      } else {
          throw new Error('Host bridge or call method is not available.');
      }
    } catch (err) {
      console.error(`[Client] Error executing command ${commandId} on plugin ${pluginId}:`, err);
      throw err;
    }
  }, []);

  const refreshPlugins = fetchPlugins;

  // Use the ref directly for providing the map, driven by version state
  const activeHostsMap = useMemo(() => new Map(activeHostsRef.current), [hostMapVersion]);

  // Memoize the context value
  const contextValue = useMemo(() => ({
    plugins,
    activeHosts: activeHostsMap, // Provide the memoized map
    loading,
    error,
    getHost,
    activatePlugin,
    deactivatePlugin,
    executeCommand,
    refreshPlugins,
  }), [plugins, activeHostsMap, loading, error, getHost, activatePlugin, deactivatePlugin, executeCommand, refreshPlugins]);

  return (
    <PluginClientContext.Provider value={contextValue}>
      {children}
    </PluginClientContext.Provider>
  );
};

// Custom hook for easy context consumption
export const usePluginClient = (): PluginClientContextValue => {
  const context = useContext(PluginClientContext);
  if (context === undefined) {
    throw new Error('usePluginClient must be used within a PluginClientProvider');
  }
  return context;
}; 