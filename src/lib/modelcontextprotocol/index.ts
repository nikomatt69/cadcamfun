import { ServerConfig, Server } from './types';
import { MCPServer } from './server';
import { MCPClient, MCPClientConfig, createClient as createMCPClient } from './client';

/**
 * Creates a Model Context Protocol server with the given configuration.
 * 
 * @param config - The server configuration including resources and tools
 * @returns A server instance that can handle MCP requests
 */
export function createServer(config: ServerConfig): Server {
  return new MCPServer(config);
}

/**
 * Creates a Model Context Protocol client for interacting with an MCP server
 * 
 * @param config - The client configuration including endpoint and error handlers
 * @returns A client instance that can create sessions and interact with an MCP server
 */
export function createClient(config: MCPClientConfig): MCPClient {
  return createMCPClient(config);
}

// Re-export types for consumers
export * from './types';
export * from './client'; 