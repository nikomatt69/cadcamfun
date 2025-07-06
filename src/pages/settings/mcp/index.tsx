// MCP Server Settings Page
import { useState, useEffect } from "react";
import { MCPApiClient } from "@/src/lib/mcp/api-client";
import { MCPServerConfig } from "@/src/lib/mcp/client";
import Layout from "@/src/components/layout/Layout";
import MCPServerForm from "@/src/components/MCPServerForm";
import Link from "next/link";
import { useRouter } from "next/router";

import Loading from "@/src/components/ui/Loading";
export default function MCPSettingsPage() {
  const [servers, setServers] = useState<MCPServerConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  // Load servers on mount
  useEffect(() => {
    const fetchServers = async () => {
      try {
        const serversList = await MCPApiClient.getServers();
        setServers(Array.isArray(serversList) ? serversList : []);
      } catch (err: any) {
        setError(err.message || "Failed to load servers");
      } finally {
        setLoading(false);
      }
    };

    fetchServers();
  }, []);

  const handleAddServer = async (serverData: Omit<MCPServerConfig, "id">) => {
    setSubmitting(true);

    try {
      const newServer = await MCPApiClient.addServer(serverData as any);
      setServers([...servers, newServer]);
      setShowAddForm(false);
    } catch (err: any) {
      setError(err.message || "Failed to add server");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (serverId: string, enabled: boolean) => {
    try {
      await MCPApiClient.updateServer(serverId, { enabled });
      setServers(servers.map(server => (server.id === serverId ? { ...server, enabled } : server)));
    } catch (err: any) {
      setError(err.message || "Failed to update server status");
    }
  };

  const handleDeleteServer = async (serverId: string) => {
    if (!confirm("Are you sure you want to delete this server?")) {
      return;
    }

    try {
      await MCPApiClient.deleteServer(serverId);
      setServers(servers.filter(server => server.id !== serverId));
    } catch (err: any) {
      setError(err.message || "Failed to delete server");
    }
  };

  if (status === "unauthenticated") {
    router.push("/waitlist");
    return null;
  }

  if (loading) {
    return (
      <Layout>
        <div className="container mx-auto p-4">
          <div className="text-center p-8">
            <Loading />
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto p-4">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">MCP Server Settings</h1>

          <div className="flex space-x-2">
            <Link href="/mcp/directory">
              <button className="bg-gray-200 hover:bg-gray-300 text-gray-800 py-2 px-4 rounded">
                Server Directory
              </button>
            </Link>
            <Link href="/settings/mcp/config-editor">
              <button className={`bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded`}>
                Editor MCP.json
              </button>
            </Link>
            {!showAddForm && (
              <button
                onClick={() => setShowAddForm(true)}
                className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
              >
                Add Server
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
            <button onClick={() => setError(null)} className="float-right font-bold">
              &times;
            </button>
          </div>
        )}

        {showAddForm && (
          <div className="mb-8 p-4 border rounded-lg bg-gray-50">
            <h2 className="text-xl font-semibold mb-4">Add New MCP Server</h2>
            <MCPServerForm
              onSubmit={handleAddServer}
              onCancel={() => setShowAddForm(false)}
              isSubmitting={submitting}
            />
          </div>
        )}

        {servers.length === 0 ? (
          <div className="bg-gray-100 p-8 rounded text-center">
            <p className="mb-4">No MCP servers configured yet.</p>
            {!showAddForm && (
              <button
                onClick={() => setShowAddForm(true)}
                className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
              >
                Add Your First Server
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-1">
            {(Array.isArray(servers) ? servers : []).map(server => (
              <div key={server.id} className="border rounded-lg overflow-hidden shadow-sm">
                <div className={`p-4 ${server.enabled ? "bg-green-50" : "bg-gray-50"}`}>
                  <div className="flex justify-between items-center">
                    <h2 className="text-xl font-semibold">{server.name}</h2>
                    <div className="flex items-center">
                      <div className={`w-3 h-3 rounded-full mr-2 ${server.enabled ? "bg-green-500" : "bg-gray-400"}`} />
                      <span className="text-sm text-gray-600">{server.enabled ? "Enabled" : "Disabled"}</span>
                    </div>
                  </div>

                  <div className="mt-2 text-sm text-gray-600">
                    <div className="mb-1">
                      <span className="font-medium">Type:</span>{" "}
                      {server.type === "sse" ? "Server-Sent Events (SSE)" : "Standard I/O (stdio)"}
                    </div>

                    {server.type === "sse" && (
                      <div className="mb-1">
                        <span className="font-medium">URL:</span>{" "}
                        <span className="font-mono text-xs bg-gray-100 px-1 rounded">{server.url}</span>
                      </div>
                    )}

                    {server.type === "stdio" && (
                      <>
                        <div className="mb-1">
                          <span className="font-medium">Command:</span>{" "}
                          <span className="font-mono text-xs bg-gray-100 px-1 rounded">{(server as any).command}</span>
                        </div>

                        {(server as any).args && (server as any).args.length > 0 && (
                          <div className="mb-1">
                            <span className="font-medium">Arguments:</span>{" "}
                            <span className="font-mono text-xs bg-gray-100 px-1 rounded">
                              {(server as any).args.join(" ")}
                            </span>
                          </div>
                        )}

                        {(server as any).workingDirectory && (
                          <div className="mb-1">
                            <span className="font-medium">Working Directory:</span>{" "}
                            <span className="font-mono text-xs bg-gray-100 px-1 rounded">
                              {(server as any).workingDirectory}
                            </span>
                          </div>
                        )}
                        {(server as any).defaultWorkingDirectory && (
                          <div className="mb-1">
                            <span className="font-medium">Default Working Directory:</span>{" "}
                            <span className="font-mono text-xs bg-gray-100 px-1 rounded">
                              {(server as any).defaultWorkingDirectory}
                            </span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <div className="p-3 bg-gray-50 border-t flex justify-between">
                  <div>
                    <button
                      onClick={() => handleToggleStatus(server.id, !server.enabled)}
                      className={`mr-2 px-3 py-1 rounded text-sm ${server.enabled
                        ? "bg-gray-200 hover:bg-gray-300 text-gray-800"
                        : "bg-green-100 hover:bg-green-200 text-green-800"
                        }`}
                    >
                      {server.enabled ? "Disable" : "Enable"}
                    </button>

                    <button
                      onClick={() => handleDeleteServer(server.id)}
                      className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-800 rounded text-sm"
                    >
                      Delete
                    </button>
                  </div>

                  <Link href={`/settings/mcp/edit/${server.id}`}>
                    <button className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded text-sm">Edit</button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
