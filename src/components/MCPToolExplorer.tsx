// Tool explorer component

// src/components/MCPToolExplorer.tsx
import { useState, useEffect } from "react";
import { useMCP } from "../contexts/MCPContext";
import MCPServerSelector from "./MCPServerSelector";

export default function MCPToolExplorer() {
  const [selectedServerId, setSelectedServerId] = useState("");
  const [tools, setTools] = useState<any[]>([]);
  const [selectedTool, setSelectedTool] = useState<any | null>(null);
  const [parameters, setParameters] = useState<Record<string, any>>({});
  const [result, setResult] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleServerChange = (serverId: string) => {
    setSelectedServerId(serverId);
    setSelectedTool(null);
    setParameters({});
    setResult(null);
  };

  // Fetch server tools
  useEffect(() => {
    if (!selectedServerId) {
      setTools([]);
      return;
    }

    async function fetchTools() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/mcp/server-info", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            serverId: selectedServerId
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to fetch tools");
        }

        const data = await response.json();
        const fetchedTools = data.tools;
        if (Array.isArray(fetchedTools)) {
          setTools(fetchedTools);
        } else if (typeof fetchedTools === "object" && fetchedTools !== null) {
          // Convert object of tools to an array of its values
          setTools(Object.values(fetchedTools));
        } else {
          setTools([]);
        }
      } catch (err: any) {
        setError(err.message || "An error occurred");
      } finally {
        setIsLoading(false);
      }
    }

    fetchTools();
  }, [selectedServerId]);

  const handleSelectTool = (tool: any) => {
    setSelectedTool(tool);

    // Initialize parameters based on tool schema
    const initialParams: Record<string, any> = {};
    if (tool.parameters?.properties) {
      Object.entries(tool.parameters.properties).forEach(([key, value]: [string, any]) => {
        // Set default values based on type
        if (value.type === "string") {
          initialParams[key] = "";
        } else if (value.type === "number") {
          initialParams[key] = 0;
        } else if (value.type === "boolean") {
          initialParams[key] = false;
        } else if (value.type === "object") {
          initialParams[key] = {};
        } else if (value.type === "array") {
          initialParams[key] = [];
        }
      });
    }

    setParameters(initialParams);
    setResult(null);
  };

  const handleParameterChange = (key: string, value: any) => {
    setParameters({
      ...parameters,
      [key]: value
    });
  };

  const handleExecuteTool = async () => {
    if (!selectedTool) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/mcp/tool", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          serverId: selectedServerId,
          toolName: selectedTool.name,
          parameters
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to execute tool");
      }

      const data = await response.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  // Render parameter input based on type
  const renderParameterInput = (key: string, schema: any) => {
    const type = schema.type;

    if (type === "string") {
      return (
        <input
          type="text"
          value={parameters[key] || ""}
          onChange={e => handleParameterChange(key, e.target.value)}
          className="w-full p-2 border rounded"
        />
      );
    } else if (type === "number") {
      return (
        <input
          type="number"
          value={parameters[key] || 0}
          onChange={e => handleParameterChange(key, Number(e.target.value))}
          className="w-full p-2 border rounded"
        />
      );
    } else if (type === "boolean") {
      return (
        <input
          type="checkbox"
          checked={parameters[key] || false}
          onChange={e => handleParameterChange(key, e.target.checked)}
          className="mr-2"
        />
      );
    } else if (type === "object" || type === "array") {
      return (
        <textarea
          value={JSON.stringify(parameters[key] || (type === "object" ? {} : []), null, 2)}
          onChange={e => {
            try {
              handleParameterChange(key, JSON.parse(e.target.value));
            } catch (err) {
              // Ignore parse errors while typing
            }
          }}
          className="w-full p-2 border rounded font-mono text-sm"
          rows={5}
        />
      );
    }

    return (
      <input
        type="text"
        value={parameters[key] || ""}
        onChange={e => handleParameterChange(key, e.target.value)}
        className="w-full p-2 border rounded"
      />
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-gray-700 mb-1">MCP Server</label>
        <MCPServerSelector value={selectedServerId} onChange={handleServerChange} />
      </div>

      {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">{error}</div>}

      {isLoading && !result ? (
        <div className="text-gray-500">Loading...</div>
      ) : selectedServerId && tools.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1">
            <h3 className="text-lg font-semibold mb-2">Available Tools</h3>
            <ul className="border rounded divide-y">
              {tools.map((tool, index) => (
                <li
                  key={index}
                  className={`p-3 hover:bg-gray-50 cursor-pointer ${
                    selectedTool?.name === tool.name ? "bg-blue-50" : ""
                  }`}
                  onClick={() => handleSelectTool(tool)}
                >
                  <div className="font-medium">{tool.name}</div>
                  <div className="text-sm text-gray-600">{tool.description}</div>
                </li>
              ))}
            </ul>
          </div>

          <div className="md:col-span-2">
            {selectedTool ? (
              <div>
                <h3 className="text-lg font-semibold mb-2">{selectedTool.name}</h3>
                <p className="mb-4 text-gray-600">{selectedTool.description}</p>

                <div className="border rounded p-4 mb-4">
                  <h4 className="font-medium mb-2">Parameters</h4>

                  {selectedTool.parameters?.properties ? (
                    <div className="space-y-4">
                      {Object.entries(selectedTool.parameters.properties).map(([key, schema]: [string, any]) => (
                        <div key={key}>
                          <label className="block text-gray-700 mb-1">
                            {key}
                            {selectedTool.parameters.required?.includes(key) && (
                              <span className="text-red-500 ml-1">*</span>
                            )}
                          </label>
                          <div className="text-xs text-gray-500 mb-1">{schema.description}</div>
                          {renderParameterInput(key, schema)}
                        </div>
                      ))}

                      <button
                        onClick={handleExecuteTool}
                        className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                        disabled={isLoading}
                      >
                        {isLoading ? "Executing..." : "Execute Tool"}
                      </button>
                    </div>
                  ) : (
                    <div className="text-gray-500">No parameters required</div>
                  )}
                </div>

                {result && (
                  <div>
                    <h4 className="font-medium mb-2">Result</h4>
                    <div className="border rounded p-4 bg-gray-50">
                      <pre className="whitespace-pre-wrap">
                        {typeof result === "object" ? JSON.stringify(result, null, 2) : result}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="border rounded p-4 bg-gray-50 text-gray-500">
                Select a tool to view its details and parameters
              </div>
            )}
          </div>
        </div>
      ) : selectedServerId ? (
        <div className="text-gray-500">No tools available</div>
      ) : null}
    </div>
  );
}
