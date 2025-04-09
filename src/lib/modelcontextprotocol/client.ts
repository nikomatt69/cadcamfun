import { v4 as uuidv4 } from 'uuid';

export interface MCPClientConfig {
  endpoint: string;
  onError?: (error: Error) => void;
}

export interface MCPSessionResource<T = any> {
  content: T;
  metadata?: Record<string, any>;
}

export interface MCPSession {
  id: string;
  getResource: <T = any>(name: string) => Promise<MCPSessionResource<T>>;
  useTool: <T = any>(name: string, params: any) => Promise<T>;
  close: () => Promise<void>;
}

export class MCPClient {
  private endpoint: string;
  private onError?: (error: Error) => void;

  constructor(config: MCPClientConfig) {
    this.endpoint = config.endpoint;
    this.onError = config.onError;
  }

  /**
   * Creates a new MCP session for interaction with the server
   */
  async createSession(): Promise<MCPSession> {
    const sessionId = uuidv4();
    
    const session: MCPSession = {
      id: sessionId,
      
      /**
       * Retrieves a resource from the server
       * 
       * @param name The name of the resource to retrieve
       * @returns The resource content and metadata
       */
      getResource: async <T = any>(name: string): Promise<MCPSessionResource<T>> => {
        try {
          const response = await fetch(this.endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              type: 'resource',
              sessionId,
              name
            })
          });
          
          if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to get resource ${name}: ${error}`);
          }
          
          return await response.json();
        } catch (error) {
          if (this.onError && error instanceof Error) {
            this.onError(error);
          }
          throw error;
        }
      },
      
      /**
       * Uses a tool provided by the server
       * 
       * @param name The name of the tool to use
       * @param params Parameters to pass to the tool
       * @returns The result of the tool operation
       */
      useTool: async <T = any>(name: string, params: any): Promise<T> => {
        try {
          const response = await fetch(this.endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              type: 'tool',
              sessionId,
              name,
              params
            })
          });
          
          if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to use tool ${name}: ${error}`);
          }
          
          return await response.json();
        } catch (error) {
          if (this.onError && error instanceof Error) {
            this.onError(error);
          }
          throw error;
        }
      },
      
      /**
       * Closes the session
       */
      close: async (): Promise<void> => {
        try {
          const response = await fetch(this.endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              type: 'close',
              sessionId
            })
          });
          
          if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to close session: ${error}`);
          }
        } catch (error) {
          if (this.onError && error instanceof Error) {
            this.onError(error);
          }
          throw error;
        }
      }
    };
    
    return session;
  }
}

/**
 * Creates a Model Context Protocol client for interacting with an MCP server
 * 
 * @param config The client configuration
 * @returns An MCP client instance
 */
export function createClient(config: MCPClientConfig): MCPClient {
  return new MCPClient(config);
}
