import React from "react";
import { MCPServerConfig } from "../lib/mcp/client";
import { MCPServerStatus } from "../store/mcpServerStore";

interface MCPServerCardProps {
  server: MCPServerConfig;
  status?: MCPServerStatus;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
}

const MCPServerCard: React.FC<MCPServerCardProps> = ({
  server,
  status,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
  onConnect,
  onDisconnect
}) => {
  const getStatusIcon = () => {
    switch (status?.status) {
      case "connected":
        return (
          <div className="flex items-center text-green-600">
            <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
            <span className="text-xs font-medium">Connected</span>
          </div>
        );
      case "connecting":
        return (
          <div className="flex items-center text-yellow-600">
            <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse mr-2"></div>
            <span className="text-xs font-medium">Connecting</span>
          </div>
        );
      case "error":
        return (
          <div className="flex items-center text-red-600">
            <div className="w-2 h-2 bg-red-500 rounded-full mr-2"></div>
            <span className="text-xs font-medium">Error</span>
          </div>
        );
      default:
        return (
          <div className="flex items-center text-gray-500">
            <div className="w-2 h-2 bg-gray-400 rounded-full mr-2"></div>
            <span className="text-xs font-medium">Disconnected</span>
          </div>
        );
    }
  };

  const getTypeIcon = () => {
    if (server.type === "sse") {
      return (
        <div className="flex items-center text-blue-600">
          <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9v-9m0-9v9"
            />
          </svg>
          <span className="text-xs">SSE</span>
        </div>
      );
    } else {
      return (
        <div className="flex items-center text-purple-600">
          <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <span className="text-xs">STDIO</span>
        </div>
      );
    }
  };

  return (
    <div
      className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
        isSelected ? "bg-blue-50 border-r-2 border-blue-500" : ""
      }`}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-900 truncate">{server.name}</h3>
            {!server.enabled && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                Disabled
              </span>
            )}
          </div>

          {/* Server Info */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              {getTypeIcon()}
              {getStatusIcon()}
            </div>

            {server.type === "sse" && <p className="text-xs text-gray-500 truncate">{(server as any).url}</p>}

            {server.type === "stdio" && <p className="text-xs text-gray-500 truncate">{(server as any).command}</p>}
          </div>

          {/* Error Message */}
          {status?.errorMessage && (
            <div className="mt-2">
              <p className="text-xs text-red-600 truncate" title={status.errorMessage}>
                {status.errorMessage}
              </p>
            </div>
          )}

          {/* Last Connected */}
          {status?.lastConnected && (
            <div className="mt-1">
              <p className="text-xs text-gray-400">Last connected: {status.lastConnected.toLocaleString()}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="ml-2 flex items-center space-x-1">
          {/* Connect/Disconnect */}
          {server.enabled && (
            <>
              {status?.status === "connected" ? (
                <button
                  onClick={e => {
                    e.stopPropagation();
                    onDisconnect();
                  }}
                  className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                  title="Disconnect"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18.364 5.636M5.636 18.364l12.728-12.728"
                    />
                  </svg>
                </button>
              ) : (
                <button
                  onClick={e => {
                    e.stopPropagation();
                    onConnect();
                  }}
                  className="p-1 text-gray-400 hover:text-green-600 transition-colors"
                  title="Connect"
                  disabled={status?.status === "connecting"}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </button>
              )}
            </>
          )}

          {/* Edit */}
          <button
            onClick={e => {
              e.stopPropagation();
              onEdit();
            }}
            className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
            title="Edit"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
          </button>

          {/* Delete */}
          <button
            onClick={e => {
              e.stopPropagation();
              if (window.confirm(`Are you sure you want to delete "${server.name}"?`)) {
                onDelete();
              }
            }}
            className="p-1 text-gray-400 hover:text-red-600 transition-colors"
            title="Delete"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default MCPServerCard;
