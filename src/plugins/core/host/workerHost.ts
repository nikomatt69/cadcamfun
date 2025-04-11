// src/plugins/core/host/worker-host.ts
import { PluginManifest } from '../registry/pluginManifest';
import { PluginHostBase } from './pluginHost';
import { PluginState } from '../registry';
import { SandboxOptions, PluginSandbox } from './sandbox';
import { IPluginConnection } from './pluginBridge';
import path from 'path'; // Importa path per normalizzare

/**
 * Connection implementation for Web Workers
 */
class WorkerConnection implements IPluginConnection {
  constructor(private worker: Worker) {}

  send(message: any, transferables?: Transferable[]): void {
    this.worker.postMessage(message, transferables || []);
  }

  onMessage(handler: (message: any) => void): void {
    this.worker.onmessage = (event) => handler(event.data);
  }

  close(): void {
    this.worker.terminate();
  }
}

/**
 * Plugin host implementation using Web Workers for isolation
 * This implementation is suitable for plugins without UI requirements
 * that need to perform calculations or background tasks
 */
export class WorkerPluginHost extends PluginHostBase {
  private worker: Worker | null = null;
  private sandbox: PluginSandbox;
  
  constructor(
    manifest: PluginManifest,
    sandboxOptions: SandboxOptions
  ) {
    super(manifest, sandboxOptions);
    this.sandbox = new PluginSandbox(manifest, sandboxOptions);
  }

