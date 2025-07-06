// src/components/plugins/PluginHostContainer.tsx
import React, { useState, useEffect, useRef } from "react";
// import { usePluginRegistry } from '../../hooks/usePluginRegistry'; // Remove
import { usePluginClient } from "@/src/contexts/PluginClientContext"; // Import the client context hook
import { Loader, AlertTriangle } from "react-feather";
import { IPluginHost } from "../../plugins/core/host/pluginHost"; // Import base type
// import { IFramePluginHost } from '../../plugins/core/host/iframeHost'; // Likely no longer needed here if host manages its element

interface PluginHostContainerProps {
  pluginId: string;
  entryPoint: "sidebar" | "panel" | "modal" | string; // Keep for potential future use by host
  onMessage?: (message: any) => void; // Communication handled via bridge obtained from host
  className?: string;
}

const PluginHostContainer: React.FC<PluginHostContainerProps> = ({
  pluginId,
  entryPoint,
  onMessage,
  className = ""
}) => {
  // const { plugins, registry } = usePluginRegistry(); // Remove
  const { getHost, activatePlugin } = usePluginClient(); // Use the client context hook and get activatePlugin
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const hostRef = useRef<IPluginHost | null>(null); // Keep track of the host instance
  const activationAttemptedRef = useRef<boolean>(false); // Track if activation has been tried

  useEffect(() => {
    // Reset state when pluginId changes
    setStatus("loading");
    setErrorMessage(null);
    hostRef.current = null;
    activationAttemptedRef.current = false; // Reset activation attempt flag

    if (!pluginId) {
      setStatus("error");
      setErrorMessage("No plugin ID provided.");
      return;
    }

    console.log(`[HostContainer] useEffect triggered for: ${pluginId}`);
    const currentHost = getHost(pluginId);

    if (currentHost) {
      // Host already exists and is ready in context
      console.log(`[HostContainer] Host for ${pluginId} found in context.`);
      hostRef.current = currentHost;
      activationAttemptedRef.current = true; // Mark as active/attempted

      // Set target element and show UI (same logic as before)
      if (typeof (currentHost as any).setTargetElement === "function") {
        if (containerRef.current) {
          (currentHost as any).setTargetElement(containerRef.current);
          console.log(`[HostContainer] Target element set for host ${pluginId}.`);
        } else {
          console.error(`[HostContainer] Container ref missing for ${pluginId}.`);
          setStatus("error");
          setErrorMessage("Internal error: Plugin container reference missing.");
          return;
        }
      } else {
        console.warn(`[HostContainer] Host for ${pluginId} lacks setTargetElement method.`);
      }

      try {
        if (typeof (currentHost as any).show === "function") {
          (currentHost as any).show();
          console.log(`[HostContainer] Host UI shown for ${pluginId}.`);
        } else {
          console.warn(`[HostContainer] Host for ${pluginId} has no 'show' method.`);
        }
        setStatus("ready");
      } catch (err) {
        console.error(`[HostContainer] Error calling show() for existing host ${pluginId}:`, err);
        setErrorMessage(err instanceof Error ? err.message : "Failed to show plugin UI.");
        setStatus("error");
      }
    } else if (!activationAttemptedRef.current) {
      // Host not found, and we haven't tried activating it yet
      console.warn(`[HostContainer] Host for ${pluginId} not found. Attempting activation...`);
      setStatus("loading");
      activationAttemptedRef.current = true; // Mark that we are trying

      // Ensure container ref is available before activating
      if (!containerRef.current) {
        console.error(`[HostContainer] Cannot activate ${pluginId}: Container ref is not ready yet.`);
        setStatus("error");
        setErrorMessage("Internal error: Plugin container failed to initialize.");
        return; // Exit effect
      }

      // Pass the container element to activatePlugin
      activatePlugin(pluginId, containerRef.current)
        .then(activatedHost => {
          if (activatedHost) {
            // Activation successful - the context update will trigger a re-run of this effect
            // where the host will be found in the `if (currentHost)` block.
            console.log(`[HostContainer] Activation successful for ${pluginId}, context updated.`);
            // No need to set state here, the effect re-run will handle it.
          } else {
            // Activation failed (activatePlugin returned null)
            console.error(`[HostContainer] Activation failed for ${pluginId}.`);
            setStatus("error");
            setErrorMessage(`Failed to activate plugin ${pluginId}. Check server logs.`);
          }
        })
        .catch(err => {
          // Catch errors from the activatePlugin promise itself
          console.error(`[HostContainer] Error during activatePlugin call for ${pluginId}:`, err);
          setStatus("error");
          setErrorMessage(err instanceof Error ? err.message : `Error activating plugin ${pluginId}.`);
        });
    } else {
      // Host not found, but we already tried activating. Still loading or error state handled elsewhere.
      console.log(`[HostContainer] Host for ${pluginId} still not found after activation attempt. Status: ${status}`);
    }

    // Cleanup function remains the same
    return () => {
      const currentHost = hostRef.current;
      if (currentHost && typeof (currentHost as any).hide === "function") {
        console.log(`[HostContainer] Hiding host UI for ${pluginId} on cleanup.`);
        try {
          (currentHost as any).hide();
        } catch (err) {
          console.error(`[HostContainer] Error calling hide() for host ${pluginId} on cleanup:`, err);
        }
      }
      hostRef.current = null;
    };
    // Add activatePlugin to dependency array
  }, [pluginId, entryPoint, getHost, activatePlugin]);

  return (
    <div
      ref={containerRef}
      className={`plugin-host-container w-full h-full relative overflow-auto ${className}`}
      data-plugin-id={pluginId}
    >
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-gray-900/80 z-10">
          <Loader className="animate-spin text-blue-500" />
          <span className="ml-2 text-gray-600 dark:text-gray-300">Loading Plugin...</span>
        </div>
      )}

      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-50 dark:bg-red-900/10 z-10 p-4">
          <AlertTriangle className="text-red-500 mb-2" size={24} />
          <h3 className="text-red-600 dark:text-red-400 font-medium mb-1">Plugin Load Error</h3>
          <p className="text-sm text-gray-600 dark:text-gray-300 text-center max-w-md">
            {errorMessage || "Could not load the plugin UI."}
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
