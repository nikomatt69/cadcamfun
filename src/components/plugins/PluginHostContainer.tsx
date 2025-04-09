// src/components/plugins/PluginHostContainer.tsx
import React, { useState, useEffect, useRef } from 'react';
import { usePluginRegistry } from '../../hooks/usePluginRegistry';
import { Loader, AlertTriangle } from 'react-feather';
import { IFramePluginHost } from '../../plugins/core/host/iframeHost';

interface PluginHostContainerProps {
  pluginId: string;
  entryPoint: 'sidebar' | 'panel' | 'modal' | string;
  onMessage?: (message: any) => void;
  className?: string;
}

const PluginHostContainer: React.FC<PluginHostContainerProps> = ({
  pluginId,
  entryPoint,
  onMessage,
  className = ''
}) => {
  const { plugins, registry } = usePluginRegistry();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!registry || !pluginId) return;
    
    let isMounted = true; // Flag to prevent state updates on unmounted component
    
    const setupPlugin = async () => {
      if (!isMounted) return; // Bail if component unmounted
      setLoading(true);
      setError(null);
      
      try {
        // Get the plugin host directly from the registry (now async)
        const pluginHost = await registry.getPluginHost(pluginId); 
        
        if (!isMounted) return; // Check again after async operation

        if (!pluginHost) {
          throw new Error(`Plugin ${pluginId} not found or could not be activated`);
        }
        
        // Check if the plugin is an iframe host (constructor check is fragile, consider adding a type property/method to IPluginHost)
        if (!(pluginHost instanceof IFramePluginHost)) { 
          throw new Error(`Plugin ${pluginId} does not support UI rendering via iframe`);
        }
        
        // Get the plugin manifest from the host
        const manifest = pluginHost.getManifest();
        
        // Check if the plugin has the requested entry point
        let entryFile: string | undefined;
        
        if (entryPoint === 'sidebar' && manifest.contributes?.sidebar) {
          entryFile = manifest.contributes.sidebar.entry;
        } else if (manifest.contributes?.propertyPanel) { // Simplified check for panel entry point
          // Assuming entryPoint matches panel ID
          const panel = manifest.contributes.propertyPanel.find((p: { id: string; }) => p.id === entryPoint);
          entryFile = panel?.entry;
        }
        // Add checks for other entryPoint types (modal, etc.) if needed
        
        if (!entryFile) {
          throw new Error(`Plugin ${pluginId} does not have the requested entry point: ${entryPoint}`);
        }
        
        // Get the plugin bridge for communication from the host
        const bridge = pluginHost.getBridge();
        
        // === IFrame Specific Logic === 
        // This part seems to handle iframe setup *outside* the IFramePluginHost,
        // which might duplicate logic or cause conflicts. Ideally, IFramePluginHost.show()
        // would handle creating/showing the iframe in its container.
        // Consider refactoring this section to use host.show() and host.hide().
        
        // For now, adapting the existing logic:
        if (iframeRef.current) {
          // Clear previous content?
          // iframeRef.current.src = 'about:blank'; // This might interrupt loading initiated by host.load()
          
          // Get the container managed by IFramePluginHost
          const hostContainer = document.getElementById(`plugin-container-${pluginId}`);
          if (hostContainer && containerRef.current && containerRef.current !== hostContainer) {
             // Mount the host's container into this component's container
             // This might need adjustment based on how containers are styled/managed
             while (containerRef.current.firstChild) {
                 containerRef.current.removeChild(containerRef.current.firstChild);
             }
             // Ensure host's iframe is visible (host.show() should ideally handle this)
             const hostIframe = hostContainer.querySelector('iframe');
             if (hostIframe) hostIframe.style.display = 'block';
             hostContainer.style.display = 'block';

             containerRef.current.appendChild(hostContainer);
          } else if (!hostContainer) {
             console.warn(`Plugin host container (plugin-container-${pluginId}) not found in DOM. IFramePluginHost might not have loaded correctly.`);
             // Potentially throw error or wait? 
          }
          
          // The message handling and src setting might conflict with 
          // IFramePluginHost internal logic. Bridge should handle communication.
          // Setup message listener for host bridge (if needed beyond bridge)
          // const handleHostMessage = (message: any) => { ... };
          // bridge.onMessage(handleHostMessage); 
          
          // Signal loading complete
           if (isMounted) setLoading(false);
        } else {
             throw new Error("IFrame ref not available");
        }
      } catch (err) {
        console.error(`Error setting up plugin ${pluginId}:`, err);
        if (isMounted) {
            setError(err instanceof Error ? err : new Error(String(err)));
            setLoading(false);
        }
      }
    };
    
    setupPlugin();
    
    return () => {
      isMounted = false;
      // Optional: Deactivate plugin when container unmounts?
      // Consider if deactivation should happen here or be managed elsewhere
      // if (registry && pluginId) {
      //   registry.disablePlugin(pluginId).catch(e => console.error('Error disabling plugin on unmount:', e));
      // }
    };
  }, [pluginId, entryPoint, registry]); // Removed onMessage dependency for now, bridge handles it
  
  // Apply responsive height to container
  useEffect(() => {
    if (!containerRef.current) return;
    
    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.target === containerRef.current && iframeRef.current) {
          iframeRef.current.style.height = `${entry.contentRect.height}px`;
        }
      }
    });
    
    resizeObserver.observe(containerRef.current);
    
    return () => {
      resizeObserver.disconnect();
    };
  }, []);
  
  return (
    <div 
      ref={containerRef}
      className={`w-full h-full relative overflow-hidden ${className}`}
    >
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-gray-900/80 z-10">
          <Loader className="animate-spin text-blue-500" />
        </div>
      )}
      
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/90 dark:bg-gray-900/90 z-10 p-4">
          <AlertTriangle className="text-red-500 mb-2" size={24} />
          <h3 className="text-red-600 dark:text-red-400 font-medium mb-1">Plugin Error</h3>
          <p className="text-sm text-gray-600 dark:text-gray-300 text-center max-w-md">
            {error.message}
          </p>
        </div>
      )}
      
      <iframe
        ref={iframeRef}
        title={`Plugin: ${pluginId}`}
        className="w-full border-0"
        sandbox="allow-scripts allow-same-origin allow-forms"
        src="about:blank"
      />
    </div>
  );
};

export default PluginHostContainer;