  /**
   * Load the plugin in a Web Worker
   */
  public async load(): Promise<void> {
    if (this.state !== PluginState.INSTALLED) {
      throw new Error(`Cannot load plugin ${this.manifest.id} in state ${this.state}`);
    }

    try {
      // Create a blob URL with the worker bootstrap code
      const bootstrapCode = this.createWorkerBootstrap();
      const blob = new Blob([bootstrapCode], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);

      // Create the worker with the bootstrap code
      this.worker = new Worker(workerUrl, {
        name: `plugin-${this.manifest.id}`,
        type: 'module'
      });

      // Set up error handling
      this.worker.onerror = (event) => {
        this.handleError(
          new Error(`Worker error: ${event.message}`),
          'worker'
        );
      };

      // Set up the connection for the bridge
      const connection = new WorkerConnection(this.worker);
      this.bridge.setConnection(connection);

      // Wait for the worker to initialize and load the plugin code
      await new Promise<void>((resolve, reject) => {
        // Set up a one-time handler for the init message
        const initHandler = (event: MessageEvent) => {
          if (event.data && event.data.type === 'plugin-init-result') {
            this.worker!.removeEventListener('message', initHandler);
            
            if (event.data.success) {
              resolve();
            } else {
              reject(new Error(event.data.error || 'Failed to initialize plugin'));
            }
          }
        };

        this.worker!.addEventListener('message', initHandler);

        // Send init message with plugin information
        this.worker!.postMessage({
          type: 'plugin-init',
          manifest: this.manifest,
          pluginUrl: this.getPluginUrl(),
          sandboxOptions: this.sandbox.getWorkerOptions()
        });

        // Set a timeout for initialization
        setTimeout(() => {
          this.worker!.removeEventListener('message', initHandler);
          reject(new Error('Plugin initialization timed out'));
        }, 10000);
      });

      // Clean up the blob URL
      URL.revokeObjectURL(workerUrl);

      // Update state to loaded
      this.state = PluginState.LOADED;
      console.log(`Plugin ${this.manifest.id} loaded successfully in worker`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.handleError(err, 'load');
      this.cleanupWorker();
      throw err;
    }
  }

  /**
   * Unload the plugin and terminate the worker
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

      // Terminate the worker
      if (this.worker) {
        this.worker.terminate();
        this.worker = null;
      }

      this.state = PluginState.INSTALLED;
      console.log(`Plugin ${this.manifest.id} unloaded successfully`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.handleError(err, 'unload');
      this.cleanupWorker();
      throw err;
    }
  }

  /**
   * Get the URL to load the plugin code from via the serving API
   */
  private getPluginUrl(): string {
    // L'endpoint API per servire i file è /api/plugins/serve
    // Ha bisogno dell'ID del plugin e del percorso relativo del file (manifest.main)
    
    // Assicurati che manifest.main sia definito e sia un percorso relativo valido
    if (!this.manifest.main || typeof this.manifest.main !== 'string') {
       throw new Error(`Plugin ${this.manifest.id} manifest does not specify a valid 'main' entry point.`);
    }
    
    // Sanitizza/normalizza il percorso main per sicurezza (anche se dovrebbe essere sicuro dal manifest)
    const relativeMainPath = path.normalize(this.manifest.main).replace(/^(\.\.(\/|\\|\$))+/, '');
     if (relativeMainPath.includes('..')) {
       throw new Error(`Invalid 'main' path in manifest for plugin ${this.manifest.id}: ${this.manifest.main}`);
    }

    // Costruisci l'URL per l'API serve.ts
    // Non serve NEXT_PUBLIC_PLUGIN_BASE_URL qui, usiamo un percorso API relativo.
    const apiUrl = `/api/plugins/serve?id=${encodeURIComponent(this.manifest.id)}&file=${encodeURIComponent(relativeMainPath)}`;
    
    console.log(`[WorkerHost] Generated plugin code URL for ${this.manifest.id}: ${apiUrl}`);
    return apiUrl;
  }

  /**
   * Create the worker bootstrap code that will load and initialize the plugin
   */
  private createWorkerBootstrap(): string {
    // This code will run inside the Web Worker
    return `
      // Plugin worker bootstrap code
      let pluginExports = null;
      let pluginApi = null;
      let pendingPromises = new Map();
      let pluginManifest = null;

      // Handle messages from the host
      self.onmessage = async function(event) {
        const message = event.data;

        // Handle initialization
        if (message.type === 'plugin-init') {
          try {
            pluginManifest = message.manifest;
            
            // Create the plugin API object that will be exposed to the plugin
            pluginApi = createPluginApi(pluginManifest.id);
            
            // Import the plugin module
            const pluginModule = await import(message.pluginUrl);
            pluginExports = pluginModule.default || pluginModule;
            
            // Initialize the plugin
            if (typeof pluginExports.init === 'function') {
              await pluginExports.init(pluginApi);
            }
            
            // Send success message back to host
            self.postMessage({ type: 'plugin-init-result', success: true });
          } catch (error) {
            console.error('Plugin initialization failed:', error);
            self.postMessage({ 
              type: 'plugin-init-result', 
              success: false, 
              error: error.message 
            });
          }
          return;
        }

        // Handle regular messages (should be handled by the bridge)
        handleBridgeMessage(message);
      };

      // Handle messages through the bridge
      function handleBridgeMessage(message) {
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
      }

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
            
            self.postMessage({
              id,
              pluginId: pluginManifest.id,
              type: 'response',
              result
            });
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
          self.postMessage({
            id,
            pluginId: pluginManifest.id,
            type: 'response',
            result
          });
        } catch (error) {
          // Send error response
          self.postMessage({
            id,
            pluginId: pluginManifest.id,
            type: 'response',
            error: {
              code: error.code || -32000,
              message: error.message || 'Unknown error',
              data: error.data
            }
          });
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
          pendingPromise.reject(createErrorFromResponse(error));
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

      // Create an error object from an error response
      function createErrorFromResponse(error) {
        const errorObj = new Error(error.message);
        errorObj.code = error.code;
        errorObj.data = error.data;
        return errorObj;
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
            self.postMessage({
              id: messageId,
              pluginId,
              type: 'request',
              method,
              params
            }, transferables || []);
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
        
        // Build the API namespaces
        const namespaces = ['model', 'ui', 'file', 'network', 'storage'];
        
        namespaces.forEach(namespace => {
          api[namespace] = new Proxy({}, {
            get(target, prop) {
              if (typeof prop !== 'string') return undefined;
              
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
    `;
  }

  /**
   * Clean up the worker
   */
  private cleanupWorker(): void {
    if (this.worker) {
        this.worker.terminate();
        this.worker = null;
    }
  }
}