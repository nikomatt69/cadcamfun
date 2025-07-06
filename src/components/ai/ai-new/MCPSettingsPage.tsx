// src/components/ai/ai-new/MCPSettingsPage.tsx
import React, { useState, useEffect } from "react";
import {
  Server,
  Database,
  Users,
  Zap,
  Cpu,
  RefreshCw,
  Plus,
  Settings,
  Trash2,
  CheckCircle,
  AlertCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  ToggleLeft,
  ToggleRight
} from "react-feather";
import { getMCPClient, MCPServerConfig } from "@/src/lib/ai/mcp/mcpOfficialClient";
import {
  useMCPServerStore,
  getConnectedServers,
  getServerStatus,
  initializeDefaultServers
} from "@/src/store/mcpServerStore";
import testClaudeMCPIntegration from "@/src/lib/ai/mcp/mcpOfficialClient";
interface MCPSettingsPanelProps {
  className?: string;
}

const MCPSettingsPanel: React.FC<MCPSettingsPanelProps> = ({ className = "" }) => {
  const {
    servers,
    serverStatuses,
    isLoading,
    error,
    showAddForm,
    editingServer,
    setShowAddForm,
    setEditingServer,
    addServer,
    updateServer,
    removeServer,
    connectServer,
    disconnectServer,
    refreshAllStatuses,
    testServerConnection,
    resetToDefaults,
    loadServers
  } = useMCPServerStore();

  const [insights, setInsights] = useState<any>({
    sessionId: "",
    contextSize: 0,
    connectedServers: 0,
    totalTools: 0,
    lastActivity: null
  });

  const [refreshStats, setRefreshStats] = useState(0);
  const [testResults, setTestResults] = useState<any>(null);
  const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set());
  const [newServerForm, setNewServerForm] = useState<Partial<MCPServerConfig>>({
    type: "url",
    name: "",
    url: "",
    tool_configuration: {
      enabled: true,
      allowed_tools: []
    }
  });

  // Initialize and load servers on mount
  useEffect(() => {
    const init = async () => {
      try {
        await initializeDefaultServers();
        await loadServers();
      } catch (error) {
        console.error("Failed to initialize MCP servers:", error);
      }
    };
    init();
  }, []);

  // Fetch insights from Claude MCP
  useEffect(() => {
    const mcpClient = getMCPClient();
    const connectedServers = getConnectedServers();

    try {
      const registeredServers = mcpClient.getRegisteredServers();
      const totalTools = registeredServers.reduce((acc, server) => {
        return acc + (server.tool_configuration?.allowed_tools?.length || 0);
      }, 0);

      setInsights({
        sessionId: `mcp_${Date.now()}`,
        contextSize: JSON.stringify(registeredServers).length,
        connectedServers: connectedServers.length,
        totalTools,
        lastActivity: new Date()
      });
    } catch (error) {
      console.error("Error fetching Claude MCP insights:", error);
    }
  }, [servers, refreshStats]);

  // Refresh insights
  const refreshInsights = () => {
    setRefreshStats(prev => prev + 1);
  };

  // Toggle server expansion
  const toggleServerExpansion = (serverName: string) => {
    setExpandedServers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(serverName)) {
        newSet.delete(serverName);
      } else {
        newSet.add(serverName);
      }
      return newSet;
    });
  };

  // Toggle server enabled state
  const toggleServerEnabled = async (serverName: string) => {
    const server = servers.find(s => s.name === serverName);
    if (!server) return;

    const newEnabledState = !(server.tool_configuration?.enabled ?? true);
    await updateServer(serverName, {
      tool_configuration: {
        ...server.tool_configuration,
        enabled: newEnabledState,
        allowed_tools: server.tool_configuration?.allowed_tools || []
      }
    });
  };

  // Toggle specific tool for a server
  const toggleTool = async (serverName: string, toolName: string) => {
    const server = servers.find(s => s.name === serverName);
    if (!server) return;

    const currentTools = server.tool_configuration?.allowed_tools || [];
    const newTools = currentTools.includes(toolName)
      ? currentTools.filter(t => t !== toolName)
      : [...currentTools, toolName];

    await updateServer(serverName, {
      tool_configuration: {
        enabled: server.tool_configuration?.enabled ?? true,
        allowed_tools: newTools
      }
    });
  };

  // Get all available tools for a server (default tools based on server type/name)
  const getAvailableToolsForServer = (server: MCPServerConfig): string[] => {
    const defaultToolsByServer: Record<string, string[]> = {
      "filesystem": ["readFile", "writeFile", "listFiles", "createDirectory", "deleteFile", "getFileInfo"],
      "web-search-tools": ["web_search", "search_with_context", "semantic_search"],
      "memory": [
        "mcp_memory_create_entities",
        "mcp_memory_create_relations",
        "mcp_memory_add_observations",
        "mcp_memory_delete_entities",
        "mcp_memory_delete_observations",
        "mcp_memory_delete_relations",
        "mcp_memory_read_graph",
        "mcp_memory_search_nodes",
        "mcp_memory_open_nodes"
      ],
      "sequential-thinking": [
        "thinking_create_session",
        "thinking_add_step",
        "thinking_get_session",
        "thinking_list_sessions"
      ]
    };

    // Return configured tools or default tools for known servers
    return server.tool_configuration?.allowed_tools || defaultToolsByServer[server.name] || [];
  };

  // Handle form submission for new server
  const handleAddServer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newServerForm.name || !newServerForm.type) {
      return;
    }

    try {
      await addServer(newServerForm as MCPServerConfig);
      setNewServerForm({
        type: "url",
        name: "",
        url: "",
        tool_configuration: {
          enabled: true,
          allowed_tools: []
        }
      });
      setShowAddForm(false);
    } catch (error) {
      console.error("Failed to add server:", error);
    }
  };

  // Handle form submission for editing server
  const handleEditServer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingServer || !editingServer.name) {
      return;
    }

    try {
      // Create update object with only the fields that can be modified
      const updateData: Partial<MCPServerConfig> = {
        tool_configuration: editingServer.tool_configuration
      };

      // For URL servers, allow URL and authorization token updates
      if (editingServer.type === "url") {
        if (editingServer.url) {
          updateData.url = editingServer.url;
        }
        if ((editingServer as any).authorization_token !== undefined) {
          (updateData as any).authorization_token = (editingServer as any).authorization_token;
        }
      }

      // For stdio servers, allow command and args updates
      if (editingServer.type === "stdio") {
        if ((editingServer as any).command) {
          (updateData as any).command = (editingServer as any).command;
        }
        if ((editingServer as any).args) {
          (updateData as any).args = (editingServer as any).args;
        }
        if ((editingServer as any).workingDirectory) {
          (updateData as any).workingDirectory = (editingServer as any).workingDirectory;
        }
      }

      await updateServer(editingServer.name, updateData);
      setEditingServer(null);
    } catch (error) {
      console.error("Failed to update server:", error);
    }
  };

  // Test integration

  // Get status icon
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "connected":
        return <CheckCircle size={16} className="text-green-500" />;
      case "error":
        return <AlertCircle size={16} className="text-red-500" />;
      case "connecting":
        return <Clock size={16} className="text-yellow-500" />;
      default:
        return <AlertCircle size={16} className="text-gray-400" />;
    }
  };

  return (
    <div
      className={`p-4 bg-white dark:bg-gray-800 rounded-lg border border-blue-100 dark:border-blue-900 ${className}`}
    >
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center">
          <Server className="text-blue-500 mr-2" size={20} />
          <h3 className="text-lg font-medium">Claude MCP Settings</h3>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={refreshInsights}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
            title="Refresh Stats"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
          <div className="flex items-center text-xs text-blue-700 dark:text-blue-300 font-medium mb-1">
            <Database size={12} className="mr-1" />
            Context Size
          </div>
          <p className="text-lg font-semibold text-blue-800 dark:text-blue-200">
            {(insights.contextSize / 1024).toFixed(2)} KB
          </p>
        </div>

        <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
          <div className="flex items-center text-xs text-green-700 dark:text-green-300 font-medium mb-1">
            <Server size={12} className="mr-1" />
            Connected Servers
          </div>
          <p className="text-lg font-semibold text-green-800 dark:text-green-200">{insights.connectedServers}</p>
        </div>

        <div className="bg-purple-50 dark:bg-purple-900/20 p-3 rounded-lg">
          <div className="flex items-center text-xs text-purple-700 dark:text-purple-300 font-medium mb-1">
            <Zap size={12} className="mr-1" />
            Available Tools
          </div>
          <p className="text-lg font-semibold text-purple-800 dark:text-purple-200">{insights.totalTools}</p>
        </div>

        <div className="bg-orange-50 dark:bg-orange-900/20 p-3 rounded-lg">
          <div className="flex items-center text-xs text-orange-700 dark:text-orange-300 font-medium mb-1">
            <Cpu size={12} className="mr-1" />
            Total Servers
          </div>
          <p className="text-lg font-semibold text-orange-800 dark:text-orange-200">{servers.length}</p>
        </div>
      </div>

      {/* Test Results */}
      {testResults && (
        <div
          className={`mb-4 p-3 rounded-lg ${
            testResults.success
              ? "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800"
              : "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
          }`}
        >
          <div className="flex items-center">
            {testResults.success ? (
              <CheckCircle size={16} className="text-green-600 dark:text-green-400 mr-2" />
            ) : (
              <AlertCircle size={16} className="text-red-600 dark:text-red-400 mr-2" />
            )}
            <span
              className={`text-sm font-medium ${
                testResults.success ? "text-green-800 dark:text-green-200" : "text-red-800 dark:text-red-200"
              }`}
            >
              {testResults.message}
            </span>
          </div>
          {testResults.details && (
            <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
              <pre className="whitespace-pre-wrap">{JSON.stringify(testResults.details, null, 2)}</pre>
            </div>
          )}
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-center">
            <AlertCircle size={16} className="text-red-600 dark:text-red-400 mr-2" />
            <span className="text-sm text-red-800 dark:text-red-200">{error}</span>
          </div>
        </div>
      )}

      {/* Server Management */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h4 className="text-md font-medium text-gray-800 dark:text-gray-200">MCP Servers</h4>
          <div className="flex space-x-2">
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 flex items-center"
            >
              <Plus size={14} className="mr-1" />
              Add Server
            </button>
            <button
              onClick={resetToDefaults}
              className="px-3 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700"
            >
              Reset Defaults
            </button>
            <button
              onClick={refreshAllStatuses}
              disabled={isLoading}
              className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-50"
            >
              {isLoading ? "Refreshing..." : "Refresh All"}
            </button>
          </div>
        </div>

        {/* Add Server Form */}
        {showAddForm && (
          <form onSubmit={handleAddServer} className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Server Name</label>
                <input
                  type="text"
                  value={newServerForm.name || ""}
                  onChange={e => setNewServerForm({ ...newServerForm, name: e.target.value })}
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-gray-100"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Server Type</label>
                <select
                  value={newServerForm.type || "url"}
                  onChange={e => setNewServerForm({ ...newServerForm, type: e.target.value as "url" | "stdio" })}
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-gray-100"
                >
                  <option value="url">URL Server</option>
                  <option value="stdio">Stdio Server</option>
                </select>
              </div>
              {newServerForm.type === "url" && (
                <>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Server URL
                    </label>
                    <input
                      type="url"
                      value={newServerForm.url || ""}
                      onChange={e => setNewServerForm({ ...newServerForm, url: e.target.value })}
                      className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-gray-100"
                      placeholder="https://your-mcp-server.com"
                      required
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Authorization Token (optional)
                    </label>
                    <input
                      type="password"
                      value={(newServerForm as any).authorization_token || ""}
                      onChange={e => setNewServerForm({ ...newServerForm, authorization_token: e.target.value })}
                      className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-gray-100"
                      placeholder="Bearer token or API key"
                    />
                  </div>
                </>
              )}
              {newServerForm.type === "stdio" && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Command</label>
                    <input
                      type="text"
                      value={(newServerForm as any).command || ""}
                      onChange={e => setNewServerForm({ ...newServerForm, command: e.target.value })}
                      className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-gray-100"
                      placeholder="npx"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Arguments (comma-separated)
                    </label>
                    <input
                      type="text"
                      onChange={e => {
                        const args = e.target.value
                          .split(",")
                          .map(arg => arg.trim())
                          .filter(Boolean);
                        setNewServerForm({ ...newServerForm, args });
                      }}
                      className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-gray-100"
                      placeholder="-y, @modelcontextprotocol/server-filesystem, /path/to/dir"
                    />
                  </div>
                </>
              )}

              {/* Tool Configuration */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Server Configuration
                </label>
                <div className="space-y-2">
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={newServerForm.tool_configuration?.enabled ?? true}
                      onChange={e =>
                        setNewServerForm({
                          ...newServerForm,
                          tool_configuration: {
                            ...newServerForm.tool_configuration,
                            enabled: e.target.checked,
                            allowed_tools: newServerForm.tool_configuration?.allowed_tools || []
                          }
                        })
                      }
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Enable server by default</span>
                  </label>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Custom Tools (comma-separated, optional)
                    </label>
                    <input
                      type="text"
                      value={newServerForm.tool_configuration?.allowed_tools?.join(", ") || ""}
                      onChange={e => {
                        const tools = e.target.value
                          .split(",")
                          .map(tool => tool.trim())
                          .filter(Boolean);
                        setNewServerForm({
                          ...newServerForm,
                          tool_configuration: {
                            enabled: newServerForm.tool_configuration?.enabled ?? true,
                            allowed_tools: tools
                          }
                        });
                      }}
                      className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-gray-100"
                      placeholder="readFile, writeFile, listFiles (leave empty for defaults)"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Leave empty to use default tools for the server type. You can configure tools after adding the
                      server.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end space-x-2 mt-4">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 rounded"
              >
                Cancel
              </button>
              <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                Add Server
              </button>
            </div>
          </form>
        )}

        {/* Edit Server Form */}
        {editingServer && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                  Edit Server: {editingServer.name}
                </h3>
              </div>
              <form onSubmit={handleEditServer} className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Server Name - Read Only */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Server Name (Read-only)
                    </label>
                    <input
                      type="text"
                      value={editingServer.name}
                      disabled
                      className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                    />
                  </div>

                  {/* Server Type - Read Only */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Server Type (Read-only)
                    </label>
                    <input
                      type="text"
                      value={editingServer.type}
                      disabled
                      className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                    />
                  </div>

                  {/* URL field for URL servers */}
                  {editingServer.type === "url" && (
                    <>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Server URL
                        </label>
                        <input
                          type="url"
                          value={editingServer.url || ""}
                          onChange={e => setEditingServer({ ...editingServer, url: e.target.value })}
                          className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-gray-100"
                          placeholder="https://your-mcp-server.com"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Authorization Token (optional)
                        </label>
                        <input
                          type="password"
                          value={(editingServer as any).authorization_token || ""}
                          onChange={e =>
                            setEditingServer({ ...editingServer, authorization_token: e.target.value } as any)
                          }
                          className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-gray-100"
                          placeholder="Bearer token or API key"
                        />
                      </div>
                    </>
                  )}

                  {/* Command and args for stdio servers */}
                  {editingServer.type === "stdio" && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Command
                        </label>
                        <input
                          type="text"
                          value={(editingServer as any).command || ""}
                          onChange={e => setEditingServer({ ...editingServer, command: e.target.value } as any)}
                          className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-gray-100"
                          placeholder="npx"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Arguments (comma-separated)
                        </label>
                        <input
                          type="text"
                          value={((editingServer as any).args || []).join(", ")}
                          onChange={e => {
                            const args = e.target.value
                              .split(",")
                              .map(arg => arg.trim())
                              .filter(Boolean);
                            setEditingServer({ ...editingServer, args } as any);
                          }}
                          className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-gray-100"
                          placeholder="-y, @modelcontextprotocol/server-filesystem, /path/to/dir"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Working Directory (optional)
                        </label>
                        <input
                          type="text"
                          value={(editingServer as any).workingDirectory || ""}
                          onChange={e =>
                            setEditingServer({ ...editingServer, workingDirectory: e.target.value } as any)
                          }
                          className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-gray-100"
                          placeholder="/path/to/working/directory"
                        />
                      </div>
                    </>
                  )}

                  {/* Tool Configuration */}
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Server Configuration
                    </label>
                    <div className="space-y-3">
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={editingServer.tool_configuration?.enabled ?? true}
                          onChange={e =>
                            setEditingServer({
                              ...editingServer,
                              tool_configuration: {
                                ...editingServer.tool_configuration,
                                enabled: e.target.checked,
                                allowed_tools: editingServer.tool_configuration?.allowed_tools || []
                              }
                            })
                          }
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">Enable server</span>
                      </label>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Allowed Tools (comma-separated)
                        </label>
                        <input
                          type="text"
                          value={editingServer.tool_configuration?.allowed_tools?.join(", ") || ""}
                          onChange={e => {
                            const tools = e.target.value
                              .split(",")
                              .map(tool => tool.trim())
                              .filter(Boolean);
                            setEditingServer({
                              ...editingServer,
                              tool_configuration: {
                                enabled: editingServer.tool_configuration?.enabled ?? true,
                                allowed_tools: tools
                              }
                            });
                          }}
                          className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-gray-100"
                          placeholder="readFile, writeFile, listFiles"
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          You can also use the tool checkboxes in the expanded server view for easier management.
                        </p>
                      </div>

                      {/* Quick tool presets */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Quick Presets
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const defaultTools = getAvailableToolsForServer(editingServer);
                              setEditingServer({
                                ...editingServer,
                                tool_configuration: {
                                  enabled: editingServer.tool_configuration?.enabled ?? true,
                                  allowed_tools: defaultTools
                                }
                              });
                            }}
                            className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                          >
                            All Default Tools
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingServer({
                                ...editingServer,
                                tool_configuration: {
                                  enabled: editingServer.tool_configuration?.enabled ?? true,
                                  allowed_tools: []
                                }
                              });
                            }}
                            className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                          >
                            No Tools
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    type="button"
                    onClick={() => setEditingServer(null)}
                    className="px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Server List */}
        <div className="space-y-3">
          {servers.map(server => {
            const status = serverStatuses.get(server.name);
            const isExpanded = expandedServers.has(server.name);
            const isServerEnabled = server.tool_configuration?.enabled ?? true;
            const availableTools = getAvailableToolsForServer(server);
            const enabledTools = server.tool_configuration?.allowed_tools || [];

            return (
              <div
                key={server.name}
                className={`border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 transition-all ${
                  isServerEnabled ? "" : "opacity-60"
                }`}
              >
                <div className="p-3">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => toggleServerExpansion(server.name)}
                          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                        >
                          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </button>

                        {getStatusIcon(status?.status || "disconnected")}

                        <h5 className="text-sm font-medium text-gray-800 dark:text-gray-200">{server.name}</h5>

                        <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-800/30 text-blue-800 dark:text-blue-300 rounded text-xs">
                          {server.type}
                        </span>

                        {/* Server Enable/Disable Toggle */}
                        <button
                          onClick={() => toggleServerEnabled(server.name)}
                          className={`p-1 rounded transition-colors ${
                            isServerEnabled
                              ? "text-green-500 hover:text-green-600"
                              : "text-gray-400 hover:text-gray-500"
                          }`}
                          title={isServerEnabled ? "Disable Server" : "Enable Server"}
                        >
                          {isServerEnabled ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                        </button>
                      </div>

                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400 ml-6">
                        {server.type === "url" && server.url && <div>URL: {server.url}</div>}
                        {server.type === "stdio" && server.command && (
                          <div>
                            Command: {server.command} {(server.args || []).join(" ")}
                          </div>
                        )}
                        {status?.lastConnected && <div>Last connected: {status.lastConnected.toLocaleString()}</div>}
                        <div>
                          Tools: {enabledTools.length}/{availableTools.length} enabled
                        </div>
                        {status?.errorMessage && <div className="text-red-500">Error: {status.errorMessage}</div>}
                      </div>
                    </div>

                    <div className="flex space-x-1">
                      <button
                        onClick={() => testServerConnection(server.name)}
                        className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 rounded"
                        title="Test Connection"
                      >
                        <RefreshCw size={14} />
                      </button>
                      <button
                        onClick={() => setEditingServer(server)}
                        className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 rounded"
                        title="Edit Server"
                      >
                        <Settings size={14} />
                      </button>
                      <button
                        onClick={() => removeServer(server.name)}
                        className="p-1 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 rounded"
                        title="Remove Server"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded Tools Section */}
                {isExpanded && (
                  <div className="border-t border-gray-200 dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-700/50">
                    <h6 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                      Available Tools ({availableTools.length})
                    </h6>

                    {availableTools.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {availableTools.map(tool => {
                          const isToolEnabled = enabledTools.includes(tool);
                          return (
                            <label
                              key={tool}
                              className={`flex items-center space-x-2 p-2 rounded cursor-pointer transition-colors ${
                                isServerEnabled
                                  ? "hover:bg-gray-100 dark:hover:bg-gray-600"
                                  : "cursor-not-allowed opacity-50"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isToolEnabled}
                                onChange={() => isServerEnabled && toggleTool(server.name, tool)}
                                disabled={!isServerEnabled}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                              <span className="text-sm text-gray-700 dark:text-gray-300">{tool}</span>
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500 dark:text-gray-400 italic">
                        No tools available for this server
                      </div>
                    )}

                    {/* Bulk Actions */}
                    {availableTools.length > 0 && isServerEnabled && (
                      <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600 flex space-x-2">
                        <button
                          onClick={async () => {
                            await updateServer(server.name, {
                              tool_configuration: {
                                enabled: true,
                                allowed_tools: availableTools
                              }
                            });
                          }}
                          className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                        >
                          Enable All
                        </button>
                        <button
                          onClick={async () => {
                            await updateServer(server.name, {
                              tool_configuration: {
                                enabled: true,
                                allowed_tools: []
                              }
                            });
                          }}
                          className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                        >
                          Disable All
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {servers.length === 0 && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <Server size={48} className="mx-auto mb-4 opacity-50" />
            <p>No Claude MCP servers configured</p>
            <p className="text-sm">Click Add Server or Reset Defaults to get started</p>
          </div>
        )}
      </div>

      {/* Session Info */}
      <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-700">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-gray-600 dark:text-gray-400">
          <div>
            <span className="font-medium">Session ID:</span>
            <span className="ml-2 font-mono">{insights.sessionId}</span>
          </div>
          <div>
            <span className="font-medium">Last Activity:</span>
            <span className="ml-2">{insights.lastActivity ? insights.lastActivity.toLocaleString() : "None"}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MCPSettingsPanel;
