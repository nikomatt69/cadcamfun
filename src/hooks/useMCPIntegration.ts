import { useEffect, useCallback } from "react";
import { useMCPServerStore } from "../store/mcpServerStore";
import { mcpClientManager } from "../lib/mcp/client";

/**
 * Custom hook for managing MCP servers integration
 */
export const useMCPIntegration = () => {
  const {
    servers,
    serverStatuses,
    isLoading,
    error,
    loadServers,
    refreshAllStatuses,
    connectServer,
    disconnectServer,
    addServer,
    updateServer,
    removeServer
  } = useMCPServerStore();

  // Initialize MCP servers on mount
  useEffect(() => {
    loadServers();
  }, [loadServers]);

  // Auto-refresh statuses periodically
  useEffect(() => {
    const interval = setInterval(() => {
      refreshAllStatuses();
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [refreshAllStatuses]);

  // Get connected servers
  const getConnectedServers = useCallback(() => {
    return servers.filter(server => {
      const status = serverStatuses.get(server.name);
      return status?.status === "connected";
    });
  }, [servers, serverStatuses]);

  // Get available tools from all connected servers
  const getAvailableTools = useCallback(() => {
    const tools: Array<{ serverId: string; serverName: string; tools: string[] }> = [];

    servers.forEach(server => {
      const status = serverStatuses.get(server.name);
      if (status?.status === "connected" && status.tools && status.tools.length > 0) {
        tools.push({
          serverId: server.name,
          serverName: server.name,
          tools: status.tools
        });
      }
    });

    return tools;
  }, [servers, serverStatuses]);

  // Get available resources from all connected servers
  const getAvailableResources = useCallback(() => {
    const resources: Array<{ serverId: string; serverName: string; resources: string[] }> = [];

    servers.forEach(server => {
      const status = serverStatuses.get(server.name);
      if (status?.status === "connected" && status.resources && status.resources.length > 0) {
        resources.push({
          serverId: server.name,
          serverName: server.name,
          resources: status.resources
        });
      }
    });

    return resources;
  }, [servers, serverStatuses]);

  // Execute a tool on a specific server
  const executeTool = useCallback(async (serverName: string, toolName: string, params: Record<string, any>) => {
    const client = mcpClientManager.getServer(serverName);
    if (!client) {
      throw new Error(`Server ${serverName} is not connected`);
    }

    try {
      // This would be the actual MCP tool execution
      // Implementation depends on the MCP SDK
      console.log(`Executing tool ${toolName} on server ${serverName} with params:`, params);

      // Placeholder for actual tool execution
      // const result = await client.callTool(toolName, params);
      // return result;

      return { success: true, result: "Tool executed successfully" };
    } catch (error) {
      console.error(`Failed to execute tool ${toolName}:`, error);
      throw error;
    }
  }, []);

  // Get server statistics
  const getServerStats = useCallback(() => {
    const stats = {
      total: servers.length,
      connected: 0,
      disconnected: 0,
      error: 0,
      totalTools: 0,
      totalResources: 0
    };

    servers.forEach(server => {
      const status = serverStatuses.get(server.name);
      if (status) {
        switch (status.status) {
          case "connected":
            stats.connected++;
            break;
          case "error":
            stats.error++;
            break;
          default:
            stats.disconnected++;
        }

        if (status.tools) {
          stats.totalTools += status.tools.length;
        }
        if (status.resources) {
          stats.totalResources += status.resources.length;
        }
      } else {
        stats.disconnected++;
      }
    });

    return stats;
  }, [servers, serverStatuses]);

  // Check if MCP is properly initialized
  const isMCPReady = useCallback(() => {
    return servers.length > 0 && getConnectedServers().length > 0;
  }, [servers, getConnectedServers]);

  // Connect all enabled servers
  const connectAllEnabledServers = useCallback(async () => {
    const enabledServers = servers.filter(server => (server as any).enabled);

    const connectPromises = enabledServers.map(server =>
      connectServer(server.name).catch(error => console.error(`Failed to connect server ${server.name}:`, error))
    );

    await Promise.allSettled(connectPromises);
  }, [servers, connectServer]);

  // Disconnect all servers
  const disconnectAllServers = useCallback(async () => {
    const disconnectPromises = servers.map(server =>
      disconnectServer(server.name).catch(error => console.error(`Failed to disconnect server ${server.name}:`, error))
    );

    await Promise.allSettled(disconnectPromises);
  }, [servers, disconnectServer]);

  return {
    // State
    servers,
    serverStatuses,
    isLoading,
    error,

    // Computed values
    connectedServers: getConnectedServers(),
    availableTools: getAvailableTools(),
    availableResources: getAvailableResources(),
    serverStats: getServerStats(),
    isMCPReady: isMCPReady(),

    // Actions
    addServer,
    updateServer,
    removeServer,
    connectServer,
    disconnectServer,
    connectAllEnabledServers,
    disconnectAllServers,
    executeTool,
    refreshAllStatuses,
    loadServers
  };
};

/**
 * Hook for quickly checking MCP availability and stats
 */
export const useMCPStatus = () => {
  const { serverStats, isMCPReady, connectedServers } = useMCPIntegration();

  return {
    isReady: isMCPReady,
    stats: serverStats,
    hasConnectedServers: connectedServers.length > 0,
    connectedCount: connectedServers.length
  };
};

/**
 * Hook for accessing MCP tools
 */
export const useMCPTools = () => {
  const { availableTools, executeTool } = useMCPIntegration();

  const executeToolByName = useCallback(
    async (toolName: string, params: Record<string, any>) => {
      // Find the first server that has this tool
      for (const serverTools of availableTools) {
        if (serverTools.tools.includes(toolName)) {
          return await executeTool(serverTools.serverId, toolName, params);
        }
      }

      throw new Error(`Tool ${toolName} not found in any connected server`);
    },
    [availableTools, executeTool]
  );

  return {
    availableTools,
    executeTool,
    executeToolByName,
    hasTools: availableTools.length > 0
  };
};

/**
 * Hook for accessing MCP resources
 */
export const useMCPResources = () => {
  const { availableResources } = useMCPIntegration();

  return {
    availableResources,
    hasResources: availableResources.length > 0
  };
};
