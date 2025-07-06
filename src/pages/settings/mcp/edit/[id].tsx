// Edit MCP Server Page
import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { MCPApiClient } from "@/src/lib/mcp/api-client";
import { MCPServerConfig } from "@/src/lib/mcp/client";
import Layout from "@/src/components/layout/Layout";
import MCPServerForm from "@/src/components/MCPServerForm";
import Link from "next/link";
import Loading from "@/src/components/ui/Loading";

export default function EditMCPServerPage() {
  const router = useRouter();
  const { id } = router.query;

  const [server, setServer] = useState<MCPServerConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchServer = async () => {
      if (!id || Array.isArray(id)) {
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const serverData = await MCPApiClient.getServer(id);
        setServer(serverData);
      } catch (err: any) {
        setError(err.message || "Failed to load server details");
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchServer();
    }
  }, [id]);

  const handleUpdateServer = async (serverData: Omit<MCPServerConfig, "id">) => {
    if (!id || Array.isArray(id) || !server) {
      return;
    }

    setSubmitting(true);

    try {
      const updatedServer = await MCPApiClient.updateServer(id as string, serverData as any);
      setServer(updatedServer);
      router.push("/settings/mcp");
    } catch (err: any) {
      setError(err.message || "Failed to update server");
    } finally {
      setSubmitting(false);
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

  if (!server) {
    return (
      <Layout>
        <div className="container mx-auto p-4">
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error || "Server not found"}
          </div>
          <div className="mt-4">
            <Link href="/settings/mcp">
              <button className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded">
                Back to Settings
              </button>
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto p-4">
        <div className="mb-4">
          <Link href="/settings/mcp">
            <button className="bg-gray-200 hover:bg-gray-300 text-gray-800 py-1 px-3 rounded text-sm">
              ← Back to Server Settings
            </button>
          </Link>
        </div>

        <h1 className="text-2xl font-bold mb-6">Edit MCP Server</h1>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
            <button onClick={() => setError(null)} className="float-right font-bold">
              &times;
            </button>
          </div>
        )}

        <div className="p-4 border rounded-lg bg-gray-50">
          <MCPServerForm
            initialValues={server}
            onSubmit={handleUpdateServer}
            onCancel={() => router.push("/settings/mcp")}
            isSubmitting={submitting}
          />
        </div>
      </div>
    </Layout>
  );
}
