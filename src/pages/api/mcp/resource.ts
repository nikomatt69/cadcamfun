// Unified Resource Management API
// Consolidates: resource.ts + stdio-resource.ts
// Supports: SSE servers, stdio servers, filesystem server adapter
import { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/src/lib/prisma";
import { mcpClientManager } from "@/src/lib/mcp/client";
import { getMCPClient } from "../../../lib/ai/mcp/mcpOfficialClient";
import { requireAuth } from "@/src/lib/api/auth";
import { stdioProcessManager } from "@/src/server/mcp/StdioProcessManager";
import { filesystemServerManager } from "@/src/server/mcp/FilesystemServerAdapter";

/**
 * Unified resource endpoint
 * Handles: SSE servers (direct), stdio servers (via Claude MCP or process manager), filesystem adapters
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({
      success: false,
      error: `Method ${req.method} not allowed`
    });
  }

  try {
    const { serverId, serverName = serverId, resourceUri, useClaudeMCP = false } = req.body;

    if (!resourceUri) {
      return res.status(400).json({
        success: false,
        error: "Resource URI is required"
      });
    }

    // If useClaudeMCP flag is set or serverName is a string (new format), use Claude MCP
    if (useClaudeMCP || typeof serverName === "string") {
      return await handleClaudeMCPResource(serverName, resourceUri, res);
    }

    // Legacy path: require authentication and use database lookup
    const userId = await requireAuth(req, res);
    if (!userId) return;

    if (!serverId) {
      return res.status(400).json({
        success: false,
        error: "Server ID is required for legacy resource access"
      });
    }

    return await handleLegacyServerResource(serverId, resourceUri, res);
  } catch (error: any) {
    console.error("Error in unified resource handler:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to read resource",
      code: error.code || "INTERNAL_ERROR",
      resourceUri: req.body?.resourceUri
    });
  }
}

/**
 * Handle resource access via Claude MCP
 */
async function handleClaudeMCPResource(serverName: string, resourceUri: string, res: NextApiResponse) {
  const mcpClient = getMCPClient();

  // Check if server exists in Claude MCP registry
  const server = mcpClient.getServer(serverName);
  if (!server) {
    return res.status(404).json({
      success: false,
      error: `Server ${serverName} not found in Claude MCP registry`
    });
  }

  console.log(`📁 Reading resource: ${serverName}/${resourceUri}`);

  try {
    // For Claude MCP servers, use stdio tool execution for resource reading
    if (server.type === "stdio") {
      const result = await mcpClient.executeStdioTool(serverName, "readFile", { path: resourceUri });

      if (result.success) {
        console.log(`✅ Resource read successful: ${serverName}/${resourceUri}`);
        return res.status(200).json({
          success: true,
          content: result.result,
          server: serverName,
          resourceUri,
          serverType: server.type,
          readAt: new Date().toISOString()
        });
      }
    }

    // Fall back to development mock responses
    const mockResponse = getDevelopmentMockResource(resourceUri, serverName);
    if (mockResponse) {
      return res.status(200).json(mockResponse);
    }

    return res.status(404).json({
      success: false,
      error: "Resource reading not implemented for this server type",
      server: serverName,
      resourceUri,
      serverType: server.type
    });
  } catch (error: any) {
    console.error(`Error reading resource ${resourceUri} from ${serverName}:`, error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to read resource",
      server: serverName,
      resourceUri,
      serverType: server.type
    });
  }
}

/**
 * Handle legacy server resource access (from original resource.ts + stdio-resource.ts)
 */
async function handleLegacyServerResource(serverId: string, resourceUri: string, res: NextApiResponse) {
  // Get server configuration from database
  const serverConfig = await prisma.mCPServerConfig.findUnique({
    where: { id: serverId }
  });

  if (!serverConfig) {
    return res.status(404).json({
      success: false,
      error: "Server configuration not found"
    });
  }

  if (!serverConfig.enabled) {
    return res.status(400).json({
      success: false,
      error: "Server is disabled"
    });
  }

  // Handle resource reading based on server type
  if (serverConfig.type === "sse") {
    return await handleSSEServerResource(serverId, serverConfig, resourceUri, res);
  }

  if (serverConfig.type === "stdio") {
    return await handleStdioServerResource(serverId, serverConfig, resourceUri, res);
  }

  return res.status(400).json({
    success: false,
    error: `Unknown server type: ${serverConfig.type}`
  });
}

/**
 * Handle SSE server resource access
 */
async function handleSSEServerResource(serverId: string, serverConfig: any, resourceUri: string, res: NextApiResponse) {
  const client = mcpClientManager.getServer(serverId);

  if (!client) {
    // Try to connect if not already connected
    try {
      await mcpClientManager.connectServer({
        id: serverConfig.id,
        name: serverConfig.name,
        type: "sse",
        url: serverConfig.url as string,
        enabled: true
      });

      const newClient = mcpClientManager.getServer(serverId);
      if (!newClient) {
        return res.status(500).json({
          success: false,
          error: "Failed to connect to SSE server"
        });
      }

      const resource = await newClient.readResource({
        uri: resourceUri
      });

      return res.status(200).json({
        success: true,
        content: resource.content,
        server: serverConfig.name,
        resourceUri,
        serverType: "sse",
        readAt: new Date().toISOString()
      });
    } catch (connectError) {
      console.error(`Failed to connect to SSE server ${serverId}:`, connectError);
      return res.status(500).json({
        success: false,
        error: "Failed to connect to SSE server"
      });
    }
  }

  try {
    const resource = await client.readResource({
      uri: resourceUri
    });

    return res.status(200).json({
      success: true,
      content: resource.content,
      server: serverConfig.name,
      resourceUri,
      serverType: "sse",
      readAt: new Date().toISOString()
    });
  } catch (resourceError) {
    console.error(`Failed to read resource ${resourceUri} from SSE server ${serverId}:`, resourceError);
    return res.status(500).json({
      success: false,
      error: resourceError || "Failed to read resource",
      code: resourceError || "RESOURCE_ERROR",
      server: serverConfig.name,
      resourceUri,
      serverType: "sse"
    });
  }
}

