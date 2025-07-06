import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getMCPClient, MCPServerConfig, MCPOfficialClient } from "@/src/lib/ai/mcp/mcpOfficialClient";

export interface MCPServerStatus {
  id: string;
  status: "connected" | "disconnected" | "error" | "connecting";
  lastConnected?: Date;
  errorMessage?: string;
  tools?: string[];
  resources?: string[];
  serverType?: "url" | "stdio";
}

interface MCPServerStoreState {
  servers: MCPServerConfig[];
  serverStatuses: Map<string, MCPServerStatus>;
  isLoading: boolean;
  error: string | null;

  // UI State
  showAddForm: boolean;
  editingServer: MCPServerConfig | null;
  selectedServerId: string | null;

  // Actions - Updated for Claude MCP only
  addServer: (server: MCPServerConfig) => Promise<void>;
  updateServer: (name: string, updates: Partial<MCPServerConfig>) => Promise<void>;
  removeServer: (name: string) => Promise<void>;
  connectServer: (name: string) => Promise<void>;
  disconnectServer: (name: string) => Promise<void>;
  refreshServerStatus: (name: string) => Promise<void>;
  refreshAllStatuses: () => Promise<void>;
  testServerConnection: (name: string) => Promise<{ success: boolean; message: string }>;

  // UI Actions
  setShowAddForm: (show: boolean) => void;
  setEditingServer: (server: MCPServerConfig | null) => void;
  setSelectedServerId: (id: string | null) => void;
  setError: (error: string | null) => void;

  // Load and persist
  loadServers: () => Promise<void>;
  persistServers: () => Promise<void>;
  resetToDefaults: () => Promise<void>;
}

