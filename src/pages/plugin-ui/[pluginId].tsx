import React, { useEffect, useState, ComponentType, useRef } from 'react';
import { useRouter } from 'next/router';
import Loading from '@/src/components/ui/Loading';
import { PluginAPI, ExtensionDefinition } from '@/src/plugins/core/types';
import { ComponentElement } from '@/src/types/component';

// Define a helper type for the API methods that return Promises in the proxy
type AsyncPluginAPIMethods = {
    getElements: () => Promise<ComponentElement[]>;
    createElement: (element: Omit<ComponentElement, 'id'>) => Promise<string>;
    updateElement: (id: string, properties: Partial<ComponentElement>) => Promise<boolean>;
    deleteElement: (id: string) => Promise<boolean>;
    // Add other methods that become async via proxy
};

// Simple proxy for the PluginAPI to communicate via postMessage
const createApiProxy = (pluginId: string, openerWindow: Window | null): PluginAPI => {
    const callApi = <K extends keyof PluginAPI>(
        method: K,
        ...args: Parameters<PluginAPI[K]>
    ): Promise<ReturnType<PluginAPI[K]>> => {
        // This is intentionally designed to return a Promise, even if the original API method was sync,
        // because postMessage communication is asynchronous.
        return new Promise((resolve, reject) => {
            if (!openerWindow) {
                console.error('[Plugin UI] Opener window not available.');
                return reject('Opener window not available.');
            }

            const messageId = `plugin-api-call-${Date.now()}-${Math.random()}`;

            const messageListener = (event: MessageEvent) => {
                if (
                    event.source === openerWindow &&
                    event.data.type === 'pluginApiResponse' &&
                    event.data.messageId === messageId
                ) {
                    window.removeEventListener('message', messageListener);
                    if (event.data.success) {
                        // The main window should return data compatible with the original method's return type
                        resolve(event.data.result as ReturnType<PluginAPI[K]>);
                    } else {
                        console.error(`[Plugin UI] API call error for ${method}:`, event.data.error);
                        reject(event.data.error);
                    }
                }
            };

            window.addEventListener('message', messageListener);

            console.log(`[Plugin UI] Sending API call: ${method}`, args);
            openerWindow.postMessage(
                {
                    type: 'pluginApiCall',
                    pluginId,
                    messageId,
                    method,
                    args,
                },
                '*' // In production, specify the exact origin
            );

            // Timeout for the response
            setTimeout(() => {
                window.removeEventListener('message', messageListener);
                reject(`API call timed out for ${method}`);
            }, 15000); // 15 second timeout
        });
    };

    // Implement the PluginAPI interface by proxying calls
    // Use 'as any' for methods where the proxied version returns a Promise
    // but the original interface expects a synchronous value.
    // The final object is cast to PluginAPI.
    const api = {
        registerExtension: (extension: Omit<ExtensionDefinition, 'id'>) => callApi('registerExtension', extension),
        unregisterExtension: (extensionId: string) => callApi('unregisterExtension', extensionId),
        getSettings: () => callApi('getSettings'),
        updateSettings: (settings: Record<string, any>) => callApi('updateSettings', settings),
        // Methods potentially returning non-promises in the original API
        getElements: () => callApi('getElements') as any,
        createElement: (element: Omit<ComponentElement, 'id'>) => callApi('createElement', element) as any,
        updateElement: (id: string, properties: Partial<ComponentElement>) => callApi('updateElement', id, properties) as any,
        deleteElement: (id: string) => callApi('deleteElement', id) as any,
        // Subscription logic remains complex
        subscribeToEvents: (eventType: string, handler: (event: any) => void): (() => void) => {
            console.warn('[Plugin UI] subscribeToEvents has limited support in external windows.');
            const handlerId = `handler-${Date.now()}-${Math.random()}`;
            openerWindow?.postMessage({ type: 'subscribePluginEvent', pluginId, eventType, handlerId }, '*');
            return () => {
                console.log(`[Plugin UI] Requesting unsubscribe for ${eventType}, handler ${handlerId}`);
                openerWindow?.postMessage({ type: 'unsubscribePluginEvent', pluginId, eventType, handlerId }, '*');
            };
        },
        // Add other methods as needed, proxying them with callApi and casting return type
    };

    return api as unknown as PluginAPI; // Cast through unknown to avoid type checking
};