/**
 * Handle stdio server resource access (unified from stdio-resource.ts)
 */
async function handleStdioServerResource(
  serverId: string,
  serverConfig: any,
  resourceUri: string,
  res: NextApiResponse
) {
  // Check if this is a filesystem server
  const isFilesystemServer =
    typeof serverConfig.command === "string" && serverConfig.command.includes("modelcontextprotocol/server-filesystem");

  if (isFilesystemServer) {
    return await handleFilesystemServerResource(serverId, serverConfig, resourceUri, res);
  }

  // For regular stdio servers, use the standard process manager
  if (!stdioProcessManager.isProcessRunning(serverId)) {
    const started = await stdioProcessManager.startProcess({
      id: serverConfig.id,
      name: serverConfig.name,
      type: "stdio",
      command: serverConfig.command as string,
      args: serverConfig.args as string[] | undefined,
      workingDirectory: serverConfig.workingDirectory as string | undefined,
      enabled: true
    });

    if (!started) {
      return res.status(500).json({
        success: false,
        error: "Failed to start stdio server process"
      });
    }
  }

  try {
    const resourceData = await stdioProcessManager.readResource(serverId, resourceUri);
    return res.status(200).json({
      success: true,
      content: resourceData,
      server: serverConfig.name,
      resourceUri,
      serverType: "stdio",
      readAt: new Date().toISOString()
    });
  } catch (resourceError: any) {
    console.error(`Error reading resource from stdio server ${serverId}:`, resourceError);

    // Try development mock responses
    const mockResponse = getDevelopmentMockResource(resourceUri, serverConfig.name);
    if (mockResponse) {
      return res.status(200).json(mockResponse);
    }

    return res.status(404).json({
      success: false,
      error: `Resource not found or error reading resource: ${resourceError.message}`,
      server: serverConfig.name,
      resourceUri,
      serverType: "stdio"
    });
  }
}

/**
 * Handle filesystem server resource access
 */
async function handleFilesystemServerResource(
  serverId: string,
  serverConfig: any,
  resourceUri: string,
  res: NextApiResponse
) {
  try {
    // Extract server path from command
    const serverPath =
      typeof serverConfig.command === "string"
        ? serverConfig.command.replace(/^npx\s+/, "")
        : "@modelcontextprotocol/server-filesystem";

    const workingDir = (serverConfig.workingDirectory as string) || process.cwd();

    // Get server instance (starting it if needed)
    const server = await filesystemServerManager.getServer(serverId, serverPath, workingDir);

    if (!server.isRunning()) {
      await server.start();
    }

    // Read resource
    const resourceData = await server.readResource(resourceUri);
    return res.status(200).json({
      success: true,
      content: resourceData,
      server: serverConfig.name,
      resourceUri,
      serverType: "stdio-filesystem",
      readAt: new Date().toISOString()
    });
  } catch (fsError: any) {
    console.error(`Error reading resource from filesystem server ${serverId}:`, fsError);
    return res.status(500).json({
      success: false,
      error: fsError.message || "Failed to read resource from filesystem server",
      server: serverConfig.name,
      resourceUri,
      serverType: "stdio-filesystem"
    });
  }
}

/**
 * Development mock responses for testing
 */
function getDevelopmentMockResource(resourceUri: string, serverName: string) {
  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  const commonResponse = {
    success: true,
    server: serverName,
    resourceUri,
    note: "Mock response for development",
    readAt: new Date().toISOString()
  };

  if (resourceUri === "resource://status") {
    return {
      ...commonResponse,
      content: {
        status: "running",
        uptime: Math.floor(Math.random() * 100000),
        pid: Math.floor(Math.random() * 10000),
        startTime: new Date(Date.now() - Math.random() * 86400000).toISOString(),
        memoryUsage: {
          rss: Math.floor(Math.random() * 1000000000),
          heapTotal: Math.floor(Math.random() * 500000000),
          heapUsed: Math.floor(Math.random() * 400000000)
        }
      }
    };
  }

  if (resourceUri.startsWith("resource://users")) {
    return {
      ...commonResponse,
      content: [
        { id: 1, name: "Demo User 1", email: "user1@example.com", status: "active" },
        { id: 2, name: "Demo User 2", email: "user2@example.com", status: "active" },
        { id: 3, name: "Demo User 3", email: "user3@example.com", status: "inactive" }
      ]
    };
  }

  if (resourceUri.startsWith("resource://files")) {
    return {
      ...commonResponse,
      content: {
        path: resourceUri.replace("resource://files", ""),
        type: "text/plain",
        size: Math.floor(Math.random() * 10000),
        lastModified: new Date(Date.now() - Math.random() * 86400000).toISOString(),
        content: `Mock file content for ${resourceUri}`
      }
    };
  }

  return null;
}
