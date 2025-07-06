// Unified Configuration Management API
// Consolidates: config.ts + config-file.ts
// Supports: Claude MCP registry, database configurations, config file import/export
import type { NextApiRequest, NextApiResponse } from "next";
import { getMCPClient, MCPServerConfig } from "../../../lib/ai/mcp/mcpOfficialClient";
import { prisma } from "@/src/lib/prisma";
import { MCPSseConfig, MCPStdioServerConfig } from "@/src/lib/mcp/client";
import { requireAuth } from "@/src/lib/api/auth";

type ConfigFileFormat = {
  mcpServers: (MCPSseConfig | MCPStdioServerConfig)[];
};

/**
 * Unified configuration endpoint
 * Handles: Claude MCP registry, database configs, config file import/export
 * Routes based on query parameter: ?source=claude|database|file
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { source = "claude" } = req.query;

    // Route to appropriate handler based on source
    switch (source) {
      case "claude":
        return await handleClaudeMCPConfig(req, res);
      case "database":
        return await handleDatabaseConfig(req, res);
      case "file":
        return await handleConfigFile(req, res);
      default:
        return res.status(400).json({
          success: false,
          error: `Unknown config source: ${source}. Supported: claude, database, file`
        });
    }
  } catch (error: any) {
    console.error("Error in unified config handler:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal server error",
      details: process.env.NODE_ENV === "development" ? error.stack : undefined
    });
  }
}

/**
 * Handle Claude MCP configuration (from original config.ts)
 */
async function handleClaudeMCPConfig(req: NextApiRequest, res: NextApiResponse) {
  const mcpClient = getMCPClient();

  switch (req.method) {
    case "GET":
      // Get all Claude MCP server configurations
      const configs = mcpClient.getRegisteredServers();
      return res.status(200).json({
        success: true,
        source: "claude",
        servers: configs,
        count: configs.length
      });

    case "POST":
      // Create new configuration for Claude MCP
      const newConfigData = req.body;

      // Validate the configuration
      const validation = validateServerConfig(newConfigData);
      if (!validation.isValid) {
        return res.status(400).json({
          success: false,
          error: validation.error
        });
      }

      // Process the data for Claude MCP
      const serverConfig: MCPServerConfig = {
        name: newConfigData.name,
        type: newConfigData.type,
        ...(newConfigData.type === "url" && { url: newConfigData.url }),
        ...(newConfigData.type === "stdio" && {
          command: newConfigData.command,
          args: newConfigData.args || [],
          workingDirectory: newConfigData.workingDirectory
        }),
        tool_configuration: {
          enabled: newConfigData.enabled !== false,
          allowed_tools: newConfigData.allowedTools || []
        },
        authorization_token: newConfigData.authToken
      };

      // Register with Claude MCP client
      try {
        mcpClient.registerMCPServer(serverConfig);

        // Test connection if requested
        let connectionTest = null;
        if (newConfigData.testConnection) {
          connectionTest = await mcpClient.testMCPConnection(serverConfig.name);
        }

        return res.status(201).json({
          success: true,
          source: "claude",
          server: serverConfig,
          connectionTest,
          message: `Server ${serverConfig.name} registered successfully with Claude MCP`
        });
      } catch (registrationError) {
        console.error("Failed to register server with Claude MCP:", registrationError);
        return res.status(500).json({
          success: false,
          error: `Failed to register server: ${registrationError instanceof Error ? registrationError.message : "Unknown error"}`
        });
      }

    case "PUT":
      // Update existing server configuration
      const { serverName, ...updateData } = req.body;

      if (!serverName) {
        return res.status(400).json({
          success: false,
          error: "Server name is required for updates"
        });
      }

      const existingServer = mcpClient.getServer(serverName);
      if (!existingServer) {
        return res.status(404).json({
          success: false,
          error: `Server ${serverName} not found`
        });
      }

      // Validate update data
      const updateValidation = validateServerConfig({ ...existingServer, ...updateData });
      if (!updateValidation.isValid) {
        return res.status(400).json({
          success: false,
          error: updateValidation.error
        });
      }

      // Apply updates
      const updatedServer: MCPServerConfig = {
        ...existingServer,
        ...updateData,
        tool_configuration: {
          ...existingServer.tool_configuration,
          ...updateData.tool_configuration
        }
      };

      try {
        mcpClient.registerMCPServer(updatedServer);

        return res.status(200).json({
          success: true,
          source: "claude",
          server: updatedServer,
          message: `Server ${serverName} updated successfully`
        });
      } catch (updateError) {
        console.error("Failed to update server:", updateError);
        return res.status(500).json({
          success: false,
          error: `Failed to update server: ${updateError instanceof Error ? updateError.message : "Unknown error"}`
        });
      }

    case "DELETE":
      // Remove server configuration
      const { name: deleteServerName } = req.query;

      if (!deleteServerName || typeof deleteServerName !== "string") {
        return res.status(400).json({
          success: false,
          error: "Server name is required for deletion"
        });
      }

      const serverToDelete = mcpClient.getServer(deleteServerName);
      if (!serverToDelete) {
        return res.status(404).json({
          success: false,
          error: `Server ${deleteServerName} not found`
        });
      }

      return res.status(200).json({
        success: true,
        source: "claude",
        message: `Server ${deleteServerName} removed from registry`,
        note: "Server configurations are managed by Claude MCP client internally"
      });

    default:
      res.setHeader("Allow", ["GET", "POST", "PUT", "DELETE"]);
      return res.status(405).json({
        success: false,
        error: `Method ${req.method} not allowed`
      });
  }
}

