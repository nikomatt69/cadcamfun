import React, { useState, useEffect } from "react";
import { MCPServerConfig } from "../lib/mcp/client";
import { MCPServerStatus } from "../store/mcpServerStore";

interface MCPServerDetailsProps {
  server: MCPServerConfig;
  status: MCPServerStatus;
}

const MCPServerDetails: React.FC<MCPServerDetailsProps> = ({ server, status }) => {
  const [activeTab, setActiveTab] = useState<"overview" | "tools" | "resources" | "logs">("overview");
  const [logs, setLogs] = useState<Array<{ timestamp: Date; level: string; message: string }>>([]);

  // Mock logs for demonstration - in real implementation, these would come from the server
  useEffect(() => {
    const mockLogs = [
      { timestamp: new Date(), level: "info", message: "Server initialized successfully" },
      { timestamp: new Date(Date.now() - 60000), level: "info", message: "Connection established" },
      { timestamp: new Date(Date.now() - 120000), level: "debug", message: "Loading server configuration" }
    ];
    setLogs(mockLogs);
  }, [server.id]);

  const getStatusBadge = () => {
    const statusConfig = {
      connected: { bg: "bg-green-100", text: "text-green-800", label: "Connected" },
      connecting: { bg: "bg-yellow-100", text: "text-yellow-800", label: "Connecting" },
      disconnected: { bg: "bg-gray-100", text: "text-gray-800", label: "Disconnected" },
      error: { bg: "bg-red-100", text: "text-red-800", label: "Error" }
    };

    const config = statusConfig[status.status] || statusConfig.disconnected;

    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}
      >
        {config.label}
      </span>
    );
  };

  const TabButton: React.FC<{ id: string; label: string; count?: number }> = ({ id, label, count }) => (
    <button
      onClick={() => setActiveTab(id as any)}
      className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
        activeTab === id ? "bg-blue-100 text-blue-700" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
      }`}
    >
      {label}
      {count !== undefined && (
        <span
          className={`ml-2 px-2 py-0.5 text-xs rounded-full ${
            activeTab === id ? "bg-blue-200 text-blue-800" : "bg-gray-200 text-gray-600"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-medium text-gray-900">{server.name}</h3>
            <p className="text-sm text-gray-500 mt-1">{server.type.toUpperCase()} Server</p>
          </div>
          {getStatusBadge()}
        </div>
      </div>

      {/* Tabs */}
      <div className="px-6 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex space-x-1">
          <TabButton id="overview" label="Overview" />
          <TabButton id="tools" label="Tools" count={status.tools?.length || 0} />
          <TabButton id="resources" label="Resources" count={status.resources?.length || 0} />
          <TabButton id="logs" label="Logs" count={logs.length} />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Basic Info */}
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-3">Server Information</h4>
              <dl className="space-y-2">
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-500">Type:</dt>
                  <dd className="text-sm text-gray-900">{server.type.toUpperCase()}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-500">Status:</dt>
                  <dd className="text-sm text-gray-900">{status.status}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-500">Enabled:</dt>
                  <dd className="text-sm text-gray-900">{server.enabled ? "Yes" : "No"}</dd>
                </div>
                {status.lastConnected && (
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-500">Last Connected:</dt>
                    <dd className="text-sm text-gray-900">{status.lastConnected.toLocaleString()}</dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Connection Details */}
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-3">Connection Details</h4>
              <dl className="space-y-2">
                {server.type === "sse" && (
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-500">URL:</dt>
                    <dd className="text-sm text-gray-900 break-all">{(server as any).url}</dd>
                  </div>
                )}
                {server.type === "stdio" && (
                  <>
                    <div className="flex justify-between">
                      <dt className="text-sm text-gray-500">Command:</dt>
                      <dd className="text-sm text-gray-900 break-all">{(server as any).command}</dd>
                    </div>
                    {(server as any).args && (server as any).args.length > 0 && (
                      <div className="flex justify-between">
                        <dt className="text-sm text-gray-500">Arguments:</dt>
                        <dd className="text-sm text-gray-900">{(server as any).args.join(" ")}</dd>
                      </div>
                    )}
                    {(server as any).workingDirectory && (
                      <div className="flex justify-between">
                        <dt className="text-sm text-gray-500">Working Directory:</dt>
                        <dd className="text-sm text-gray-900 break-all">{(server as any).workingDirectory}</dd>
                      </div>
                    )}
                  </>
                )}
              </dl>
            </div>

            {/* Error Info */}
            {status.errorMessage && (
              <div>
                <h4 className="text-sm font-medium text-red-900 mb-3">Error Information</h4>
                <div className="bg-red-50 border border-red-200 rounded-md p-3">
                  <p className="text-sm text-red-700">{status.errorMessage}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "tools" && (
          <div>
            <h4 className="text-sm font-medium text-gray-900 mb-3">Available Tools</h4>
            {status.tools && status.tools.length > 0 ? (
              <div className="space-y-2">
                {status.tools.map((tool, index) => (
                  <div key={index} className="p-3 bg-gray-50 rounded-md">
                    <p className="text-sm font-medium text-gray-900">{tool}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 7.172V5L8 4z"
                  />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-900">No tools available</h3>
                <p className="mt-1 text-sm text-gray-500">
                  {status.status === "connected"
                    ? "This server does not expose any tools."
                    : "Connect to the server to see available tools."}
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === "resources" && (
          <div>
            <h4 className="text-sm font-medium text-gray-900 mb-3">Available Resources</h4>
            {status.resources && status.resources.length > 0 ? (
              <div className="space-y-2">
                {status.resources.map((resource, index) => (
                  <div key={index} className="p-3 bg-gray-50 rounded-md">
                    <p className="text-sm font-medium text-gray-900">{resource}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                  />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-900">No resources available</h3>
                <p className="mt-1 text-sm text-gray-500">
                  {status.status === "connected"
                    ? "This server does not expose any resources."
                    : "Connect to the server to see available resources."}
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === "logs" && (
          <div>
            <h4 className="text-sm font-medium text-gray-900 mb-3">Server Logs</h4>
            {logs.length > 0 ? (
              <div className="space-y-2">
                {logs.map((log, index) => (
                  <div key={index} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-md">
                    <div className="flex-shrink-0">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          log.level === "error"
                            ? "bg-red-100 text-red-800"
                            : log.level === "warn"
                              ? "bg-yellow-100 text-yellow-800"
                              : log.level === "info"
                                ? "bg-blue-100 text-blue-800"
                                : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {log.level.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900">{log.message}</p>
                      <p className="text-xs text-gray-500 mt-1">{log.timestamp.toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-900">No logs available</h3>
                <p className="mt-1 text-sm text-gray-500">Server logs will appear here when available.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MCPServerDetails;
