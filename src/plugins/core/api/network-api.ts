// src/plugins/core/api/network-api.ts
import { PluginPermission } from '../registry';
import { requirePermission } from './capabilities';
import { EventEmitter } from 'events';

/**
 * Request headers
 */
export type RequestHeaders = Record<string, string>;

/**
 * Request options
 */
export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD';
  headers?: RequestHeaders;
  body?: string | FormData | ArrayBuffer;
  timeout?: number;
  credentials?: 'include' | 'omit' | 'same-origin';
}

/**
 * Response data
 */
export interface ResponseData<T = any> {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: T;
}

/**
 * WebSocket message
 */
export type WebSocketMessage = string | ArrayBuffer;

/**
 * WebSocket options
 */
export interface WebSocketOptions {
  protocols?: string | string[];
  headers?: Record<string, string>;
}

/**
 * Network API provides HTTP and WebSocket capabilities
 */
export class NetworkAPI extends EventEmitter {
  private pluginId: string;
  private pluginName: string;
  private activeSockets: Map<string, WebSocket> = new Map();
  
  constructor(pluginId: string, pluginName: string) {
    super();
    this.pluginId = pluginId;
    this.pluginName = pluginName;
  }
  
  /**
   * Make an HTTP request
   */
  // @ts-ignore
  @requirePermission(PluginPermission.NETWORK_EXTERNAL)
  public async request<T = any>(
    url: string, 
    options: RequestOptions = {}
  ): Promise<ResponseData<T>> {
    return window.__CAD_APP__.network.request(url, {
      ...options,
      pluginId: this.pluginId
    });
  }
  
  /**
   * HTTP GET request shorthand
   */
  // @ts-ignore
  @requirePermission(PluginPermission.NETWORK_EXTERNAL)
  public async get<T = any>(
    url: string, 
    headers?: RequestHeaders
  ): Promise<ResponseData<T>> {
    return this.request<T>(url, { method: 'GET', headers });
  }
  
  /**
   * HTTP POST request shorthand
   */
  // @ts-ignore
  @requirePermission(PluginPermission.NETWORK_EXTERNAL)
  public async post<T = any>(
    url: string, 
    body?: any,
    headers?: RequestHeaders
  ): Promise<ResponseData<T>> {
    // Handle JSON body conversion
    const requestHeaders = headers || {};
    let requestBody = body;
    
    if (body && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof ArrayBuffer)) {
      requestBody = JSON.stringify(body);
      requestHeaders['Content-Type'] = 'application/json';
    }
    
    return this.request<T>(url, { method: 'POST', body: requestBody, headers: requestHeaders });
  }
  
  /**
   * Create a WebSocket connection
   */
  // @ts-ignore
  @requirePermission(PluginPermission.NETWORK_EXTERNAL)
  public async createWebSocket(
    url: string,
    options: WebSocketOptions = {}
  ): Promise<string> {
    // Create a unique ID for this socket
    const socketId = `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create WebSocket
    const socket = new WebSocket(url, options.protocols);
    
    // Set up listeners
    socket.addEventListener('message', (event) => {
      this.emit(`websocket:${socketId}:message`, event.data);
    });
    
    socket.addEventListener('open', () => {
      this.emit(`websocket:${socketId}:open`);
    });
    
    socket.addEventListener('close', (event) => {
      this.emit(`websocket:${socketId}:close`, { code: event.code, reason: event.reason });
      this.activeSockets.delete(socketId);
    });
    
    socket.addEventListener('error', (error) => {
      this.emit(`websocket:${socketId}:error`, error);
    });
    
    // Store socket
    this.activeSockets.set(socketId, socket);
    
    // Wait for connection to be established
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener('open', () => resolve());
      socket.addEventListener('error', (error) => reject(error));
    });
    
    return socketId;
  }
  
  /**
   * Send a message over WebSocket
   */
  // @ts-ignore
  @requirePermission(PluginPermission.NETWORK_EXTERNAL)
  public async sendWebSocketMessage(
    socketId: string,
    message: WebSocketMessage
  ): Promise<void> {
    const socket = this.activeSockets.get(socketId);
    if (!socket) {
      throw new Error(`WebSocket with ID ${socketId} not found`);
    }
    
    socket.send(message);
  }
  
  /**
   * Close a WebSocket connection
   */
  // @ts-ignore
  @requirePermission(PluginPermission.NETWORK_EXTERNAL)
  public async closeWebSocket(
    socketId: string,
    code?: number,
    reason?: string
  ): Promise<void> {
    const socket = this.activeSockets.get(socketId);
    if (!socket) {
      throw new Error(`WebSocket with ID ${socketId} not found`);
    }
    
    socket.close(code, reason);
    this.activeSockets.delete(socketId);
  }
  
  /**
   * Register for WebSocket messages
   */
  public onWebSocketMessage(
    socketId: string,
    handler: (message: WebSocketMessage) => void
  ): () => void {
    const eventName = `websocket:${socketId}:message`;
    this.on(eventName, handler);
    
    return () => {
      this.off(eventName, handler);
    };
  }
  
  /**
   * Register for WebSocket connection state changes
   */
  public onWebSocketStateChange(
    socketId: string,
    handler: (state: 'open' | 'close' | 'error', data?: any) => void
  ): () => void {
    const events = [
      `websocket:${socketId}:open`,
      `websocket:${socketId}:close`,
      `websocket:${socketId}:error`
    ];
    
    const handlers = [
      () => handler('open'),
      (data: any) => handler('close', data),
      (error: any) => handler('error', error)
    ];
    
    // Register all event handlers
    events.forEach((event, index) => {
      this.on(event, handlers[index]);
    });
    
    // Return unsubscribe function
    return () => {
      events.forEach((event, index) => {
        this.off(event, handlers[index]);
      });
    };
  }
  
  /**
   * Clean up all active WebSockets
   */
  public dispose(): void {
    for (const socket of Array.from(this.activeSockets.values())) {
      try {
        socket.close();
      } catch (error) {
        console.error('Error closing WebSocket:', error);
      }
    }
    
    this.activeSockets.clear();
    this.removeAllListeners();
  }
}