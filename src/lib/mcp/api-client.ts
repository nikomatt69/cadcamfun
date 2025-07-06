// MCP API client for frontend
// src/lib/mcp/api-client.ts
import { v4 as uuidv4 } from "uuid";

export type MCPServerConfig = {
  id: string;
  name: string;
  type: "sse";
  url: string;
  enabled: boolean;
};

export class MCPApiClient {
  // Get all server configurations
  static async getServers(): Promise<MCPServerConfig[]> {
    const response = await fetch("/api/mcp/config");

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to fetch servers");
    }

    return response.json();
  }

  // Get a specific server configuration
  static async getServer(id: string): Promise<MCPServerConfig> {
    const response = await fetch(`/api/mcp/config/${id}`);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to fetch server");
    }

    return response.json();
  }

  // Add a new server configuration
  static async addServer(config: Omit<MCPServerConfig, "id">): Promise<MCPServerConfig> {
    const response = await fetch("/api/mcp/config", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(config)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to add server");
    }

    return response.json();
  }

  // Update an existing server configuration
  static async updateServer(id: string, config: Partial<MCPServerConfig>): Promise<MCPServerConfig> {
    const response = await fetch(`/api/mcp/config/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(config)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to update server");
    }

    return response.json();
  }

  // Delete a server configuration
  static async deleteServer(id: string): Promise<void> {
    const response = await fetch(`/api/mcp/config/${id}`, {
      method: "DELETE"
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to delete server");
    }
  }

  // Get server information (resources and tools)
  static async getServerInfo(serverId: string): Promise<any> {
    const response = await fetch("/api/mcp/server-info", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ serverId })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to get server info");
    }

    return response.json();
  }

  // Load a resource from an MCP server
  static async loadResource(serverId: string, resourceUri: string): Promise<any> {
    const response = await fetch("/api/mcp/resource", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ serverId, resourceUri })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to load resource");
    }

    return response.json();
  }

  // Execute a tool on an MCP server
  static async executeTool(serverId: string, toolName: string, parameters: any = {}): Promise<any> {
    const response = await fetch("/api/mcp/tool", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ serverId, toolName, parameters })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to execute tool");
    }

    return response.json();
  }
}
