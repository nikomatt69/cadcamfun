import React from "react";
import { X, Server, CheckCircle, Zap, Layers } from "react-feather";
import { useMCPServerStore } from "@/src/store/mcpServerStore";
import { MCPServerConfig } from "@/src/lib/ai/mcp/mcpOfficialClient";

interface MCPToolsStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ActiveServer extends MCPServerConfig {
  status: string;
  enabledTools: string[];
}

const MCPToolsStatusModal: React.FC<MCPToolsStatusModalProps> = ({ isOpen, onClose }) => {
  const { servers, serverStatuses } = useMCPServerStore();

  if (!isOpen) {
    return null;
  }

  const activeServers: ActiveServer[] = servers
    .map(server => {
      const status = serverStatuses.get(server.name);
      return {
        ...server,
        status: status?.status || "disconnected",
        enabledTools: server.tool_configuration?.allowed_tools || []
      };
    })
    .filter(server => server.status === "connected" && server.tool_configuration?.enabled);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 transition-opacity duration-300 ease-in-out">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <Layers size={18} className="text-blue-500 mr-2" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Active MCP Tools</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto">
          {activeServers.length > 0 ? (
            activeServers.map(server => (
              <div
                key={server.name}
                className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-700/50"
              >
                <div className="flex items-center mb-2">
                  <Server size={16} className="text-blue-500 mr-2" />
                  <h4 className="text-md font-semibold text-gray-800 dark:text-gray-200 mr-2">{server.name}</h4>
                  <CheckCircle size={16} className="text-green-500" />
                </div>
                {server.enabledTools.length > 0 ? (
                  <ul className="space-y-1 pl-4">
                    {server.enabledTools.map(tool => (
                      <li key={tool} className="flex items-center text-sm text-gray-600 dark:text-gray-300">
                        <Zap size={14} className="text-purple-500 mr-2 flex-shrink-0" />
                        <span>{tool}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400 pl-4 italic">
                    No specific tools enabled for this server (may use default tools or operate without named tools).
                  </p>
                )}
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <Layers size={40} className="mx-auto mb-3 opacity-50" />
              <p className="font-medium">No Active MCP Tools</p>
              <p className="text-sm">Ensure MCP servers are connected and enabled in the MCP Settings.</p>
            </div>
          )}
        </div>

        {/* Footer (optional, for actions like refresh or link to settings) */}
        <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default MCPToolsStatusModal;
