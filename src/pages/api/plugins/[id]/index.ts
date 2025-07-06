import type { NextApiRequest, NextApiResponse } from "next";
// import { getRegistryInstance } from '@/src/server/pluginRegistryInstance'; // REMOVED
import { PluginRegistry, PluginRegistryEntry } from "@/src/plugins/core/registry"; // Import type and Entry type
import { withRegistry, ApiHandlerWithRegistry } from "@/src/server/middleware/withRegistry"; // Import HOF

const pluginDetailHandler: ApiHandlerWithRegistry = async (req, res, registry) => {
  const { id } = req.query;
  if (typeof id !== "string") {
    return res.status(400).json({ error: "Invalid plugin ID" });
  }

  // Moved registry and storage retrieval outside method checks as both need it
  const storage = registry.getStorage();
  if (!storage) {
    console.error(`[API Plugin ${id}] Storage provider not available via registry.`);
    throw new Error("Storage provider not available.");
  }

  if (req.method === "GET") {
    try {
      // Use registry.getPlugin which should ideally handle combining data
      // If registry.getPlugin doesn't exist or doesn't fetch config, revert to storage calls
      let pluginData;
      if (typeof registry.getPlugin === "function") {
        pluginData = await registry.getPlugin(id);
      } else {
        // Fallback: Get plugin entry and config separately from storage
        const allPlugins = await storage.getPlugins();
        const pluginBase = allPlugins.find((p: PluginRegistryEntry) => p.id === id); // Added type to p
        if (pluginBase) {
          const config = await storage.getPluginConfig(id);
          pluginData = { ...pluginBase, config: config || {} };
        }
      }

      if (!pluginData) {
        return res.status(404).json({ error: `Plugin with ID ${id} not found.` });
      }
      res.status(200).json(pluginData);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to get plugin details";
      console.error(`[API GetPlugin ${id}] Error getting plugin details:`, error);
      res.status(500).json({ error: errorMessage }); // Let wrapper handle 500 if possible
    }
  } else if (req.method === "DELETE") {
    try {
      await registry.uninstallPlugin(id); // Uninstall handled by registry
      console.log(`[API DeletePlugin] Plugin ${id} uninstalled.`);
      res.status(200).json({ message: `Plugin ${id} uninstalled successfully.` }); // Use message for consistency
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to uninstall plugin";
      console.error(`[API DeletePlugin ${id}] Error uninstalling plugin:`, error);
      let statusCode = 500;
      if ((error as any).code === "PLUGIN_NOT_FOUND") statusCode = 404;
      res.status(statusCode).json({ error: errorMessage });
    }
  } else {
    res.setHeader("Allow", ["GET", "DELETE"]);
    res.status(405).json({ error: "Method Not Allowed" });
  }
};

export default withRegistry(pluginDetailHandler);