/**
 * Handle database configuration
 */
async function handleDatabaseConfig(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  switch (req.method) {
    case "GET":
      // Get database configurations
      const servers = await prisma.mCPServerConfig.findMany({
        where: { userId }
      });

      return res.status(200).json({
        success: true,
        source: "database",
        servers,
        count: servers.length
      });

    case "POST":
      // Create new database configuration
      const createData = req.body;

      const validation = validateServerConfig(createData);
      if (!validation.isValid) {
        return res.status(400).json({
          success: false,
          error: validation.error
        });
      }

      const newServer = await prisma.mCPServerConfig.create({
        data: {
          id: createData.id || crypto.randomUUID(),
          name: createData.name,
          type: createData.type,
          enabled: createData.enabled !== false,
          userId,
          ...(createData.type === "sse" && { url: createData.url }),
          ...(createData.type === "stdio" && {
            command: createData.command,
            args: createData.args || [],
            workingDirectory: createData.workingDirectory
          })
        }
      });

      return res.status(201).json({
        success: true,
        source: "database",
        server: newServer,
        message: `Server ${newServer.name} created in database`
      });

    default:
      res.setHeader("Allow", ["GET", "POST"]);
      return res.status(405).json({
        success: false,
        error: `Method ${req.method} not allowed for database config`
      });
  }
}

/**
 * Handle config file import/export (from config-file.ts)
 */
async function handleConfigFile(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  switch (req.method) {
    case "GET":
      // Export config file
      const servers = await prisma.mCPServerConfig.findMany({
        where: { userId }
      });

      const configData: ConfigFileFormat = {
        mcpServers: servers.map(server => {
          if (server.type === "sse") {
            return {
              id: server.id,
              name: server.name,
              type: "sse",
              url: server.url as string,
              enabled: server.enabled
            } as MCPSseConfig;
          } else if (server.type === "stdio") {
            return {
              id: server.id,
              name: server.name,
              type: "stdio",
              command: server.command as string,
              args: (server.args as string[] | undefined) || [],
              workingDirectory: server.workingDirectory as string | undefined,
              enabled: server.enabled
            } as MCPStdioServerConfig;
          }
          throw new Error(`Invalid server type in export: ${server.type}`);
        })
      };

      return res.status(200).json({
        success: true,
        source: "file",
        config: configData,
        exportedAt: new Date().toISOString()
      });

    case "POST":
      // Import config file
      const configFile: ConfigFileFormat = req.body;

      if (!configFile || !Array.isArray(configFile.mcpServers)) {
        return res.status(400).json({
          success: false,
          error: "Invalid configuration format"
        });
      }

      await prisma.$transaction(async tx => {
        // Clear existing configurations
        await tx.mCPServerConfig.deleteMany({
          where: { userId }
        });

        // Import new configurations
        for (const server of configFile.mcpServers) {
          const currentServer = server as (MCPSseConfig | MCPStdioServerConfig) & { type: "sse" | "stdio" };

          if (!currentServer.id || !currentServer.name || !currentServer.type) {
            throw new Error("Server ID, name and type are required");
          }

          const commonData = {
            id: currentServer.id,
            name: currentServer.name,
            type: currentServer.type,
            enabled: currentServer.enabled ?? false,
            userId
          };

          let dataToCreate;

          if (currentServer.type === "sse") {
            const sseServer = currentServer as MCPSseConfig;
            if (typeof sseServer.url !== "string" || !sseServer.url.trim()) {
              throw new Error("URL is required for SSE servers");
            }
            dataToCreate = {
              ...commonData,
              url: sseServer.url
            };
          } else if (currentServer.type === "stdio") {
            const stdioServer = currentServer as MCPStdioServerConfig;
            if (typeof stdioServer.command !== "string" || !stdioServer.command.trim()) {
              throw new Error("Command is required for stdio servers");
            }
            const args = Array.isArray(stdioServer.args) ? stdioServer.args : [];
            dataToCreate = {
              ...commonData,
              command: stdioServer.command,
              args: args,
              workingDirectory: stdioServer.workingDirectory || null
            };
          } else {
            throw new Error("Invalid server type encountered");
          }

          await tx.mCPServerConfig.create({ data: dataToCreate });
        }
      });

      return res.status(200).json({
        success: true,
        source: "file",
        imported: configFile.mcpServers.length,
        message: `Imported ${configFile.mcpServers.length} server configurations`
      });

    default:
      res.setHeader("Allow", ["GET", "POST"]);
      return res.status(405).json({
        success: false,
        error: `Method ${req.method} not allowed for config file`
      });
  }
}

/**
 * Validate server configuration data
 */
function validateServerConfig(data: any): { isValid: boolean; error?: string } {
  // Common validations
  if (!data.name || typeof data.name !== "string" || data.name.trim() === "") {
    return { isValid: false, error: "Server name is required" };
  }

  if (!data.type || (data.type !== "url" && data.type !== "stdio")) {
    return { isValid: false, error: 'Server type must be either "url" or "stdio"' };
  }

  // Type-specific validations
  if (data.type === "url") {
    if (!data.url || typeof data.url !== "string" || data.url.trim() === "") {
      return { isValid: false, error: "URL is required for URL servers" };
    }
  } else if (data.type === "stdio") {
    if (!data.command || typeof data.command !== "string" || data.command.trim() === "") {
      return { isValid: false, error: "Command is required for stdio servers" };
    }

    // Ensure args is properly formatted if present
    if (data.args && !Array.isArray(data.args)) {
      return { isValid: false, error: "Arguments must be an array of strings" };
    }
  }

  return { isValid: true };
}
