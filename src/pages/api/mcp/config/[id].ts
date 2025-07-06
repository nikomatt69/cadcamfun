// Server-specific config API

// src/pages/api/mcp/config/[id].ts
import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/src/lib/prisma";
import { requireAuth } from "@/src/lib/api/auth";
import { mcpClientManager } from "@/src/lib/mcp/client";
import { MCPServerConfig, MCPSseConfig, MCPStdioServerConfig } from "@/src/lib/mcp/client";

// Validate the server config data based on type (same as in config.ts)
function validateServerConfig(data: any): { isValid: boolean; error?: string } {
  // Common validations
  if (data.name !== undefined && (typeof data.name !== "string" || data.name.trim() === "")) {
    return { isValid: false, error: "Server name is required" };
  }

  // Type can't be changed for existing servers, so we don't validate it here

  // Type-specific validations
  if (data.type === "sse") {
    if (data.url !== undefined && (typeof data.url !== "string" || data.url.trim() === "")) {
      return { isValid: false, error: "URL is required for SSE servers" };
    }
  } else if (data.type === "stdio") {
    if (data.command !== undefined && (typeof data.command !== "string" || data.command.trim() === "")) {
      return { isValid: false, error: "Command is required for stdio servers" };
    }

    // Ensure args is properly formatted if present
    if (data.args !== undefined && !Array.isArray(data.args)) {
      return { isValid: false, error: "Arguments must be an array of strings" };
    }
  }

  return { isValid: true };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const { id } = req.query;

  if (!id || Array.isArray(id)) {
    return res.status(400).json({ error: "Invalid server ID" });
  }

  try {
    // Get the current configuration to determine the server type
    const existingConfig = await prisma.mCPServerConfig.findUnique({
      where: { id }
    });

    if (!existingConfig) {
      return res.status(404).json({ error: "Configuration not found" });
    }

    switch (req.method) {
      case "GET":
        // Get a specific MCP server configuration
        return res.status(200).json(existingConfig);

      case "PUT":
        // Validate the update data
        const updateData = req.body;
        const validation = validateServerConfig(updateData);
        if (!validation.isValid) {
          return res.status(400).json({ error: validation.error });
        }

        // Prevent changing the server type
        if (updateData.type && updateData.type !== existingConfig.type) {
          return res.status(400).json({ error: "Cannot change server type after creation" });
        }

        // Process the update data based on the server type
        let dataToUpdate: any = {};

        // Common fields
        if (updateData.name !== undefined) {
          dataToUpdate.name = updateData.name;
        }

        if (updateData.enabled !== undefined) {
          dataToUpdate.enabled = updateData.enabled;
        }

        // Type-specific fields
        if (existingConfig.type === "sse") {
          if (updateData.url !== undefined) {
            dataToUpdate.url = updateData.url;
          }
        } else if (existingConfig.type === "stdio") {
          if (updateData.command !== undefined) {
            dataToUpdate.command = updateData.command;
          }

          if (updateData.args !== undefined) {
            dataToUpdate.args = updateData.args;
          }

          if (updateData.workingDirectory !== undefined) {
            dataToUpdate.workingDirectory = updateData.workingDirectory;
          }
        }

        // Update in database
        const updatedConfig = await prisma.mCPServerConfig.update({
          where: { id },
          data: dataToUpdate
        });

        // Update the server connection if needed
        if (
          existingConfig.enabled !== updatedConfig.enabled ||
          (existingConfig.type === "sse" && existingConfig.url !== updatedConfig.url) ||
          (existingConfig.type === "stdio" &&
            ((existingConfig as MCPStdioServerConfig).command !== (updatedConfig as MCPStdioServerConfig).command ||
              JSON.stringify((existingConfig as MCPStdioServerConfig).args) !==
                JSON.stringify((updatedConfig as MCPStdioServerConfig).args) ||
              (existingConfig as MCPStdioServerConfig).workingDirectory !==
                (updatedConfig as MCPStdioServerConfig).workingDirectory))
        ) {
          // Convert DB model to MCPServerConfig
          const serverConfig: MCPServerConfig =
            updatedConfig.type === "sse"
              ? ({
                  id: updatedConfig.id,
                  name: updatedConfig.name,
                  type: "sse",
                  url: (updatedConfig as MCPSseConfig).url,
                  enabled: updatedConfig.enabled
                } as MCPSseConfig)
              : ({
                  id: updatedConfig.id,
                  name: updatedConfig.name,
                  type: "stdio",
                  command: (updatedConfig as MCPStdioServerConfig).command,
                  args: ((updatedConfig as MCPStdioServerConfig).args as string[] | undefined) || [],
                  workingDirectory: (updatedConfig as MCPStdioServerConfig).workingDirectory as string | undefined,
                  enabled: updatedConfig.enabled
                } as MCPStdioServerConfig);

          // Disconnect existing server if connected
          if (mcpClientManager.getServer(id)) {
            await mcpClientManager.disconnectServer(id);
          }

          // Connect the updated server if enabled
          if (updatedConfig.enabled) {
            await mcpClientManager.connectServer(serverConfig);
          }
        }

        return res.status(200).json(updatedConfig);

      case "DELETE":
        // Disconnect the server if connected
        if (mcpClientManager.getServer(id)) {
          await mcpClientManager.disconnectServer(id);
        }

        // Delete from database
        await prisma.mCPServerConfig.delete({
          where: { id }
        });

        return res.status(204).end();

      default:
        return res.status(405).json({ error: "Method not allowed" });
    }
  } catch (error: any) {
    console.error(`Error handling MCP config/${id} request:`, error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
}
