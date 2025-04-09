// src/plugins/core/messaging/rpc-handler.ts
import { MessageBus, Message, MessageChannel, MessageSubscription } from './message-bus';
import { generateId } from '../utils/idGenerator';

/**
 * RPC method descriptor
 */
export interface RPCMethod<TParams = any, TResult = any> {
  /** Method name */
  name: string;
  
  /** Method description */
  description?: string;
  
  /** Handler function */
  handler: (params: TParams) => Promise<TResult> | TResult;
}

/**
 * RPC service descriptor
 */
export interface RPCService {
  /** Service namespace */
  namespace: string;
  
  /** Service description */
  description?: string;
  
  /** Methods in this service */
  methods: Record<string, RPCMethod>;
}

/**
 * RPC error codes (based on JSON-RPC spec)
 */
export enum RPCErrorCode {
  /** Parse error (-32700) */
  ParseError = -32700,
  
  /** Invalid request (-32600) */
  InvalidRequest = -32600,
  
  /** Method not found (-32601) */
  MethodNotFound = -32601,
  
  /** Invalid params (-32602) */
  InvalidParams = -32602,
  
  /** Internal error (-32603) */
  InternalError = -32603,
  
  /** Generic application error */
  ApplicationError = -32000,
  
  /** Permission denied */
  PermissionDenied = -32001,
  
  /** Timeout error */
  Timeout = -32002,
}

/**
 * RPC error with code and data
 */
export class RPCError extends Error {
  constructor(
    message: string,
    public code: RPCErrorCode = RPCErrorCode.ApplicationError,
    public data?: any
  ) {
    super(message);
    this.name = 'RPCError';
  }
}

/**
 * RPC request message
 */
export interface RPCRequest<TParams = any> {
  /** Method to call in format "namespace.method" */
  method: string;
  
  /** Method parameters */
  params: TParams;
  
  /** ID of the plugin making the request */
  pluginId: string;
}

/**
 * RPC response message
 */
export interface RPCResponse<TResult = any> {
  /** Result of the method call */
  result?: TResult;
  
  /** Error if the call failed */
  error?: {
    /** Error code */
    code: RPCErrorCode;
    
    /** Error message */
    message: string;
    
    /** Additional error data */
    data?: any;
  };
}

/**
 * Default RPC channel
 */
export const RPC_CHANNEL: MessageChannel<RPCRequest, RPCResponse> = {
  id: 'rpc',
  name: 'RPC Channel'
};

/**
 * RPC Handler manages services and routes requests
 */
export class RPCHandler {
  private services: Map<string, RPCService> = new Map();
  private permissionCheckers: Map<string, (pluginId: string, method: string) => boolean> = new Map();
  private rpcSubscription: MessageSubscription | null = null;
  
  constructor(private messageBus: MessageBus) {
    this.rpcSubscription = this.messageBus.subscribe(RPC_CHANNEL, this.handleRPCRequest.bind(this));
  }
  
  /**
   * Register a service with its methods
   */
  public registerService(service: RPCService): void {
    if (this.services.has(service.namespace)) {
      throw new Error(`Service namespace already registered: ${service.namespace}`);
    }
    
    this.services.set(service.namespace, service);
  }
  
  /**
   * Unregister a service
   */
  public unregisterService(namespace: string): void {
    this.services.delete(namespace);
  }
  
  /**
   * Register a permission checker for a namespace
   */
  public registerPermissionChecker(
    namespace: string,
    checker: (pluginId: string, method: string) => boolean
  ): void {
    this.permissionCheckers.set(namespace, checker);
  }

  /**
   * Handle incoming RPC requests from the message bus.
   * Returns the result or throws an RPCError.
   */
  private async handleRPCRequest(message: Message<RPCRequest>): Promise<RPCResponse> {
    const { payload, metadata } = message;
    const { method, params, pluginId } = payload;
    
    try {
      // Parse method name (namespace.method)
      const [namespace, methodName] = method.split('.');
      if (!namespace || !methodName) {
        throw new RPCError(`Invalid method format: ${method}`, RPCErrorCode.InvalidRequest);
      }

      // Find the service
      const service = this.services.get(namespace);
      if (!service) {
        throw new RPCError(`Service not found: ${namespace}`, RPCErrorCode.MethodNotFound);
      }

      // Find the method
      const methodDef = service.methods[methodName];
      if (!methodDef) {
        throw new RPCError(`Method not found: ${method}`, RPCErrorCode.MethodNotFound);
      }

      // Check permissions
      const permissionChecker = this.permissionCheckers.get(namespace);
      if (permissionChecker && !permissionChecker(pluginId, method)) {
        throw new RPCError(`Permission denied for method: ${method}`, RPCErrorCode.PermissionDenied);
      }

      // Execute the method
      const result = await methodDef.handler(params);

      // Return the successful result (MessageBus will handle sending)
      return { result };

    } catch (error) {
      let rpcError: RPCError;

      if (error instanceof RPCError) {
        rpcError = error;
      } else if (error instanceof Error) {
        rpcError = new RPCError(error.message, RPCErrorCode.InternalError);
      } else {
        rpcError = new RPCError('An unknown error occurred', RPCErrorCode.InternalError);
      }

      // Return the error response (MessageBus will handle sending)
      return {
        error: {
          code: rpcError.code,
          message: rpcError.message,
          data: rpcError.data,
        },
      };
    }
  }

  /**
   * Make an RPC call to another endpoint
   */
  public async call<TParams = any, TResult = any>(
    method: string,
    params: TParams,
    senderId: string,
    options: { timeout?: number } = {}
  ): Promise<TResult> {
    const requestPayload: RPCRequest<TParams> = {
      method,
      params,
      pluginId: senderId,
    };

    try {
      const responsePayload = await this.messageBus.request<RPCRequest<TParams>, RPCResponse<TResult>>(
        RPC_CHANNEL,
        requestPayload,
        senderId,
        { 
          timeout: options.timeout, 
        }
      );
      
      if (responsePayload.error) {
        throw new RPCError(
          responsePayload.error.message,
          responsePayload.error.code,
          responsePayload.error.data
        );
      }
      
      return responsePayload.result as TResult;

    } catch (error) {
      if (error instanceof RPCError) {
        throw error;
      } 
      throw new RPCError(error instanceof Error ? error.message : String(error), RPCErrorCode.Timeout);
    }
  }

  /**
   * Dispose of the handler, unsubscribing from the message bus
   */
  public dispose(): void {
    if (this.rpcSubscription) {
      this.rpcSubscription.unsubscribe();
      this.rpcSubscription = null;
    }
    this.services.clear();
    this.permissionCheckers.clear();
  }
}