import type { NextApiRequest, NextApiResponse } from "next";
import { PluginRegistry } from "@/src/plugins/core/registry";
import { withRegistry, ApiHandlerWithRegistry } from "@/src/server/middleware/withRegistry";
import { PluginManifest, validateManifest } from "@/src/plugins/core/registry/pluginManifest";

// Disable Next.js body parsing, formidable will handle it
export const config = {
  api: {
    bodyParser: false
  }
};

const updateHandler: ApiHandlerWithRegistry = async (req, res, registry) => {
  if (req.method !== "PUT" && req.method !== "PATCH") {
    // Allow PUT or PATCH
    res.setHeader("Allow", ["PUT", "PATCH"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { id } = req.query;
  if (typeof id !== "string") {
    return res.status(400).json({ error: "Invalid plugin ID" });
  }

  try {
    const updateData = req.body; // Get data from request body

    // --- Basic Validation ---
    // Example: Validate specific fields if updating manifest parts
    if (updateData.manifest) {
      const validationResult = validateManifest(updateData.manifest);
      if (!validationResult.valid) {
        return res.status(400).json({
          error: "Invalid manifest data provided.",
          details: validationResult.errors
        });
      }
    }
    // Add more validation as needed for other potential update fields (e.g., config)
    // --- End Validation ---

    console.log(`[API Update] Attempting update for plugin ${id} with data:`, updateData);

    // Use registry method for update (adapt based on actual registry method)
    // This assumes registry.updatePlugin handles partial updates and merging logic.
    // Passing empty string for packagePath as this route updates metadata/config via body, not code.
    // The registry.updatePlugin implementation MUST handle an empty path gracefully.
    const updatedPlugin = await registry.updatePlugin(id, updateData, "");

    if (!updatedPlugin) {
      // This case implies the update method didn't find the plugin
      return res.status(404).json({ error: `Plugin with ID ${id} not found.` });
    }

    console.log(`[API Update] Plugin ${id} updated successfully.`);
    res.status(200).json(updatedPlugin); // Return the updated plugin entry
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to update plugin";
    console.error(`[API Update] Error updating plugin ${id}:`, error);
    // Determine specific status codes
    let statusCode = 500;
    if ((error as any).code === "PLUGIN_NOT_FOUND") statusCode = 404;
    if (errorMessage.includes("Validation failed")) statusCode = 400; // Example
    res.status(statusCode).json({ error: errorMessage });
  }
};

export default withRegistry(updateHandler);
