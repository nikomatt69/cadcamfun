// Resource browser component

// src/components/MCPResourceBrowser.tsx
import { useState, useEffect } from "react";
import { useMCP } from "../contexts/MCPContext";
import MCPServerSelector from "./MCPServerSelector";
import { mcpClientManager } from "@/src/lib/mcp/client";

export default function MCPResourceBrowser() {
  const [selectedServerId, setSelectedServerId] = useState("");
  const [resources, setResources] = useState<any[]>([]);
  const [selectedResource, setSelectedResource] = useState<string | null>(null);
  const [resourceData, setResourceData] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleServerChange = (serverId: string) => {
    setSelectedServerId(serverId);
    setSelectedResource(null);
    setResourceData(null);
  };

  // Fetch server resources
  useEffect(() => {
    if (!selectedServerId) {
      setResources([]);
      return;
    }

    async function fetchResources() {
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
          throw new Error(errorData.error || "Failed to fetch resources");
        }

        const data = await response.json();
        const fetchedResources = data.resources;
        if (Array.isArray(fetchedResources)) {
          setResources(fetchedResources);
        } else if (typeof fetchedResources === "object" && fetchedResources !== null) {
          // Convert object of resources to an array of its values
          setResources(Object.values(fetchedResources));
        } else {
          setResources([]);
        }
      } catch (err: any) {
        setError(err.message || "An error occurred");
      } finally {
        setIsLoading(false);
      }
    }

    fetchResources();
  }, [selectedServerId]);

  // Load resource data when selected
  const loadResource = async (uri: string) => {
    const client = mcpClientManager.getServer(selectedServerId);
    if (!client) return;

    const response = await client.readResource({ uri });

    setResourceData(response.content);
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-gray-700 mb-1">MCP Server</label>
        <MCPServerSelector value={selectedServerId} onChange={handleServerChange} />
      </div>

      {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">{error}</div>}

      {isLoading ? (
        <div className="text-gray-500">Loading...</div>
      ) : selectedServerId && resources.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1">
            <h3 className="text-lg font-semibold mb-2">Available Resources</h3>
            <ul className="border rounded divide-y">
              {resources.map((resource, index) => (
                <li
                  key={index}
                  className={`p-3 hover:bg-gray-50 cursor-pointer ${
                    selectedResource === resource.uriTemplate ? "bg-blue-50" : ""
                  }`}
                  onClick={() => loadResource(resource.uriTemplate)}
                >
                  <div className="font-medium">{resource.name}</div>
                  <div className="text-sm text-gray-600">{resource.uriTemplate}</div>
                </li>
              ))}
            </ul>
          </div>

          <div className="md:col-span-2">
            <h3 className="text-lg font-semibold mb-2">Resource Data</h3>
            {selectedResource ? (
              <div className="border rounded p-4 bg-gray-50">
                <pre className="whitespace-pre-wrap">
                  {resourceData ? JSON.stringify(resourceData, null, 2) : "No data available"}
                </pre>
              </div>
            ) : (
              <div className="border rounded p-4 bg-gray-50 text-gray-500">Select a resource to view its data</div>
            )}
          </div>
        </div>
      ) : selectedServerId ? (
        <div className="text-gray-500">No resources available</div>
      ) : null}
    </div>
  );
}
