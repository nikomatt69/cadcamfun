import type { NextApiRequest, NextApiResponse } from "next";
// import { getRegistryInstance } from '@/src/server/pluginRegistryInstance'; // REMOVED
import { PluginRegistry } from "@/src/plugins/core/registry"; // Import type
import { withRegistry, ApiHandlerWithRegistry } from "@/src/server/middleware/withRegistry"; // Import HOF

// This handler assumes the registry has methods like `getPluginConfig` and `updatePluginConfig`

const configHandler: ApiHandlerWithRegistry = async (req, res, registry) => {
  const { id } = req.query;
  if (typeof id !== "string") {
    return res.status(400).json({ error: "Invalid plugin ID" });
  }

  const storage = registry.getStorage();
  if (!storage) {
    console.error("[API Config] Storage provider not available via registry.");
    throw new Error("Storage provider not available.");
  }

  try {
    // Check if plugin exists first? Optional, storage methods should handle not found.

    if (req.method === "GET") {
      console.log(`[API Config] Getting config for plugin ${id}`);
      // Assuming storage has getPluginConfig
      const config = await storage.getPluginConfig(id);
      res.status(200).json(config || {}); // Return empty object if no config
    } else if (req.method === "POST" || req.method === "PUT") {
      // Allow POST or PUT to update/set config
      const newConfig = req.body;
      // TODO: Add validation against manifest schema if available
      console.log(`[API Config] Updating config for plugin ${id}:`, newConfig);
      // Assuming storage has savePluginConfig
      await storage.savePluginConfig(id, newConfig);
      res.status(200).json({ message: "Configuration updated successfully." });
    } else {
      res.setHeader("Allow", ["GET", "POST", "PUT"]);
      res.status(405).json({ error: "Method Not Allowed" });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to process plugin configuration";
    console.error(`[API Config] Error processing config for plugin ${id}:`, error);
    // Determine specific status codes
    let statusCode = 500;
    // Assuming storage methods might throw specific errors or codes
    if ((error as any).code === "PLUGIN_NOT_FOUND" || errorMessage.includes("not found")) {
      statusCode = 404;
    } else if (errorMessage.includes("Validation")) {
      statusCode = 400;
    }
    res.status(statusCode).json({ error: errorMessage });
  }
};

export default withRegistry(configHandler);
