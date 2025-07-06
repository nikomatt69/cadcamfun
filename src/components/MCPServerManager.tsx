import React, { useEffect, useState } from "react";
import { useMCPServerStore } from "../store/mcpServerStore";
import MCPServerForm from "./MCPServerForm";
import MCPServerCard from "./MCPServerCard";
import MCPServerDetails from "./MCPServerDetails";
import { MCPServerConfig, MCPStdioServerConfig, MCPSseConfig } from "../lib/mcp/client";

const MCPServerManager: React.FC = () => {
  const {
    servers,
    serverStatuses,
    isLoading,
    error,
    showAddForm,
    editingServer,
    selectedServerId,
    addServer,
    updateServer,
    removeServer,
    connectServer,
    disconnectServer,
    setShowAddForm,
    setEditingServer,
    setSelectedServerId,
    setError,
    loadServers,
    refreshAllStatuses
  } = useMCPServerStore();

  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "connected" | "disconnected" | "error">("all");

  useEffect(() => {
    loadServers();
  }, [loadServers]);

  // Auto-refresh server statuses every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      refreshAllStatuses();
    }, 30000);

    return () => clearInterval(interval);
  }, [refreshAllStatuses]);

  const filteredServers = servers.filter(server => {
    const matchesSearch = server.name.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    if (filterStatus === "all") return true;

    const status = serverStatuses.get(server.name);
    return status?.status === filterStatus;
  });

  const handleAddServer = async (serverConfig: any) => {
    try {
      await addServer(serverConfig);
    } catch (error) {
      console.error("Failed to add server:", error);
    }
  };

  const handleUpdateServer = async (serverConfig: any) => {
    if (!editingServer) return;

    try {
      await updateServer(editingServer.name, serverConfig);
    } catch (error) {
      console.error("Failed to update server:", error);
    }
  };

  const selectedServer = selectedServerId ? servers.find(s => s.name === selectedServerId) : null;
  const selectedServerStatus = selectedServerId ? serverStatuses.get(selectedServerId) : null;

  if (isLoading && servers.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <span className="ml-3 text-gray-600">Loading MCP servers...</span>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">MCP Server Management</h2>
            <p className="text-sm text-gray-600 mt-1">
              Manage Model Context Protocol servers for enhanced AI capabilities
            </p>
          </div>
          <button
            onClick={() => setShowAddForm(true)}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            Add Server
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
            <div className="ml-auto">
              <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="flex-1">
            <div className="relative">
              <input
                type="text"
                placeholder="Search servers..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
            </div>
          </div>

          {/* Filter */}
          <div className="sm:w-48">
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Status</option>
              <option value="connected">Connected</option>
              <option value="disconnected">Disconnected</option>
              <option value="error">Error</option>
            </select>
          </div>

          {/* Refresh Button */}
          <button
            onClick={refreshAllStatuses}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex h-96">
        {/* Server List */}
        <div className="w-1/2 border-r border-gray-200 overflow-y-auto">
          {filteredServers.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              {servers.length === 0 ? (
                <div>
                  <svg
                    className="mx-auto h-12 w-12 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                    />
                  </svg>
                  <h3 className="mt-2 text-sm font-medium text-gray-900">No MCP servers</h3>
                  <p className="mt-1 text-sm text-gray-500">Get started by adding your first MCP server.</p>
                </div>
              ) : (
                <div>
                  <p>No servers match your search criteria.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {filteredServers.map(server => (
                <MCPServerCard
                  key={server.name}
                  server={server as any}
                  status={serverStatuses.get(server.name)}
                  isSelected={selectedServerId === server.name}
                  onSelect={() => setSelectedServerId(server.name)}
                  onEdit={() => setEditingServer(server)}
                  onDelete={() => removeServer(server.name)}
                  onConnect={() => connectServer(server.name)}
                  onDisconnect={() => disconnectServer(server.name)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Server Details */}
        <div className="w-1/2 overflow-y-auto">
          {selectedServer && selectedServerStatus ? (
            <MCPServerDetails server={selectedServer as any} status={selectedServerStatus} />
          ) : (
            <div className="p-6 text-center text-gray-500">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">No server selected</h3>
              <p className="mt-1 text-sm text-gray-500">Select a server from the list to view details.</p>
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Form Modal */}
      {(showAddForm || editingServer) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">
                {editingServer ? "Edit MCP Server" : "Add New MCP Server"}
              </h3>
            </div>
            <div className="p-6">
              <MCPServerForm
                initialValues={editingServer ? (editingServer as any) : undefined}
                onSubmit={editingServer ? handleUpdateServer : handleAddServer}
                onCancel={() => {
                  setShowAddForm(false);
                  setEditingServer(null);
                }}
                isSubmitting={isLoading}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MCPServerManager;
