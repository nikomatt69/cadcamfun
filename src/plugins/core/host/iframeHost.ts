// src/plugins/core/host/iframe-host.ts
import { PluginManifest, PluginPermission } from '../registry/pluginManifest';
import { PluginHostBase } from './pluginHost';
import { PluginState } from '../registry';
import { SandboxOptions, PluginSandbox } from './sandbox';
import { IPluginConnection } from './pluginBridge';
import path from 'path';

/**
 * Connection implementation for iFrames using PostMessage
 */
class IFrameConnection implements IPluginConnection {
  constructor(private iframe: HTMLIFrameElement, private targetOrigin: string) {}

  send(message: any, transferables?: Transferable[]): void {
    // Ensure that the iframe is fully loaded before sending messages
    if (this.iframe.contentWindow) {
      this.iframe.contentWindow.postMessage(message, this.targetOrigin, transferables || []);
    } else {
      console.warn('Cannot send message: iframe contentWindow is not available');
    }
  }

  onMessage(handler: (message: any) => void): void {
    const messageListener = (event: MessageEvent) => {
      // Validate the message origin
      if (event.origin !== this.targetOrigin && this.targetOrigin !== '*') {
        console.warn(`Ignored message from unauthorized origin: ${event.origin}`);
        return;
      }

      // Ensure the message is from our iframe
      if (event.source !== this.iframe.contentWindow) {
        return;
      }

      handler(event.data);
    };

    window.addEventListener('message', messageListener);
    
    // Store the listener for cleanup
    (this as any)._messageListener = messageListener;
  }

  close(): void {
    // Remove the message listener
    if ((this as any)._messageListener) {
      window.removeEventListener('message', (this as any)._messageListener);
      delete (this as any)._messageListener;
    }
    
    // Remove the iframe from the DOM
    if (this.iframe.parentNode) {
      this.iframe.parentNode.removeChild(this.iframe);
    }
  }
}

/**
 * Plugin host implementation using iFrames for isolation
 * This implementation is suitable for plugins with UI requirements
 */
export class IFramePluginHost extends PluginHostBase {
  private iframe: HTMLIFrameElement | null = null;
  private sandbox: PluginSandbox;
  private container: HTMLElement | null = null;
  private allowedOrigin: string;
  
  constructor(
    manifest: PluginManifest,
    sandboxOptions: SandboxOptions
  ) {
    super(manifest, sandboxOptions);
    this.sandbox = new PluginSandbox(manifest, sandboxOptions);
    
    // Determine the allowed origin for postMessage security
    this.allowedOrigin = this.determineAllowedOrigin();
  }

