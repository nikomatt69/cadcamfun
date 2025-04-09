// src/plugins/core/host/plugin-bridge.ts
import { MessageSerializer } from '../messaging/messageSerializer';
import { generateId } from '../utils/idGenerator';

/**
 * Interface for message structure between host and plugin
 */
export interface PluginMessage {
  id: string;
  pluginId: string;
  type: 'request' | 'response' | 'event';
  method?: string;
  params?: any;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

/**
 * RPC options for call configuration
 */
export interface RPCOptions {
  timeout?: number;
  transferables?: Transferable[];
}

/**
 * Connection interface for different communication channels
 */
export interface IPluginConnection {
  send(message: any, transferables?: Transferable[]): void;
  onMessage(handler: (message: any) => void): void;
  close(): void;
}

/**
 * Plugin Bridge provides a communication layer between host and plugin
 * with Remote Procedure Call capabilities
 */
export class PluginBridge {
  private pendingRequests: Map<string, { 
    resolve: (value: any) => void; 
    reject: (reason: any) => void;
    timer?: NodeJS.Timeout;
  }> = new Map();
  
  private eventHandlers: Map<string, Set<(data: any) => void>> = new Map();
  private connection: IPluginConnection | null = null;
  private serializer: MessageSerializer = new MessageSerializer();
  private defaultTimeout = 30000; // 30 seconds default timeout

  constructor(private pluginId: string) {}

  /**
   * Set the connection for this bridge
   */
  public setConnection(connection: IPluginConnection): void {
    this.connection = connection;
    this.connection.onMessage(this.handleMessage.bind(this));
  }

  /**
   * Call a remote method in the plugin
   */
  public call<T = any>(method: string, params: any, options: RPCOptions = {}): Promise<T> {
    if (!this.connection) {
      return Promise.reject(new Error('No connection established'));
    }

    const messageId = generateId();
    const timeout = options.timeout || this.defaultTimeout;

    const message: PluginMessage = {
      id: messageId,
      pluginId: this.pluginId,
      type: 'request',
      method,
      params
    };

    // Serialize the message to handle complex objects and ensure safe transit
    const serializedMessage = this.serializer.serialize(message as any);

    return new Promise<T>((resolve, reject) => {
      // Set a timeout for the request
      const timer = setTimeout(() => {
        if (this.pendingRequests.has(messageId)) {
          this.pendingRequests.delete(messageId);
          reject(new Error(`Request timeout for method ${method}`));
        }
      }, timeout);

      // Store the promise callbacks to resolve/reject when response arrives
      this.pendingRequests.set(messageId, { resolve, reject, timer });

      // Send the message through the connection
      this.connection!.send(serializedMessage, options.transferables);
    });
  }

  /**
   * Handle incoming messages from the plugin
   */
  private handleMessage(rawMessage: any): void {
    try {
      // Deserialize the message
      const message = this.serializer.deserialize(rawMessage) as PluginMessage;

      if (!message || typeof message !== 'object') {
        console.error('Invalid message format', rawMessage);
        return;
      }

      switch (message.type) {
        case 'response':
          this.handleResponse(message);
          break;
        case 'request':
          this.handleRequest(message);
          break;
        case 'event':
          this.handleEvent(message);
          break;
        default:
          console.warn(`Unknown message type: ${(message as any).type}`);
      }
    } catch (error) {
      console.error('Error handling message:', error, rawMessage);
    }
  }

  /**
   * Handle response messages to pending requests
   */
  private handleResponse(message: PluginMessage): void {
    const { id, result, error } = message;
    const pendingRequest = this.pendingRequests.get(id);

    if (!pendingRequest) {
      console.warn(`Received response for unknown request: ${id}`);
      return;
    }

    // Clear the timeout
    if (pendingRequest.timer) {
      clearTimeout(pendingRequest.timer);
    }

    // Remove from pending requests
    this.pendingRequests.delete(id);

    // Resolve or reject the promise based on the response
    if (error) {
      const errorObj = new Error(error.message);
      (errorObj as any).code = error.code;
      (errorObj as any).data = error.data;
      pendingRequest.reject(errorObj);
    } else {
      pendingRequest.resolve(result);
    }
  }

  /**
   * Handle request messages from the plugin
   * These are calls from the plugin to the host
   */
  private async handleRequest(message: PluginMessage): Promise<void> {
    if (!this.connection) return;

    const { id, method, params } = message;
    
    // Prepare the response message
    const response: PluginMessage = {
      id,
      pluginId: this.pluginId,
      type: 'response',
    };

    try {
      // Dispatch the request to the appropriate handler
      // (This will be implemented in the API providers)
      const apiRouter = (window as any).__PLUGIN_API_ROUTER__;
      if (!apiRouter) {
        throw new Error('API router not initialized');
      }

      const result = await apiRouter.handleRequest(this.pluginId, method, params);
      response.result = result;
    } catch (error) {
      response.error = {
        code: (error as any).code || -32000,
        message: 'Unknown error',
        data: (error as any).data
      };
    }
    // Send the response back after ensuring the response is a plain object
    const serializedResponse = this.serializer.serialize({ ...response });
    this.connection.send(serializedResponse);
  }
  /**
   * Handle event messages from the plugin
   */
  private handleEvent(message: PluginMessage): void {
    const { method, params } = message;
    
    if (!method) {
      console.warn('Event message without method name');
      return;
    }

    const handlers = this.eventHandlers.get(method);
    if (handlers && handlers.size > 0) {
      handlers.forEach(handler => {
        try {
          handler(params);
        } catch (error) {
          console.error(`Error in event handler for ${method}:`, error);
        }
      });
    }
  }

  /**
   * Send an event to the plugin
   */
  public emit(eventName: string, data: any, transferables?: Transferable[]): void {
    if (!this.connection) {
      console.warn(`Cannot emit event ${eventName}: No connection established`);
      return;
    }

    const message: PluginMessage = {
      id: generateId(),
      pluginId: this.pluginId,
      type: 'event',
      method: eventName,
      params: data
    };

    const serializedMessage = this.serializer.serialize(message as any);
    this.connection.send(serializedMessage, transferables);
  }

  /**
   * Register an event listener for plugin-initiated events
   */
  public on(eventName: string, handler: (data: any) => void): () => void {
    if (!this.eventHandlers.has(eventName)) {
      this.eventHandlers.set(eventName, new Set());
    }

    const handlers = this.eventHandlers.get(eventName)!;
    handlers.add(handler);

    // Return a function to remove this handler
    return () => {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.eventHandlers.delete(eventName);
      }
    };
  }

  /**
   * Close the bridge and clean up resources
   */
  public dispose(): void {
    // Clear all pending requests
    for (const [id, { timer, reject }] of Array.from(this.pendingRequests.entries())) {
      if (timer) {
        clearTimeout(timer);
      }
      reject(new Error('Bridge disposed'));
      this.pendingRequests.delete(id);
    }

    // Clear event handlers
    this.eventHandlers.clear();

    // Close the connection if it exists
    if (this.connection) {
      this.connection.close();
      this.connection = null;
    }
  }
}