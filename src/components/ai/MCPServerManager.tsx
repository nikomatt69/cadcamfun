// src/components/ai/MCPServerManager.tsx
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Server,
  Check,
  X,
  AlertCircle,
  Settings,
  Trash2,
  Edit3,
  TestTube,
  Eye,
  EyeOff,
  ExternalLink,
  RefreshCw,
  Terminal
} from "lucide-react";
import toast from "react-hot-toast";

interface MCPServer {
  id: string;
  name: string;
  type: "url" | "stdio";
  // URL server fields
  url?: string;
  authorization_token?: string;
  // STDIO server fields
  command?: string;
  args?: string[];
  workingDirectory?: string;
  // Common fields
  enabled: boolean;
  tool_configuration?: {
    enabled: boolean;
    allowed_tools?: string[];
  };
  status?: "connected" | "disconnected" | "testing" | "error";
  lastTested?: Date;
  availableTools?: string[];
  description?: string;
}

interface MCPServerManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onServersChange?: (servers: MCPServer[]) => void;
}

const DEFAULT_SERVERS: MCPServer[] = [
  {
    id: "filesystem-server",
    name: "Filesystem Server",
    type: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "~/Users/"],
    workingDirectory: process.cwd(),
    enabled: true,
    description: "Local filesystem access for file operations",
    tool_configuration: {
      enabled: true,
      allowed_tools: ["read_file", "write_file", "create_directory", "list_directory"]
    }
  },
  {
    id: "cad-tools",
    name: "CAD Tools",
    type: "url",
    url: process.env.NEXT_PUBLIC_MCP_CAD_SERVER_URL || "https://cad-tools-mcp.example.com",
    enabled: true,
    description: "CAD geometry creation, analysis, and validation tools",
    tool_configuration: {
      enabled: true,
      allowed_tools: [
        "create-geometry",
        "analyze-design",
        "validate-constraints",
        "optimize-topology",
        "calculate-properties"
      ]
    }
  },
  {
    id: "analysis-tools",
    name: "Analysis Tools",
    type: "url",
    url: process.env.NEXT_PUBLIC_MCP_ANALYSIS_SERVER_URL || "https://analysis-tools-mcp.example.com",
    enabled: true,
    description: "Advanced engineering analysis and simulation tools",
    tool_configuration: {
      enabled: true,
      allowed_tools: ["stress-analysis", "thermal-analysis", "modal-analysis", "optimization-suggestions"]
    }
  }
];