  /**
   * Load the plugin in an iFrame
   */
  public async load(): Promise<void> {
    if (this.state !== PluginState.INSTALLED) {
      throw new Error(`Cannot load plugin ${this.manifest.id} in state ${this.state}`);
    }

    try {
      // Create an iframe element
      this.iframe = document.createElement('iframe');
      
      // Set sandbox attributes for security
      this.iframe.sandbox.value = this.sandbox.getSandboxAttributes();
      
      // Set other attributes
      this.iframe.style.border = 'none';
      this.iframe.style.width = '100%';
      this.iframe.style.height = '100%';
      this.iframe.title = `Plugin: ${this.manifest.name}`;
      this.iframe.allow = this.getAllowAttribute();
      
      // Generate a unique name for the iframe for targeting
      const frameName = `plugin-${this.manifest.id}-${Date.now()}`;
      this.iframe.name = frameName;
      
      // Find or create the container for the iframe
      this.container = this.findOrCreateContainer();
      
      // Create the iframe content with the bootstrap code
      const iframeContent = this.createIFrameContent();
      
      // Load the iframe with the content
      this.iframe.srcdoc = iframeContent;
      
      // Append the iframe to the container
      this.container.appendChild(this.iframe);
      
      // Set up the connection for the bridge
      const connection = new IFrameConnection(this.iframe, this.allowedOrigin);
      this.bridge.setConnection(connection);
      
      // Wait for the iframe to load and initialize
      await new Promise<void>((resolve, reject) => {
        // Handle initialization message
        const messageHandler = (event: MessageEvent) => {
          if (!event.data || event.data.type !== 'plugin-init-result') return;
          
          window.removeEventListener('message', messageHandler);
          
          if (event.data.success) {
            resolve();
          } else {
            reject(new Error(event.data.error || 'Failed to initialize plugin'));
          }
        };
        
        window.addEventListener('message', messageHandler);
        
        // Handle load errors
        const errorHandler = () => {
          window.removeEventListener('message', messageHandler);
          this.iframe?.removeEventListener('error', errorHandler);
          reject(new Error('Failed to load plugin iframe'));
        };

        this.iframe?.addEventListener('error', errorHandler);

        // Set a timeout for initialization
        setTimeout(() => {
          window.removeEventListener('message', messageHandler);
          this.iframe?.removeEventListener('error', errorHandler);
          reject(new Error('Plugin initialization timed out'));
        }, 10000);
      });
      
      // Update state to loaded
      this.state = PluginState.LOADED;
      console.log(`Plugin ${this.manifest.id} loaded successfully in iframe`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.handleError(err, 'load');
      this.cleanupIFrame();
      throw err;
    }
  }

  /**
   * Unload the plugin and remove the iframe
   */
  public async unload(): Promise<void> {
    if (this.state === PluginState.INSTALLED) {
      return;
    }

    try {
      // Deactivate first if active
      if (this.state === PluginState.ACTIVATED) {
        await this.deactivate();
      }

      // Clean up the bridge
      this.bridge.dispose();
      
      // Remove the iframe
      this.cleanupIFrame();

      this.state = PluginState.INSTALLED;
      console.log(`Plugin ${this.manifest.id} unloaded successfully`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.handleError(err, 'unload');
      this.cleanupIFrame();
      throw err;
    }
  }
  
  /**
   * Show the plugin UI
   */
  public show(): void {
    if (this.iframe && this.container) {
      this.iframe.style.display = 'block';
      this.container.style.display = 'block';
    }
  }
  
  /**
   * Hide the plugin UI
   */
  public hide(): void {
    if (this.iframe && this.container) {
      this.iframe.style.display = 'none';
      this.container.style.display = 'none';
    }
  }

  /**
   * Clean up the iframe
   */
  private cleanupIFrame(): void {
    if (this.iframe) {
      if (this.iframe.parentNode) {
        this.iframe.parentNode.removeChild(this.iframe);
      }
      this.iframe = null;
    }
  }

  /**
   * Find or create the container for the plugin iframe
   */
  private findOrCreateContainer(): HTMLElement {
    // Try to find an existing container
    let container = document.getElementById(`plugin-container-${this.manifest.id}`);
    
    // Create one if it doesn't exist
    if (!container) {
      container = document.createElement('div');
      container.id = `plugin-container-${this.manifest.id}`;
      container.className = 'plugin-container';
      container.style.display = 'none'; // Initially hidden
      
      // Find the plugin container root element
      const pluginRoot = document.getElementById('plugin-container-root');
      if (!pluginRoot) {
        // Create the root container if it doesn't exist
        const root = document.createElement('div');
        root.id = 'plugin-container-root';
        root.style.position = 'absolute';
        root.style.zIndex = '1000';
        document.body.appendChild(root);
        root.appendChild(container);
      } else {
        pluginRoot.appendChild(container);
      }
    }
    
    // Set styles specific to this plugin's container
    container.style.overflow = 'hidden';
    container.style.height = '100%';
    container.style.width = '100%';
    
    return container;
  }

  /**
   * Determine the allowed origin for postMessage security
   */
  private determineAllowedOrigin(): string {
    // In a production environment, this would be restricted to the plugin's domain
    // For development, we use a more permissive setting
    if (process.env.NODE_ENV === 'development') {
      return '*'; // Allow any origin during development
    }
    
    // In production, use the plugin's origin
    const pluginUrl = new URL(this.getPluginUrl());
    return `${pluginUrl.protocol}//${pluginUrl.host}`;
  }
  
  /**
   * Get the URL to load the plugin code from via the serving API
   */
  private getPluginUrl(): string {
    // L'endpoint API per servire i file è /api/plugins/serve
    // Ha bisogno dell'ID del plugin e del percorso relativo del file (manifest.main)
    
    if (!this.manifest.main || typeof this.manifest.main !== 'string') {
       throw new Error(`Plugin ${this.manifest.id} manifest does not specify a valid 'main' entry point.`);
    }
    
    const relativeMainPath = path.normalize(this.manifest.main).replace(/^(\.\.(\/|\\|\$))+/, '');
     if (relativeMainPath.includes('..')) {
       throw new Error(`Invalid 'main' path in manifest for plugin ${this.manifest.id}: ${this.manifest.main}`);
    }

    const apiUrl = `/api/plugins/serve?id=${encodeURIComponent(this.manifest.id)}&file=${encodeURIComponent(relativeMainPath)}`;
    
    console.log(`[IFrameHost] Generated plugin code URL for ${this.manifest.id}: ${apiUrl}`);
    return apiUrl;
  }
  
  /**
   * Generate the 'allow' attribute for the iframe
   */
  private getAllowAttribute(): string {
    const permissions = [];
    
    // Add permissions based on the plugin's manifest using enum members
    if (this.manifest.permissions?.includes(PluginPermission.UI_FULLSCREEN)) {
      permissions.push('fullscreen');
    }
    
    if (this.manifest.permissions?.includes(PluginPermission.DEVICE_CAMERA)) {
      permissions.push('camera');
    }
    
    if (this.manifest.permissions?.includes(PluginPermission.DEVICE_MICROPHONE)) {
      permissions.push('microphone');
    }
    
    return permissions.join('; ');
  }

  /**
   * Create the iframe HTML content with the bootstrap code
   */
  private createIFrameContent(): string {
    // Generate a full HTML document for the iframe
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="${this.sandbox.getCSP()}">
        <title>${this.manifest.name}</title>
        <style>
          body {
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
              Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
            overflow: hidden;
          }
          
          #plugin-root {
            width: 100%;
            height: 100%;
            overflow: auto;
          }
          
          .plugin-loading {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            width: 100%;
          }
          
          .plugin-error {
            color: red;
            padding: 20px;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div id="plugin-root">
          <div class="plugin-loading">Loading plugin...</div>
        </div>
        
        <script>
          // Plugin iframe bootstrap code
          (async function() {
            let pluginExports = null;
            let pluginApi = null;
            let pendingPromises = new Map();
            const pluginManifest = ${JSON.stringify(this.manifest)};
            
            try {
              // Create the root element for the plugin UI
              const pluginRoot = document.getElementById('plugin-root');
              
              // Create the plugin API object that will be exposed to the plugin
              pluginApi = createPluginApi(pluginManifest.id);
              
              // Import the plugin module
              const pluginModule = await import('${this.getPluginUrl()}');
              pluginExports = pluginModule.default || pluginModule;
              
              // Initialize the plugin
              if (typeof pluginExports.init === 'function') {
                await pluginExports.init(pluginApi);
              }
              
              // Render the UI if the plugin has a render function
              if (typeof pluginExports.render === 'function') {
                // Clear the loading indicator
                pluginRoot.innerHTML = '';
                
                // Call the plugin's render function
                pluginExports.render(pluginRoot);
              }
              
              // Send success message back to host
              window.parent.postMessage({ 
                type: 'plugin-init-result', 
                success: true 
              }, '*');
            } catch (error) {
              console.error('Plugin initialization failed:', error);
              
              // Show error in the UI
              const pluginRoot = document.getElementById('plugin-root');
              pluginRoot.innerHTML = \`
                <div class="plugin-error">
                  <h3>Plugin Failed to Load</h3>
                  <p>\${error.message}</p>
                </div>
              \`;
              
              // Send error message back to host
              window.parent.postMessage({ 
                type: 'plugin-init-result', 
                success: false, 
                error: error.message 
              }, '*');
            }
            
            // Handle messages from the host
            window.addEventListener('message', async function(event) {
              // In production, we would check the origin
              // if (event.origin !== expectedOrigin) return;
              
              const message = event.data;
              
              if (!message || !message.id || !message.type) {
                console.warn('Invalid message format:', message);
                return;
              }
              
              if (message.type === 'request') {
                handleRequest(message);
              } else if (message.type === 'response') {
                handleResponse(message);
              } else if (message.type === 'event') {
                handleEvent(message);
              }
            });
            
            // Handle request messages from the host
            async function handleRequest(message) {
              const { id, method, params } = message;
              
              try {
                // Special handling for lifecycle methods
                if (method.startsWith('_lifecycle.')) {
                  const lifecycleMethod = method.split('.')[1];
                  let result;
                  
                  if (lifecycleMethod === 'activate' && typeof pluginExports.activate === 'function') {
                    result = await pluginExports.activate();
                  } else if (lifecycleMethod === 'deactivate' && typeof pluginExports.deactivate === 'function') {
                    result = await pluginExports.deactivate();
                  } else {
                    throw new Error(\`Unsupported lifecycle method: \${lifecycleMethod}\`);
                  }
                  
                  window.parent.postMessage({
                    id,
                    pluginId: pluginManifest.id,
                    type: 'response',
                    result
                  }, '*');
                  return;
                }
                
                // Regular API method calls
                const [namespace, methodName] = method.split('.');
                if (!namespace || !methodName) {
                  throw new Error(\`Invalid method format: \${method}\`);
                }
                
                // Look up the handler in the plugin exports
                const handler = pluginExports[namespace]?.[methodName];
                if (typeof handler !== 'function') {
                  throw new Error(\`Method not found: \${method}\`);
                }
                
                // Call the handler
                const result = await handler(params);
                
                // Send the response
                window.parent.postMessage({
                  id,
                  pluginId: pluginManifest.id,
                  type: 'response',
                  result
                }, '*');
              } catch (error) {
                // Send error response
                window.parent.postMessage({
                  id,
                  pluginId: pluginManifest.id,
                  type: 'response',
                  error: {
                    code: error.code || -32000,
                    message: error.message || 'Unknown error',
                    data: error.data
                  }
                }, '*');
              }
            }
            
            // Handle response messages from the host
            function handleResponse(message) {
              const { id, result, error } = message;
              const pendingPromise = pendingPromises.get(id);
              
              if (!pendingPromise) {
                console.warn(\`Received response for unknown request: \${id}\`);
                return;
              }
              
              pendingPromises.delete(id);
              
              if (error) {
                const errorObj = new Error(error.message);
                errorObj.code = error.code;
                errorObj.data = error.data;
                pendingPromise.reject(errorObj);
              } else {
                pendingPromise.resolve(result);
              }
            }
            
            // Handle event messages from the host
            function handleEvent(message) {
              const { method, params } = message;
              
              if (!method) {
                console.warn('Event message without method name');
                return;
              }
              
              // Dispatch the event to the plugin if it has a handler
              const [namespace, eventName] = method.split('.');
              const eventHandlers = pluginExports._eventHandlers?.[namespace]?.[eventName];
              
              if (Array.isArray(eventHandlers)) {
                for (const handler of eventHandlers) {
                  try {
                    handler(params);
                  } catch (error) {
                    console.error(\`Error in event handler for \${method}:\`, error);
                  }
                }
              }
            }
            
            // Create the plugin API object
            function createPluginApi(pluginId) {
              // Create a proxy-based API
              const api = {};
              
              // Generate a unique message ID
              function generateMessageId() {
                return 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
              }
              
              // Call a method on the host
              function callHostMethod(method, params, transferables) {
                return new Promise((resolve, reject) => {
                  const messageId = generateMessageId();
                  
                  // Store the promise callbacks
                  pendingPromises.set(messageId, { resolve, reject });
                  
                  // Send the request
                  window.parent.postMessage({
                    id: messageId,
                    pluginId,
                    type: 'request',
                    method,
                    params
                  }, '*', transferables || []);
                });
              }
              
              // Register an event handler
              function onHostEvent(eventName, handler) {
                if (!pluginExports._eventHandlers) {
                  pluginExports._eventHandlers = {};
                }
                
                const [namespace, name] = eventName.split('.');
                
                if (!pluginExports._eventHandlers[namespace]) {
                  pluginExports._eventHandlers[namespace] = {};
                }
                
                if (!pluginExports._eventHandlers[namespace][name]) {
                  pluginExports._eventHandlers[namespace][name] = [];
                }
                
                pluginExports._eventHandlers[namespace][name].push(handler);
                
                // Return a function to remove the handler
                return () => {
                  const handlers = pluginExports._eventHandlers[namespace][name];
                  const index = handlers.indexOf(handler);
                  if (index !== -1) {
                    handlers.splice(index, 1);
                  }
                };
              }
              
              // Add UI-specific methods for iframe plugins
              const uiMethods = {
                // Resize the iframe to fit content
                resizeToContent: () => {
                  const height = document.documentElement.scrollHeight;
                  callHostMethod('ui.resizeFrame', { height });
                },
                
                // Get theme information
                getTheme: () => callHostMethod('ui.getTheme', {}),
                
                // Register for theme changes
                onThemeChanged: (handler) => onHostEvent('ui.themeChanged', handler)
              };
              
              // Build the API namespaces
              const namespaces = ['model', 'ui', 'file', 'network', 'storage'];
              
              namespaces.forEach(namespace => {
                api[namespace] = new Proxy({}, {
                  get(target, prop) {
                    if (typeof prop !== 'string') return undefined;
                    
                    // For UI namespace, add the special UI methods
                    if (namespace === 'ui' && prop in uiMethods) {
                      return uiMethods[prop];
                    }
                    
                    // Check if it's an event subscription
                    if (prop.startsWith('on') && prop.length > 2) {
                      const eventName = prop[2].toLowerCase() + prop.slice(3);
                      return (handler) => onHostEvent(\`\${namespace}.\${eventName}\`, handler);
                    }
                    
                    // Regular method call
                    return (...args) => {
                      const params = args[0] || {};
                      const transferables = args[1] || [];
                      return callHostMethod(\`\${namespace}.\${prop}\`, params, transferables);
                    };
                  }
                });
              });
              
              return api;
            }
          })();
        </script>
      </body>
      </html>
    `;
  }
}