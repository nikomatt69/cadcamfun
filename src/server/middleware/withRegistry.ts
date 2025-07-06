// src/server/middleware/withRegistry.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { PluginRegistry } from "@/src/plugins/core/registry";
import { PluginStorage } from "@/src/plugins/core/registry/pluginStorage";
import { DatabasePluginStorage } from "@/src/server/storage/DatabasePluginStorage";
import { PluginLifecycle } from "@/src/plugins/core/registry/pluginLifecycle";

// Variabile a livello di modulo per mantenere l'istanza singleton
let registryInstance: PluginRegistry | null = null;

// Funzione asincrona per inizializzare il registry (se necessario)
async function initializeRegistry(): Promise<PluginRegistry> {
  if (!registryInstance) {
    console.log("[withRegistry] Initializing server-side PluginRegistry instance...");
    try {
      // Crea le dipendenze
      const storageProvider = new DatabasePluginStorage(); // Assumi costruttore sincrono o adatta
      // Potrebbe essere necessario un await storageProvider.connect() o simile qui se asincrono
      const storage = new PluginStorage(storageProvider);
      const newRegistry = new PluginRegistry(storage);

      // Crea e inietta il Lifecycle
      const lifecycle = new PluginLifecycle(newRegistry); // Non serve cast qui
      newRegistry.setLifecycle(lifecycle);

      registryInstance = newRegistry; // Assegna solo dopo successo
      console.log("[withRegistry] PluginRegistry instance created and lifecycle injected.");
    } catch (error) {
      console.error("[withRegistry] FATAL: Failed to initialize PluginRegistry:", error);
      // Cosa fare qui? Lanciare l'errore impedisce l'avvio o il funzionamento delle API.
      // Potrebbe essere meglio restituire null e gestirlo nel wrapper?
      // O lanciare per indicare un errore critico di configurazione.
      throw new Error("Failed to initialize core plugin system.");
    }
  }
  // A questo punto, registryInstance non può essere null se non è stato lanciato un errore
  return registryInstance!;
}

// Tipo per i gestori delle API che ricevono il registry
export type ApiHandlerWithRegistry = (
  req: NextApiRequest,
  res: NextApiResponse,
  registry: PluginRegistry // Il registry viene passato come argomento
) => Promise<void> | void;

// L'Higher-Order Function (Wrapper)
export function withRegistry(handler: ApiHandlerWithRegistry) {
  return async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
    try {
      // Assicura che il registry sia inizializzato e lo ottiene
      const registry = await initializeRegistry();

      // Esegue il gestore originale passando il registry
      await handler(req, res, registry);
    } catch (error) {
      console.error(`[withRegistry] Error in API handler for ${req.url}:`, error);
      // Gestione generica errore - NON inviare dettagli errore al client
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal Server Error" });
      } else {
        console.error("[withRegistry] Headers already sent, cannot send error response.");
        res.end(); // Tenta di chiudere la risposta se possibile
      }
    }
  };
}
