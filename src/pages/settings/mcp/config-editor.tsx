// src/pages/settings/mcp/config-editor.tsx
import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { useMCP } from "../../../contexts/MCPContext";
import Layout from "@/src/components/layout/Layout";

export default function MCPConfigEditorPage() {
  const router = useRouter();
  const { servers, refreshServers } = useMCP();
  const [configJson, setConfigJson] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Carica la configurazione attuale
  useEffect(() => {
    const loadConfig = async () => {
      try {
        setIsLoading(true);
        const response = await fetch("/api/mcp/config?source=file");

        if (!response.ok) {
          throw new Error("Impossibile caricare il file di configurazione MCP");
        }

        const configData = await response.json();
        setConfigJson(JSON.stringify(configData, null, 2));
      } catch (err: any) {
        setError(err.message || "Si è verificato un errore");
      } finally {
        setIsLoading(false);
      }
    };

    loadConfig();
  }, []);

  // Salva la configurazione
  const handleSaveConfig = async () => {
    try {
      setError(null);
      setSuccessMessage(null);
      setIsSaving(true);

      // Verifica che il JSON sia valido
      let parsedConfig;
      try {
        parsedConfig = JSON.parse(configJson);
      } catch (err) {
        throw new Error("Il formato JSON non è valido. Correggi il formato prima di salvare.");
      }

      // Invia la configurazione al server
      const response = await fetch("/api/mcp/config?source=file", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(parsedConfig)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Impossibile salvare la configurazione");
      }

      setSuccessMessage("Configurazione salvata con successo!");

      // Aggiorna i server dopo il salvataggio
      await refreshServers();
    } catch (err: any) {
      setError(err.message || "Si è verificato un errore durante il salvataggio");
    } finally {
      setIsSaving(false);
    }
  };

  // Formatta il JSON
  const handleFormatJson = () => {
    try {
      const parsedJson = JSON.parse(configJson);
      setConfigJson(JSON.stringify(parsedJson, null, 2));
      setError(null);
    } catch (err: any) {
      setError("Il formato JSON non è valido. Correggi gli errori prima di formattare.");
    }
  };

  if (status === "unauthenticated") {
    router.push("/waitlist");
    return null;
  }

  return (
    <Layout>
      <div className="container mx-auto p-4">
        <div className="mb-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold">Editor MCP.json</h1>
          <Link href="/settings/mcp">
            <button className="bg-gray-200 hover:bg-gray-300 text-gray-800 py-1 px-3 rounded text-sm">
              ← Torna alle Impostazioni MCP
            </button>
          </Link>
        </div>

        {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">{error}</div>}

        {successMessage && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
            {successMessage}
          </div>
        )}

        <div className="mb-4">
          <p className="text-gray-600 mb-2">
            Puoi modificare direttamente il file di configurazione MCP.json qui sotto. Assicurati che il formato JSON
            sia valido prima di salvare.
          </p>

          <div className="flex space-x-2 mb-2">
            <button
              onClick={handleFormatJson}
              className="bg-gray-500 hover:bg-gray-600 text-white py-1 px-3 rounded text-sm"
            >
              Formatta JSON
            </button>

            <button
              onClick={handleSaveConfig}
              disabled={isLoading || isSaving}
              className={`bg-blue-500 hover:bg-blue-600 text-white py-1 px-3 rounded text-sm ${isLoading || isSaving ? "opacity-50 cursor-not-allowed" : ""
                }`}
            >
              {isSaving ? "Salvataggio in corso..." : "Salva Configurazione"}
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center p-8">Caricamento configurazione...</div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <textarea
              value={configJson}
              onChange={e => setConfigJson(e.target.value)}
              className="w-full h-96 p-4 font-mono text-sm focus:outline-none"
              spellCheck="false"
            />
          </div>
        )}

        <div className="mt-4 text-sm text-gray-600">
          <h2 className="font-semibold mb-1">Informazioni sul formato</h2>
          <p className="mb-2">
            Il file MCP.json deve contenere un oggetto con una proprietà <code>mcpServers</code> che è un array di
            configurazioni server.
          </p>
          <p className="mb-2">Ogni configurazione server deve includere:</p>
          <ul className="list-disc pl-5 mb-2">
            <li>
              <code>id</code>: Identificatore univoco del server
            </li>
            <li>
              <code>name</code>: Nome del server
            </li>
            <li>
              <code>type</code>: Tipo di server (solo &quot;sse&quot; supportato)
            </li>
            <li>
              <code>url</code>: URL del server MCP
            </li>
            <li>
              <code>enabled</code>: Stato di abilitazione (true/false)
            </li>
          </ul>
        </div>
      </div>
    </Layout>
  );
}