export const MCPServerManager: React.FC<MCPServerManagerProps> = ({ isOpen, onClose, onServersChange }) => {
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [editingServer, setEditingServer] = useState<MCPServer | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [testingServers, setTestingServers] = useState<Set<string>>(new Set());
  const [showTokens, setShowTokens] = useState<Set<string>>(new Set());

  // Form state for new/editing server
  const [formData, setFormData] = useState<Partial<MCPServer>>({
    name: "",
    type: "url",
    enabled: true,
    description: "",
    tool_configuration: {
      enabled: true,
      allowed_tools: []
    }
  });

  // Load servers from localStorage on mount
  useEffect(() => {
    const savedServers = localStorage.getItem("mcp-servers");
    if (savedServers) {
      try {
        const parsed = JSON.parse(savedServers);
        setServers(parsed);
      } catch (error) {
        console.error("Error loading saved MCP servers:", error);
        setServers(DEFAULT_SERVERS);
      }
    } else {
      setServers(DEFAULT_SERVERS);
    }
  }, []);

  // Save servers to localStorage when servers change
  useEffect(() => {
    if (servers.length > 0) {
      localStorage.setItem("mcp-servers", JSON.stringify(servers));
      onServersChange?.(servers);
    }
  }, [servers, onServersChange]);

  const handleAddServer = () => {
    if (!formData.name) {
      toast.error("Server name is required");
      return;
    }

    if (formData.type === "url" && !formData.url) {
      toast.error("URL is required for URL servers");
      return;
    }

    if (formData.type === "stdio" && !formData.command) {
      toast.error("Command is required for STDIO servers");
      return;
    }

    const newServer: MCPServer = {
      id: formData.id || `server-${Date.now()}`,
      name: formData.name,
      type: formData.type || "url",
      enabled: formData.enabled ?? true,
      description: formData.description,
      tool_configuration: formData.tool_configuration || {
        enabled: true,
        allowed_tools: []
      },
      ...(formData.type === "url"
        ? {
            url: formData.url,
            authorization_token: formData.authorization_token
          }
        : {
            command: formData.command,
            args: formData.args || [],
            workingDirectory: formData.workingDirectory
          })
    };

    if (editingServer) {
      setServers(prev => prev.map(s => (s.id === editingServer.id ? newServer : s)));
      setEditingServer(null);
      toast.success("Server updated successfully");
    } else {
      setServers(prev => [...prev, newServer]);
      toast.success("Server added successfully");
    }

    resetForm();
  };

  const handleEditServer = (server: MCPServer) => {
    setFormData(server);
    setEditingServer(server);
    setShowAddForm(true);
  };

  const handleDeleteServer = (serverId: string) => {
    setServers(prev => prev.filter(s => s.id !== serverId));
    toast.success("Server deleted successfully");
  };

  const handleTestServer = async (server: MCPServer) => {
    setTestingServers(prev => new Set(Array.from(prev).concat(server.id)));

    try {
      let result;

      if (server.type === "stdio") {
        // Test STDIO server through API
        const response = await fetch("/api/mcp/stdio-server-status", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            serverId: server.id,
            command: server.command,
            args: server.args,
            workingDirectory: server.workingDirectory
          })
        });

        const data = await response.json();
        result = {
          success: response.ok,
          message: data.message || (response.ok ? "STDIO server connected" : "STDIO server failed"),
          availableTools: data.tools || []
        };
      } else {
        // Test URL server
        const response = await fetch("/api/mcp/test-connection", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            type: "url",
            url: server.url,
            authorization_token: server.authorization_token
          })
        });

        const data = await response.json();
        result = {
          success: response.ok,
          message: data.message || (response.ok ? "URL server connected" : "URL server failed"),
          availableTools: data.tools || []
        };
      }

      setServers(prev =>
        prev.map(s =>
          s.id === server.id
            ? {
                ...s,
                status: result.success ? "connected" : "error",
                lastTested: new Date(),
                availableTools: result.availableTools || []
              }
            : s
        )
      );

      if (result.success) {
        toast.success(`${server.name}: ${result.message}`);
      } else {
        toast.error(`${server.name}: ${result.message}`);
      }
    } catch (error) {
      setServers(prev => prev.map(s => (s.id === server.id ? { ...s, status: "error", lastTested: new Date() } : s)));
      toast.error(`Failed to test ${server.name}: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setTestingServers(prev => {
        const newSet = new Set(Array.from(prev));
        newSet.delete(server.id);
        return newSet;
      });
    }
  };

  const handleTestAllServers = async () => {
    const enabledServers = servers.filter(s => s.enabled);

    for (const server of enabledServers) {
      await handleTestServer(server);
      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    toast.success("All servers tested");
  };

  const resetForm = () => {
    setFormData({
      name: "",
      type: "url",
      enabled: true,
      description: "",
      tool_configuration: {
        enabled: true,
        allowed_tools: []
      }
    });
    setShowAddForm(false);
    setEditingServer(null);
  };

  const toggleShowToken = (serverId: string) => {
    setShowTokens(prev => {
      const newSet = new Set(prev);
      if (newSet.has(serverId)) {
        newSet.delete(serverId);
      } else {
        newSet.add(serverId);
      }
      return newSet;
    });
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case "connected":
        return <Check className="w-4 h-4 text-green-500" />;
      case "error":
        return <X className="w-4 h-4 text-red-500" />;
      case "testing":
        return <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-400 dark:text-gray-500" />;
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case "connected":
        return "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700 text-green-800 dark:text-green-300";
      case "error":
        return "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700 text-red-800 dark:text-red-300";
      case "testing":
        return "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700 text-blue-800 dark:text-blue-300";
      default:
        return "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-200";
    }
  };

  const getTypeIcon = (type: string) => {
    return type === "stdio" ? (
      <Terminal className="w-4 h-4 text-purple-500" />
    ) : (
      <ExternalLink className="w-4 h-4 text-blue-500" />
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden border border-gray-200 dark:border-gray-700"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-700 dark:to-indigo-700 text-white p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Server size={24} />
              <div>
                <h2 className="text-xl font-semibold">MCP Server Manager</h2>
                <p className="text-blue-100 dark:text-blue-200 text-sm">
                  Manage Model Context Protocol servers and tools
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleTestAllServers}
                className="flex items-center gap-2 px-3 py-2 bg-blue-500 hover:bg-blue-400 dark:bg-blue-600 dark:hover:bg-blue-500 rounded-lg transition-colors text-sm"
              >
                <TestTube size={16} />
                Test All
              </button>
              <button
                onClick={onClose}
                className="p-2 hover:bg-blue-500 dark:hover:bg-blue-600 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>
          </div>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)] bg-white dark:bg-gray-800">
          {/* Add Server Button */}
          {!showAddForm && (
            <div className="mb-6">
              <button
                onClick={() => setShowAddForm(true)}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 dark:bg-green-700 text-white rounded-lg hover:bg-green-700 dark:hover:bg-green-600 transition-colors"
              >
                <Plus size={16} />
                Add MCP Server
              </button>
            </div>
          )}

          {/* Add/Edit Server Form */}
          <AnimatePresence>
            {showAddForm && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-6 bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600"
              >
                <h3 className="text-lg font-semibold mb-4 text-gray-800 dark:text-gray-200">
                  {editingServer ? "Edit Server" : "Add New MCP Server"}
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Server Name *
                    </label>
                    <input
                      type="text"
                      value={formData.name || ""}
                      onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g., Custom CAD Tools"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Server Type *
                    </label>
                    <select
                      value={formData.type || "url"}
                      onChange={e => setFormData(prev => ({ ...prev, type: e.target.value as "url" | "stdio" }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    >
                      <option value="url">URL Server</option>
                      <option value="stdio">STDIO Server</option>
                    </select>
                  </div>

                  {formData.type === "url" ? (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Server URL *
                        </label>
                        <input
                          type="url"
                          value={formData.url || ""}
                          onChange={e => setFormData(prev => ({ ...prev, url: e.target.value }))}
                          placeholder="https://your-mcp-server.com"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Authorization Token
                        </label>
                        <input
                          type="password"
                          value={formData.authorization_token || ""}
                          onChange={e => setFormData(prev => ({ ...prev, authorization_token: e.target.value }))}
                          placeholder="OAuth token (if required)"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Command *
                        </label>
                        <input
                          type="text"
                          value={formData.command || ""}
                          onChange={e => setFormData(prev => ({ ...prev, command: e.target.value }))}
                          placeholder="npx @modelcontextprotocol/server-filesystem"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Arguments (comma-separated)
                        </label>
                        <input
                          type="text"
                          value={formData.args?.join(", ") || ""}
                          onChange={e =>
                            setFormData(prev => ({
                              ...prev,
                              args: e.target.value
                                .split(",")
                                .map(s => s.trim())
                                .filter(Boolean)
                            }))
                          }
                          placeholder="/path/to/directory"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Working Directory
                        </label>
                        <input
                          type="text"
                          value={formData.workingDirectory || ""}
                          onChange={e => setFormData(prev => ({ ...prev, workingDirectory: e.target.value }))}
                          placeholder="/path/to/working/directory"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        />
                      </div>
                    </>
                  )}

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Description
                    </label>
                    <textarea
                      value={formData.description || ""}
                      onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Brief description of server capabilities"
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    />
                  </div>

                  <div className="flex items-center">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.enabled ?? true}
                        onChange={e => setFormData(prev => ({ ...prev, enabled: e.target.checked }))}
                        className="mr-2"
                      />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Enable Server</span>
                    </label>
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-4">
                  <button
                    onClick={resetForm}
                    className="px-4 py-2 text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddServer}
                    className="px-4 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors"
                  >
                    {editingServer ? "Update Server" : "Add Server"}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Servers List */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                Configured Servers ({servers.length})
              </h3>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {servers.filter(s => s.enabled).length} enabled
              </div>
            </div>

            {servers.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <Server size={48} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                <p>No MCP servers configured</p>
                <p className="text-sm">Add your first server to get started</p>
              </div>
            ) : (
              servers.map(server => (
                <motion.div
                  key={server.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`border rounded-lg p-4 ${getStatusColor(server.status)}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        {getStatusIcon(server.status)}
                        {getTypeIcon(server.type)}
                        <h4 className="font-semibold text-lg">{server.name}</h4>
                        <span className="text-xs bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 px-2 py-1 rounded">
                          {server.type.toUpperCase()}
                        </span>
                        {!server.enabled && (
                          <span className="px-2 py-1 bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 text-xs rounded">
                            DISABLED
                          </span>
                        )}
                      </div>

                      <div className="space-y-1 text-sm">
                        <div className="flex items-center gap-2">
                          {server.type === "url" ? (
                            <>
                              <ExternalLink size={14} />
                              <span className="font-mono text-xs">{server.url}</span>
                            </>
                          ) : (
                            <>
                              <Terminal size={14} />
                              <span className="font-mono text-xs">
                                {server.command} {server.args?.join(" ")}
                              </span>
                            </>
                          )}
                        </div>

                        {server.description && <p className="text-gray-600 dark:text-gray-400">{server.description}</p>}

                        {server.lastTested && (
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Last tested: {server.lastTested.toLocaleString()}
                          </p>
                        )}

                        {server.availableTools && server.availableTools.length > 0 && (
                          <div className="mt-2">
                            <p className="text-xs font-medium mb-1">Available Tools:</p>
                            <div className="flex flex-wrap gap-1">
                              {server.availableTools.slice(0, 5).map((tool, index) => (
                                <span
                                  key={index}
                                  className="px-2 py-1 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-xs rounded"
                                >
                                  {tool}
                                </span>
                              ))}
                              {server.availableTools.length > 5 && (
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  +{server.availableTools.length - 5} more
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        {server.authorization_token && (
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-xs">Token:</span>
                            {showTokens.has(server.id) ? (
                              <span className="font-mono text-xs">{server.authorization_token}</span>
                            ) : (
                              <span className="font-mono text-xs">{"•".repeat(20)}</span>
                            )}
                            <button
                              onClick={() => toggleShowToken(server.id)}
                              className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                            >
                              {showTokens.has(server.id) ? <EyeOff size={12} /> : <Eye size={12} />}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleTestServer(server)}
                        disabled={testingServers.has(server.id)}
                        className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-lg transition-colors disabled:opacity-50"
                        title="Test Connection"
                      >
                        {testingServers.has(server.id) ? (
                          <RefreshCw size={16} className="animate-spin" />
                        ) : (
                          <TestTube size={16} />
                        )}
                      </button>

                      <button
                        onClick={() => handleEditServer(server)}
                        className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        title="Edit Server"
                      >
                        <Edit3 size={16} />
                      </button>

                      <button
                        onClick={() => handleDeleteServer(server.id)}
                        className="p-2 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-lg transition-colors"
                        title="Delete Server"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default MCPServerManager;
