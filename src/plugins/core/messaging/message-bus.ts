// src/plugins/core/messaging/message-bus.ts
import { MessageSerializer } from './messageSerializer';
import { generateId } from '../utils/idGenerator';

/**
 * Channel definition for strongly-typed messaging
 */
export interface MessageChannel<TMessage = any, TResult = any> {
  /** Unique identifier for the channel */
  id: string;
  
  /** Display name for the channel */
  name: string;
  
  /** Description of the channel's purpose */
  description?: string;
}

/**
 * Subscription to a message channel
 */
export interface MessageSubscription {
  /** Unsubscribe from the channel */
  unsubscribe: () => void;
}

/**
 * Message with metadata
 */
export interface Message<TPayload = any> {
  /** Unique message ID */
  id: string;
  
  /** Channel the message is sent on */
  channel: string;
  
  /** Sender ID */
  sender: string;
  
  /** Message payload */
  payload: TPayload;
  
  /** Timestamp the message was sent */
  timestamp: number;
  
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Message handler function
 */
export type MessageHandler<TPayload = any, TResult = any> = 
  (message: Message<TPayload>) => TResult | Promise<TResult>;

/**
 * Options for message publishing
 */
export interface PublishOptions {
  /** Timeout for waiting for responses (in milliseconds) */
  timeout?: number;
  
  /** Additional metadata to attach to the message */
  metadata?: Record<string, any>;
  
  /** Transferable objects to include with the message */
  transferables?: Transferable[];
}

/**
 * Default timeout for response waiting (30 seconds)
 */
const DEFAULT_TIMEOUT = 30000;

/**
 * Message bus provides a central hub for plugin communication
 * with typed channels, pub/sub, and request/response patterns
 */
export class MessageBus {
  private channels: Map<string, Set<MessageHandler>> = new Map();
  private listeners: Map<string, Set<MessageHandler>> = new Map();
  private pendingResponses: Map<string, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  }> = new Map();
  
  private serializer: MessageSerializer;
  
  constructor() {
    this.serializer = new MessageSerializer({
      handleCircularReferences: true,
      maxDepth: 50,
      strictMode: false
    });
  }
  
  /**
   * Register a message handler for a specific channel
   */
  public subscribe<TMessage = any, TResult = any>(
    channel: string | MessageChannel<TMessage, TResult>,
    handler: MessageHandler<TMessage, TResult>
  ): MessageSubscription {
    const channelId = typeof channel === 'string' ? channel : channel.id;
    
    if (!this.channels.has(channelId)) {
      this.channels.set(channelId, new Set());
    }
    
    const handlers = this.channels.get(channelId)!;
    handlers.add(handler as MessageHandler);
    
    return {
      unsubscribe: () => {
        const handlers = this.channels.get(channelId);
        if (handlers) {
          handlers.delete(handler as MessageHandler);
          
          if (handlers.size === 0) {
            this.channels.delete(channelId);
          }
        }
      }
    };
  }
  
  /**
   * Register a handler for all messages, regardless of channel
   */
  public addListener<TMessage = any, TResult = any>(
    handler: MessageHandler<TMessage, TResult>
  ): MessageSubscription {
    const listenerId = generateId('listener');
    
    if (!this.listeners.has(listenerId)) {
      this.listeners.set(listenerId, new Set());
    }
    
    const handlers = this.listeners.get(listenerId)!;
    handlers.add(handler as MessageHandler);
    
    return {
      unsubscribe: () => {
        const handlers = this.listeners.get(listenerId);
        if (handlers) {
          handlers.delete(handler as MessageHandler);
          
          if (handlers.size === 0) {
            this.listeners.delete(listenerId);
          }
        }
      }
    };
  }
  
  /**
   * Publish a message to a channel without waiting for a response
   */
  public publish<TMessage = any>(
    channel: string | MessageChannel<TMessage>,
    payload: TMessage,
    sender: string,
    options: PublishOptions = {}
  ): void {
    const channelId = typeof channel === 'string' ? channel : channel.id;
    
    const message: Message<TMessage> = {
      id: generateId('msg'),
      channel: channelId,
      sender,
      payload,
      timestamp: Date.now(),
      metadata: options.metadata
    };
    
    // Dispatch to channel handlers
    this.dispatchMessage(message);
  }
  
