import type { NextApiRequest, NextApiResponse } from "next";
import { PluginRegistry } from "@/src/plugins/core/registry";
import { withRegistry, ApiHandlerWithRegistry } from "@/src/server/middleware/withRegistry";

const enableHandler: ApiHandlerWithRegistry = async (req, res, registry) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { id } = req.query;
  if (typeof id !== "string") {
    return res.status(400).json({ error: "Invalid plugin ID" });
  }

  try {
    await registry.enablePlugin(id);
    console.log(`[API Enable] Plugin ${id} enabled.`);
    res.status(200).json({ message: `Plugin ${id} enabled successfully.` });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to enable plugin";
    console.error(`[API Enable] Error enabling plugin ${id}:`, error);
    // Determine specific status codes
    let statusCode = 500;
    if ((error as any).code === "PLUGIN_NOT_FOUND") statusCode = 404;
    res.status(statusCode).json({ error: errorMessage });
  }
};

export default withRegistry(enableHandler);
