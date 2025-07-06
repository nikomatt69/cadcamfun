// src/components/MCPServerWithStatus.tsx
import React, { useState } from "react";
import { useMCPServerStatus } from "../hooks/useMCPServerStatus";
import { useMCPResource } from "../hooks/useMCPResource";
import { useMCPTool } from "../hooks/useMCPTool";
import MCPServerSelector from "./MCPServerSelector";

export default function MCPServerWithStatus() {
  const [selectedServerId, setSelectedServerId] = useState<string>("");
  const [echoInput, setEchoInput] = useState<string>("");
  const [enablePolling, setEnablePolling] = useState<boolean>(false); // Disabled by default

  // Use the server status hook with conditional polling
  const {
    status,
    statusMessage,
    isChecking,
    error: statusError,
    startServer,
    stopServer,
    checkStatus,
    startPolling,
    stopPolling
  } = useMCPServerStatus(enablePolling ? selectedServerId : null, {
    pollInterval: 30000, // Poll every 30 seconds when enabled
    autoStart: false // Don't auto-start
  });

  // Use the resource hook to get server status with conditional refresh
  const {
    data: statusData,
    isLoading: statusLoading,
    error: resourceError,
    refresh: refreshStatus
  } = useMCPResource(
    selectedServerId,
    "resource://status",
    { refreshInterval: enablePolling ? 60000 : 0 } // Only refresh when polling enabled
  );

  // Use the tool hook for the echo tool
  const {
    execute: executeEcho,
    result: echoResult,
    isLoading: echoLoading,
    error: echoError,
    reset: resetEcho
  } = useMCPTool<{ result: string }>(selectedServerId, "echo");

  // Handle echo form submit
  const handleEchoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!echoInput.trim()) return;

    try {
      await executeEcho({ text: echoInput });
    } catch (error) {
      console.error("Echo error:", error);
    }
  };

  // Handle polling toggle
  const handlePollingToggle = () => {
    setEnablePolling(!enablePolling);
  };

  return (
    <div className="p-4 space-y-6">
      <div className="space-y-2">
        <h2 className="text-xl font-bold">MCP Server Control</h2>

        <div className="flex space-x-2 items-end">
          <div className="flex-grow">
            <label className="block text-sm font-medium text-gray-700 mb-1">Select MCP Server</label>
            <MCPServerSelector value={selectedServerId} onChange={setSelectedServerId} showType={true} />
          </div>

          <div className="flex items-center space-x-2">
            <label className="flex items-center text-sm">
              <input type="checkbox" checked={enablePolling} onChange={handlePollingToggle} className="mr-1" />
              Auto-polling
            </label>
          </div>

          <div className="space-x-2">
            <button
              onClick={() => startServer()}
              disabled={!selectedServerId || isChecking || status === "running"}
              className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded disabled:opacity-50"
            >
              Start
            </button>

            <button
              onClick={() => stopServer()}
              disabled={!selectedServerId || isChecking || status === "stopped"}
              className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded disabled:opacity-50"
            >
              Stop
            </button>

            <button
              onClick={() => checkStatus()}
              disabled={!selectedServerId || isChecking}
              className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded disabled:opacity-50"
            >
              {enablePolling ? "Refresh" : "Check"}
            </button>
          </div>
        </div>
      </div>

      {/* Server Status Information */}
      {selectedServerId && (
        <div className="border rounded-lg p-4 bg-gray-50">
          <h3 className="text-lg font-semibold mb-2">Server Status</h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="font-medium">Status API:</h4>
              <div className="mt-1 text-sm">
                <div className="flex items-center">
                  <div
                    className={`w-3 h-3 rounded-full mr-2 ${
                      status === "running"
                        ? "bg-green-500"
                        : status === "started"
                          ? "bg-yellow-500"
                          : status === "error"
                            ? "bg-red-500"
                            : "bg-gray-500"
                    }`}
                  />
                  <span className="capitalize">{status}</span>
                  {isChecking && <span className="ml-2 text-xs text-gray-500 animate-pulse">Checking...</span>}
                </div>

                {statusMessage && <div className="mt-1 text-xs text-gray-600">{statusMessage}</div>}

                {statusError && <div className="mt-1 text-xs text-red-600">{statusError}</div>}
              </div>
            </div>

            <div>
              <h4 className="font-medium">Resource Status:</h4>
              <div className="mt-1 text-sm">
                {statusLoading ? (
                  <span className="text-xs text-gray-500 animate-pulse">Loading...</span>
                ) : statusData ? (
                  <div>
                    <div className="text-green-600">Available</div>
                    <div className="mt-1 text-xs text-gray-600">
                      {typeof statusData === "object" && statusData !== null ? (
                        <pre className="whitespace-pre-wrap overflow-auto max-h-32 text-xs">
                          {JSON.stringify(statusData, null, 2)}
                        </pre>
                      ) : (
                        String(statusData)
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-gray-500">No data available</div>
                )}

                {resourceError && <div className="mt-1 text-xs text-red-600">{resourceError}</div>}

                <button
                  onClick={() => refreshStatus()}
                  disabled={statusLoading || !selectedServerId}
                  className="mt-2 px-2 py-1 text-xs bg-gray-200 hover:bg-gray-300 rounded disabled:opacity-50"
                >
                  Refresh
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Echo Tool Testing */}
      {selectedServerId && status === "running" && (
        <div className="border rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-2">Test Echo Tool</h3>

          <form onSubmit={handleEchoSubmit} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Text to Echo</label>
              <input
                type="text"
                value={echoInput}
                onChange={e => setEchoInput(e.target.value)}
                className="w-full p-2 border rounded"
                placeholder="Enter text to echo"
                disabled={echoLoading}
              />
            </div>

            <div className="flex space-x-2">
              <button
                type="submit"
                disabled={!echoInput.trim() || echoLoading}
                className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded disabled:opacity-50"
              >
                Echo
              </button>

              <button
                type="button"
                onClick={resetEcho}
                className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded"
              >
                Reset
              </button>
            </div>
          </form>

          {echoResult && (
            <div className="mt-4">
              <h4 className="font-medium">Result:</h4>
              <div className="mt-1 p-3 bg-gray-100 rounded">{echoResult.result}</div>
            </div>
          )}

          {echoError && <div className="mt-3 text-sm text-red-600">Error: {echoError}</div>}
        </div>
      )}
    </div>
  );
}
