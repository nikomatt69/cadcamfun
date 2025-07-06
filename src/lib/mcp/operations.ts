// src/lib/mcp/operations.ts

import { mcpClientManager } from "./client";

interface ResourceResponse {
  mimeType: string;
  text: string;
}

// Generic function to load a resource
export async function loadResource(serverId: string, resourceUri: string): Promise<any> {
  const server = mcpClientManager.getServer(serverId);

  if (!server) {
    throw new Error(`MCP server with ID ${serverId} not found or not connected`);
  }

  try {
    const response = (await server.readResource({
      uri: resourceUri,
      _meta: {
        /* any metadata if needed */
      }
    })) as unknown as ResourceResponse;

    // Parse the response based on content type
    if (response.mimeType.includes("application/json")) {
      return JSON.parse(response.text);
    }

    return response.text;
  } catch (error) {
    console.error(`Failed to load resource ${resourceUri} from server ${serverId}:`, error);
    throw error;
  }
}

// Generic function to execute a tool
export async function executeTool(serverId: string, toolName: string, parameters: Record<string, any>): Promise<any> {
  const server = mcpClientManager.getServer(serverId);

  if (!server) {
    throw new Error(`MCP server with ID ${serverId} not found or not connected`);
  }
  try {
    const response = await server.callTool({ name: toolName, arguments: parameters });

    // If the response is a string, attempt to parse it as JSON
    if (typeof response === "string") {
      try {
        return JSON.parse(response);
      } catch {
        return response;
      }
    }

    return response;
  } catch (error) {
    console.error(`Failed to execute tool ${toolName} on server ${serverId}:`, error);
    throw error;
  }
}

// Get available resources from a server
export async function getServerResources(serverId: string): Promise<any[]> {
  const server = mcpClientManager.getServer(serverId);

  if (!server) {
    throw new Error(`MCP server with ID ${serverId} not found or not connected`);
  }

  try {
    const info = await server.listResources();
    return (info?.resources as any[] | undefined) || [];
  } catch (error) {
    console.error(`Failed to get resources from server ${serverId}:`, error);
    throw error;
  }
}

// Get available tools from a server
export async function getServerTools(serverId: string): Promise<any[]> {
  const server = mcpClientManager.getServer(serverId);

  if (!server) {
    throw new Error(`MCP server with ID ${serverId} not found or not connected`);
  }

  try {
    const info = await server.listTools();
    return (info?.tools as any[] | undefined) || [];
  } catch (error) {
    console.error(`Failed to get tools from server ${serverId}:`, error);
    throw error;
  }
}