  /**
   * Send a message and wait for a response
   */
  public async request<TMessage = any, TResult = any>(
    channel: string | MessageChannel<TMessage, TResult>,
    payload: TMessage,
    sender: string,
    options: PublishOptions = {}
  ): Promise<TResult> {
    const channelId = typeof channel === 'string' ? channel : channel.id;
    const messageId = generateId('req');
    const timeout = options.timeout || DEFAULT_TIMEOUT;
    
    const message: Message<TMessage> = {
      id: messageId,
      channel: channelId,
      sender,
      payload,
      timestamp: Date.now(),
      metadata: {
        ...options.metadata,
        expectsResponse: true
      }
    };
    
    // Create a promise that will be resolved when the response is received
    const responsePromise = new Promise<TResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingResponses.delete(messageId);
        reject(new Error(`Request timed out after ${timeout}ms for channel: ${channelId}`));
      }, timeout);
      
      this.pendingResponses.set(messageId, { resolve, reject, timer });
    });
    
    // Dispatch the message
    this.dispatchMessage(message);
    
    return responsePromise;
  }
  
  /**
   * Send a response to a specific message
   */
  public respond<TResult = any>(
    requestMessage: Message<any>,
    result: TResult,
    options: PublishOptions = {}
  ): void {
    // Check if this is a response to a request
    if (!requestMessage.metadata?.expectsResponse) {
      console.warn(`Message ${requestMessage.id} does not expect a response`);
      return;
    }
    
    const responseMessage: Message<TResult> = {
      id: generateId('res'),
      channel: requestMessage.channel,
      sender: 'system', // The response is from the system
      payload: result,
      timestamp: Date.now(),
      metadata: {
        ...options.metadata,
        responseToId: requestMessage.id
      }
    };
    
    // Handle the response for any pending requests
    this.handleResponse(responseMessage);
    
    // Also dispatch the response as a regular message
    this.dispatchMessage(responseMessage);
  }
  
  /**
   * Handle an incoming response message
   */
  private handleResponse<TResult>(message: Message<TResult>): void {
    const requestId = message.metadata?.responseToId;
    
    if (!requestId) {
      console.warn(`Response message ${message.id} has no responseToId metadata`);
      return;
    }
    
    const pendingResponse = this.pendingResponses.get(requestId);
    if (!pendingResponse) {
      // This can happen if the request timed out
      console.warn(`No pending response found for request ${requestId}`);
      return;
    }
    
    // Clear the timeout
    clearTimeout(pendingResponse.timer);
    
    // Remove from pending responses
    this.pendingResponses.delete(requestId);
    
    // Resolve the promise
    pendingResponse.resolve(message.payload);
  }
  
  /**
   * Dispatch a message to all relevant handlers
   */
  private dispatchMessage<TMessage>(message: Message<TMessage>): void {
    const channelHandlers = this.channels.get(message.channel);
    const promises: Promise<any>[] = [];
    
    // First, check if this is a response to a pending request
    if (message.metadata?.responseToId && 
        this.pendingResponses.has(message.metadata.responseToId)) {
      this.handleResponse(message);
    }
    
    // Dispatch to channel-specific handlers
    if (channelHandlers) {
      for (const handler of Array.from(channelHandlers)) {
        try {
          const result = handler(message);
          
          // If the handler returns a promise, track it
          if (result instanceof Promise) {
            promises.push(result.catch(error => {
              console.error(`Error in message handler for channel ${message.channel}:`, error);
            }));
          }
        } catch (error) {
          console.error(`Error in message handler for channel ${message.channel}:`, error);
        }
      }
    }
    // Dispatch to global listeners
    this.listeners.forEach((handlers) => {
      handlers.forEach((handler) => {
        try {
          const result = handler(message);
          // If the handler returns a promise, track it
          if (result instanceof Promise) {
            promises.push(result.catch(error => {
              console.error(`Error in global message listener:`, error);
            }));
          }
        } catch (error) {
          console.error(`Error in global message listener:`, error);
        }
      });
    });
    
    // Wait for all promises to settle
    if (promises.length > 0) {
      Promise.all(promises).catch(error => {
        console.error(`Error in message handlers:`, error);
      });
    }
  }
  
  /**
   * Process a raw message from a plugin
   * This is typically used by the bridge to handle messages from plugins
   */
  public processRawMessage(rawMessage: string, sender: string): void {
    try {
      // Deserialize the message
      const deserialized = this.serializer.deserialize(rawMessage);
      
      // Ensure it has the correct format
      if (!deserialized || typeof deserialized !== 'object' || !deserialized.channel) {
        console.warn(`Invalid message format from ${sender}:`, deserialized);
        return;
      }
      
      // Add sender information if not present
      const message: Message = {
        ...deserialized,
        sender: deserialized.sender || sender,
        timestamp: deserialized.timestamp || Date.now()
      };
      
      // Dispatch the message
      this.dispatchMessage(message);
    } catch (error) {
      console.error(`Error processing raw message from ${sender}:`, error);
    }
  }
  
  /**
   * Serialize a message for transport
  public serializeMessage<TMessage>(message: Message<TMessage>): string {
    return this.serializer.serialize({ ...message });
  }
  
  /**
   * Create a typed channel
   */
  public createChannel<TMessage = any, TResult = any>(
    id: string,
    name: string,
    description?: string
  ): MessageChannel<TMessage, TResult> {
    return { id, name, description };
  }
  
  /**
   * Clear all pending responses (used for cleanup)
   */
  public clearPendingResponses(): void {
    for (const [id, { timer, reject }] of Array.from(this.pendingResponses.entries())) {
      clearTimeout(timer);
      reject(new Error('Message bus shutting down'));
      this.pendingResponses.delete(id);
    }
  }
  
  /**
   * Clear all subscriptions (used for cleanup)
   */
  public clearSubscriptions(): void {
    this.channels.clear();
    this.listeners.clear();
  }
  
  /**
   * Dispose the message bus
   */
  public dispose(): void {
    this.clearPendingResponses();
    this.clearSubscriptions();
  }
}