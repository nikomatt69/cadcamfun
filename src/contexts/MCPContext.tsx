// src/contexts/MCPContext.tsx
import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { MCPServerConfig, mcpClientManager } from "../lib/mcp/client";

type MCPContextType = {
  servers: MCPServerConfig[];
  isLoading: boolean;
  error: string | null;
  refreshServers: () => Promise<void>;
  addServer: (config: Omit<MCPServerConfig, "id">) => Promise<MCPServerConfig>;
  updateServer: (id: string, config: Partial<MCPServerConfig>) => Promise<void>;
  deleteServer: (id: string) => Promise<void>;
};

const MCPContext = createContext<MCPContextType>({
  servers: [],
  isLoading: false,
  error: null,
  refreshServers: async () => {},
  addServer: async () => ({ id: "", name: "", type: "stdio", command: "", enabled: true }),
  updateServer: async () => {},
  deleteServer: async () => {}
});

export function useMCP() {
  return useContext(MCPContext);
}

type MCPProviderProps = {
  children: ReactNode;
};

export function MCPProvider({ children }: MCPProviderProps) {
  const [servers, setServers] = useState<MCPServerConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshServers = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/mcp/config");

      if (!response.ok) {
        throw new Error("Failed to fetch MCP servers");
      }

      const data = await response.json();
      setServers(data);

      // Update the client manager with the fetched configurations
      mcpClientManager.setConfigurations(data);
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const addServer = async (config: Omit<MCPServerConfig, "id">): Promise<MCPServerConfig> => {
    try {
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

      const newServer = await response.json();

      // Update local state
      setServers([...servers, newServer]);

      // Add to client manager
      if (newServer.enabled) {
        await mcpClientManager.connectServer(newServer);
      }

      return newServer;
    } catch (err: any) {
      setError(err.message || "An error occurred");
      throw err;
    }
  };

  const updateServer = async (id: string, config: Partial<MCPServerConfig>): Promise<void> => {
    try {
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

      const updatedServer = await response.json();

      // Update local state
      setServers(servers.map(server => (server.id === id ? updatedServer : server)));

      // Update in client manager
      await mcpClientManager.updateServerConfiguration(id, config);
    } catch (err: any) {
      setError(err.message || "An error occurred");
      throw err;
    }
  };

  const deleteServer = async (id: string): Promise<void> => {
    try {
      const response = await fetch(`/api/mcp/config/${id}`, {
        method: "DELETE"
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete server");
      }

      // Update local state
      setServers(servers.filter(server => server.id !== id));

      // Remove from client manager
      mcpClientManager.removeServerConfiguration(id);
    } catch (err: any) {
      setError(err.message || "An error occurred");
      throw err;
    }
  };

  // Load servers on mount
  useEffect(() => {
    refreshServers();

    // Clean up on unmount
    return () => {
      mcpClientManager.disconnectAll();
    };
  }, []);

  const value = {
    servers,
    isLoading,
    error,
    refreshServers,
    addServer,
    updateServer,
    deleteServer
  };

  return <MCPContext.Provider value={value}>{children}</MCPContext.Provider>;
}
