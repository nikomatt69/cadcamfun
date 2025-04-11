// src/components/plugins/PluginHostContainer.tsx
import React, { useState, useEffect, useRef } from 'react';
// import { usePluginRegistry } from '../../hooks/usePluginRegistry'; // Remove
import { usePluginClient } from '../../context/PluginClientContext'; // Import the client context hook
import { Loader, AlertTriangle } from 'react-feather';
import { IPluginHost } from '../../plugins/core/host/pluginHost'; // Import base type
// import { IFramePluginHost } from '../../plugins/core/host/iframeHost'; // Likely no longer needed here if host manages its element

interface PluginHostContainerProps {
  pluginId: string;
  entryPoint: 'sidebar' | 'panel' | 'modal' | string; // Keep for potential future use by host
  // onMessage?: (message: any) => void; // Communication handled via bridge obtained from host
  className?: string;
}

const PluginHostContainer: React.FC<PluginHostContainerProps> = ({
  pluginId,
  entryPoint,
  // onMessage,
  className = ''
}) => {
  // const { plugins, registry } = usePluginRegistry(); // Remove
  const { getHost } = usePluginClient(); // Use the client context hook
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const hostRef = useRef<IPluginHost | null>(null); // Keep track of the host instance

  useEffect(() => {
    setStatus('loading');
    setErrorMessage(null);
    hostRef.current = null; // Reset host ref on pluginId change

    if (!pluginId) {
        setStatus('error');
        setErrorMessage('No plugin ID provided.');
        return;
    }

    console.log(`[HostContainer] Looking for host: ${pluginId}`);
    const host = getHost(pluginId);

    if (!host) {
        console.warn(`[HostContainer] Host for ${pluginId} not found or not ready in context. Waiting...`);
        setStatus('loading'); // Keep loading, provider might still be initializing the host
        return; // Exit effect, will re-run when context updates
    }

    hostRef.current = host; // Store the found host
    console.log(`[HostContainer] Found host for ${pluginId}. Ensuring UI is visible...`);
    
    try {
        // Check if the host has a show method (expected for IFramePluginHost)
        if (typeof (host as any).show === 'function') {
            (host as any).show(); // Tell the host to make its UI visible
            setStatus('ready'); 
            console.log(`[HostContainer] Host UI for ${pluginId} set to visible.`);
        } else {
            // Handle hosts without UI or without a show method? 
            // For now, assume if host exists, it's ready (might need adjustment)
            console.warn(`[HostContainer] Host for ${pluginId} exists but has no 'show' method. Assuming ready.`);
            setStatus('ready');
        }
    } catch (err) {
        console.error(`[HostContainer] Error calling show() for host ${pluginId}:`, err);
        setErrorMessage(err instanceof Error ? err.message : "Failed to show plugin UI.");
        setStatus('error');
    }

    // --- Cleanup Function --- 
    return () => {
       // When the container unmounts or pluginId changes, tell the host to hide.
       // The PluginClientProvider handles the actual unloading/deactivation.
       const currentHost = hostRef.current;
       if (currentHost && typeof (currentHost as any).hide === 'function') {
           console.log(`[HostContainer] Hiding host UI for ${pluginId} on cleanup.`);
           try {
               (currentHost as any).hide();
           } catch (err) {
                console.error(`[HostContainer] Error calling hide() for host ${pluginId} on cleanup:`, err);
           }
       }
       hostRef.current = null;
    };

  }, [pluginId, entryPoint, getHost]); // Rerun when pluginId or getHost changes

  return (
    <div 
      ref={containerRef} 
      className={`plugin-host-container w-full h-full relative overflow-auto ${className}`}
      data-plugin-id={pluginId}
    >
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-gray-900/80 z-10">
          <Loader className="animate-spin text-blue-500" />
          <span className="ml-2 text-gray-600 dark:text-gray-300">Loading Plugin...</span>
        </div>
      )}
      
      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-50 dark:bg-red-900/10 z-10 p-4">
          <AlertTriangle className="text-red-500 mb-2" size={24} />
          <h3 className="text-red-600 dark:text-red-400 font-medium mb-1">Plugin Load Error</h3>
          <p className="text-sm text-gray-600 dark:text-gray-300 text-center max-w-md">
            {errorMessage || 'Could not load the plugin UI.'}
          </p>
        </div>
      )}
       {/* 
         NOTE: The actual plugin iframe is NOT rendered here anymore.
         It is created and managed by IFramePluginHost and appended to #plugin-container-root.
         This component now primarily signals readiness and handles loading/error states.
         Ensure your layout includes <div id="plugin-container-root"></div> somewhere.
       */}
    </div>
  );
};

export default PluginHostContainer;