const PluginUIPage = () => {
  const router = useRouter();
  const { pluginId } = router.query;
  const [PluginUIComponent, setPluginUIComponent] = useState<ComponentType<{ api: PluginAPI }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const openerWindowRef = useRef<Window | null>(null);
  const apiProxyRef = useRef<PluginAPI | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !pluginId || Array.isArray(pluginId)) {
      return;
    }

    openerWindowRef.current = window.opener;

    if (!openerWindowRef.current) {
      setError('This page must be opened from the main application.');
      setIsLoading(false);
      return;
    }

    console.log(`[Plugin UI ${pluginId}] Requesting component from opener...`);

    const messageListener = (event: MessageEvent) => {
      if (
        event.source === openerWindowRef.current &&
        event.data.type === 'pluginComponentResponse' &&
        event.data.pluginId === pluginId
      ) {
        window.removeEventListener('message', messageListener); // Clean up listener immediately
        if (event.data.success && event.data.componentName) {
          console.log(`[Plugin UI ${pluginId}] Received component name: ${event.data.componentName}`);
          const FoundComponent = (window.opener as any)?.__pluginComponents?.[pluginId]?.[event.data.componentName];

          if (FoundComponent) {
            console.log(`[Plugin UI ${pluginId}] Found component in opener window.`);
            apiProxyRef.current = createApiProxy(pluginId, openerWindowRef.current);
            setPluginUIComponent(() => FoundComponent as ComponentType<{ api: PluginAPI }>);
            setError(null);
          } else {
            console.error(`[Plugin UI ${pluginId}] Component ${event.data.componentName} not found in opener window's registry.`);
            setError(`Component ${event.data.componentName} not found. Ensure the plugin is loaded and components are exposed correctly in the main app.`);
          }
        } else {
          console.error(`[Plugin UI ${pluginId}] Failed to get component from opener:`, event.data.error);
          setError(event.data.error || 'Failed to load plugin UI component.');
        }
        setIsLoading(false);
      }
      // Handle incoming proxied events from main window
      else if (
          event.source === openerWindowRef.current &&
          event.data.type === 'pluginEventDispatch' &&
          event.data.pluginId === pluginId
      ) {
          console.log(`[Plugin UI ${pluginId}] Received event dispatch: ${event.data.eventType}`);
          // Find the correct local handler (requires managing subscriptions sent via postMessage)
          // This part is complex and omitted in this simplified version.
      }
    };

    window.addEventListener('message', messageListener);

    // Request the component from the opener window
    openerWindowRef.current.postMessage(
      {
        type: 'requestPluginComponent',
        pluginId: pluginId,
        componentType: 'sidebar' // Assuming we want the sidebar component here
      },
      '*' // Use specific origin in production
    );

    // Timeout for the response
    const timeoutId = setTimeout(() => {
      if (isLoading) {
        setError('Timeout waiting for response from main application.');
        setIsLoading(false);
        window.removeEventListener('message', messageListener);
      }
    }, 10000); // 10 second timeout

    // Cleanup function
    return () => {
      console.log(`[Plugin UI ${pluginId}] Cleaning up...`);
      clearTimeout(timeoutId);
      window.removeEventListener('message', messageListener);
      openerWindowRef.current?.postMessage({ type: 'pluginWindowClosing', pluginId }, '*');
    };
  }, [pluginId]); // Depend only on pluginId, isLoading internal state handles the rest

  useEffect(() => {
    if (pluginId) {
      document.title = `Plugin: ${pluginId}`;
    }
  }, [pluginId]);

  if (!pluginId) {
    return <div className="p-4 text-red-600">Missing Plugin ID.</div>;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loading />
        <p className="ml-2">Loading Plugin UI for {pluginId}...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-red-600">
        <h2 className="font-bold text-lg mb-2">Error Loading Plugin UI</h2>
        <p>{error}</p>
        <p className="mt-4 text-sm text-gray-500">Please ensure the main application is running and the plugin is active.</p>
        <button onClick={() => window.close()} className="mt-4 px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600">Close</button>
      </div>
    );
  }

  if (!PluginUIComponent) {
      return <div className="p-4 text-orange-600">Plugin component could not be loaded. Check console for details.</div>;
  }

  return (
    <div className="p-2 bg-gray-50 dark:bg-gray-800 h-screen overflow-y-auto">
      <PluginUIComponent api={apiProxyRef.current!} />
    </div>
  );
};

export default PluginUIPage; 