export const useMCPServerStore = create<MCPServerStoreState>()(
  persist(
    (set, get) => ({
      servers: [],
      serverStatuses: new Map(),
      isLoading: false,
      error: null,
      showAddForm: false,
      editingServer: null,
      selectedServerId: null,

      addServer: async (serverConfig: MCPServerConfig) => {
        try {
          set({ isLoading: true, error: null });

          const mcpClient = getMCPClient();

          // Register server with Claude MCP client
          mcpClient.registerMCPServer(serverConfig as MCPServerConfig);

          set(state => ({
            servers: [...state.servers, serverConfig as MCPServerConfig],
            isLoading: false,
            showAddForm: false
          }));

          // Try to connect if it's a functional server
          try {
            await get().connectServer(serverConfig.name);
          } catch (connectError) {
            console.warn(`Could not auto-connect server ${serverConfig.name}:`, connectError);
          }

          await get().persistServers();
        } catch (error) {
          console.error("Failed to add server:", error);
          set({
            error: error instanceof Error ? error.message : "Failed to add server",
            isLoading: false
          });
        }
      },

      updateServer: async (name, updates) => {
        try {
          set({ isLoading: true, error: null });

          const mcpClient = getMCPClient();
          const existingServer = mcpClient.getServer(name);

          if (!existingServer) {
            throw new Error(`Server ${name} not found`);
          }

          const updatedServer = { ...existingServer, ...updates };

          // Re-register updated server
          mcpClient.registerMCPServer(updatedServer);

          set(state => ({
            servers: state.servers.map(server => (server.name === name ? updatedServer : server)),
            isLoading: false,
            editingServer: null
          }));

          await get().refreshServerStatus(name);
          await get().persistServers();
        } catch (error) {
          console.error("Failed to update server:", error);
          set({
            error: error instanceof Error ? error.message : "Failed to update server",
            isLoading: false
          });
        }
      },

      removeServer: async name => {
        try {
          set({ isLoading: true, error: null });

          // Remove from state
          set(state => {
            const newStatuses = new Map(state.serverStatuses);
            newStatuses.delete(name);

            return {
              servers: state.servers.filter(server => server.name !== name),
              serverStatuses: newStatuses,
              isLoading: false,
              selectedServerId: state.selectedServerId === name ? null : state.selectedServerId
            };
          });

          await get().persistServers();
        } catch (error) {
          console.error("Failed to remove server:", error);
          set({
            error: error instanceof Error ? error.message : "Failed to remove server",
            isLoading: false
          });
        }
      },

      connectServer: async name => {
        const server = get().servers.find(s => s.name === name);
        if (!server) {
          return;
        }

        try {
          set(state => {
            const newStatuses = new Map(state.serverStatuses);
            newStatuses.set(name, {
              id: name,
              status: "connecting",
              serverType: server.type
            });
            return { serverStatuses: newStatuses };
          });

          const mcpClient = getMCPClient();
          const testResult = await mcpClient.testMCPConnection(name);

          set(state => {
            const newStatuses = new Map(state.serverStatuses);
            newStatuses.set(name, {
              id: name,
              status: testResult.success ? "connected" : "error",
              lastConnected: testResult.success ? new Date() : undefined,
              errorMessage: testResult.success ? undefined : testResult.message,
              tools: testResult.availableTools || [],
              serverType: server.type
            });
            return { serverStatuses: newStatuses };
          });
        } catch (error) {
          set(state => {
            const newStatuses = new Map(state.serverStatuses);
            newStatuses.set(name, {
              id: name,
              status: "error",
              errorMessage: error instanceof Error ? error.message : "Connection failed",
              serverType: server.type
            });
            return { serverStatuses: newStatuses };
          });
        }
      },

      disconnectServer: async name => {
        try {
          // For Claude MCP, we just update status since connections are managed internally
          set(state => {
            const newStatuses = new Map(state.serverStatuses);
            const existing = newStatuses.get(name);
            newStatuses.set(name, {
              ...existing,
              id: name,
              status: "disconnected"
            });
            return { serverStatuses: newStatuses };
          });
        } catch (error) {
          // Silent error handling
        }
      },

      refreshServerStatus: async name => {
        const server = get().servers.find(s => s.name === name);
        if (!server) return;

        try {
          const mcpClient = getMCPClient();
          const testResult = await mcpClient.testMCPConnection(name);

          set(state => {
            const newStatuses = new Map(state.serverStatuses);
            newStatuses.set(name, {
              id: name,
              status: testResult.success ? "connected" : "error",
              lastConnected: testResult.success ? new Date() : state.serverStatuses.get(name)?.lastConnected,
              errorMessage: testResult.success ? undefined : testResult.message,
              tools: testResult.availableTools || [],
              serverType: server.type
            });
            return { serverStatuses: newStatuses };
          });
        } catch (error) {
          set(state => {
            const newStatuses = new Map(state.serverStatuses);
            newStatuses.set(name, {
              id: name,
              status: "error",
              errorMessage: error instanceof Error ? error.message : "Status check failed",
              serverType: server.type
            });
            return { serverStatuses: newStatuses };
          });
        }
      },

      refreshAllStatuses: async () => {
        const { servers } = get();

        set({ isLoading: true });

        try {
          const mcpClient = getMCPClient();
          const registeredServers = mcpClient.getRegisteredServers();

          // Update statuses for all servers
          const statusPromises = servers.map(async server => {
            try {
              const testResult = await mcpClient.testMCPConnection(server.name);
              return {
                name: server.name,
                status: {
                  id: server.name,
                  status: testResult.success ? "connected" : "error",
                  lastConnected: testResult.success ? new Date() : undefined,
                  errorMessage: testResult.success ? undefined : testResult.message,
                  tools: testResult.availableTools || [],
                  serverType: server.type
                } as MCPServerStatus
              };
            } catch (error) {
              return {
                name: server.name,
                status: {
                  id: server.name,
                  status: "error",
                  errorMessage: error instanceof Error ? error.message : "Connection test failed",
                  serverType: server.type
                } as MCPServerStatus
              };
            }
          });

          const results = await Promise.all(statusPromises);

          set(state => {
            const newStatuses = new Map(state.serverStatuses);
            results.forEach(({ name, status }) => {
              newStatuses.set(name, status);
            });
            return {
              serverStatuses: newStatuses,
              isLoading: false
            };
          });
        } catch (error) {
          console.error("Failed to refresh all statuses:", error);
          set({
            error: "Failed to refresh server statuses",
            isLoading: false
          });
        }
      },

      testServerConnection: async name => {
        try {
          const mcpClient = getMCPClient();
          const result = await mcpClient.testMCPConnection(name);
          return {
            success: result.success,
            message: result.message
          };
        } catch (error) {
          return {
            success: false,
            message: error instanceof Error ? error.message : "Test failed"
          };
        }
      },

      setShowAddForm: show => set({ showAddForm: show }),
      setEditingServer: server => set({ editingServer: server }),
      setSelectedServerId: id => set({ selectedServerId: id }),
      setError: error => set({ error }),

      loadServers: async () => {
        try {
          set({ isLoading: true });

          const mcpClient = getMCPClient();
          const registeredServers = mcpClient.getRegisteredServers();

          set({
            servers: registeredServers,
            isLoading: false
          });

          // Refresh statuses after loading
          await get().refreshAllStatuses();
        } catch (error) {
          console.error("Failed to load servers:", error);
          set({
            error: "Failed to load servers",
            isLoading: false
          });
        }
      },

      persistServers: async () => {
        try {
          const { servers } = get();
          // For Claude MCP, servers are managed by the client itself
          // We just persist the configuration for UI state
          localStorage.setItem("claude_mcp_servers", JSON.stringify(servers));
        } catch (error) {
          console.error("Failed to persist servers:", error);
        }
      },

      resetToDefaults: async () => {
        try {
          set({ isLoading: true, error: null });

          const mcpClient = getMCPClient();

          // Setup default servers (this calls the existing method)
          mcpClient.setupDefaultMCPServers();

          // Load the default servers into state
          const defaultServers = mcpClient.getRegisteredServers();

          set({
            servers: defaultServers,
            isLoading: false
          });

          // Test all connections
          await get().refreshAllStatuses();
          await get().persistServers();

          console.log("🔄 Reset to default Claude MCP servers");
        } catch (error) {
          console.error("Failed to reset to defaults:", error);
          set({
            error: "Failed to reset to default servers",
            isLoading: false
          });
        }
      }
    }),
    {
      name: "claude-mcp-servers",
      partialize: state => ({
        servers: state.servers,
        selectedServerId: state.selectedServerId
      })
    }
  )
);

// Helper functions for easier access
export const getConnectedServers = (): string[] => {
  const { serverStatuses } = useMCPServerStore.getState();
  return Array.from(serverStatuses.entries())
    .filter(([_, status]) => status.status === "connected")
    .map(([name, _]) => name);
};

export const getServerStatus = (name: string): MCPServerStatus | undefined => {
  const { serverStatuses } = useMCPServerStore.getState();
  return serverStatuses.get(name);
};

export const isServerConnected = (name: string): boolean => {
  const status = getServerStatus(name);
  return status?.status === "connected";
};

// Initialize default servers on first load
export const initializeDefaultServers = async () => {
  const store = useMCPServerStore.getState();

  if (store.servers.length === 0) {
    try {
      await store.resetToDefaults();
    } catch (error) {
      // Silent error handling
    }
  }
};
