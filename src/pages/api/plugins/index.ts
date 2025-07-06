import type { NextApiRequest, NextApiResponse } from "next";
import { PluginRegistryEntry } from "@/src/plugins/core/registry";
// import { getRegistryInstance } from '@/src/server/pluginRegistryInstance'; // REMOVED
import { PluginRegistry } from "@/src/plugins/core/registry"; // Import type
import { withRegistry, ApiHandlerWithRegistry } from "@/src/server/middleware/withRegistry"; // Import HOF

// Define the handler using the specific type
const pluginsIndexHandler: ApiHandlerWithRegistry = async (
  req,
  res,
  registry // Registry is now injected
) => {
  if (req.method !== "GET") {
    // Let withRegistry handle 500, just set specific errors
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // The wrapper ensures registry exists, but storage might theoretically be null
  const storage = registry.getStorage();
  if (!storage) {
    console.error("[API /plugins] Storage provider not available via registry.");
    // Let withRegistry handle the 500 response
    throw new Error("Storage provider not available.");
  }

  // Fetch directly from storage (which queries the database)
  // Specific error handling for this operation can remain if needed
  try {
    const plugins = await storage.getPlugins();
    res.status(200).json(plugins);
  } catch (storageError) {
    console.error("[API /plugins] Failed to get plugins from storage:", storageError);
    // Let withRegistry handle the 500 response
    throw new Error("Failed to retrieve plugin list from storage");
  }
};

// Export the wrapped handler
export default withRegistry(pluginsIndexHandler);
