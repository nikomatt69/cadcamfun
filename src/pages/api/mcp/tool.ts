// Unified Tool Execution API
// Consolidates: tool.ts + stdio-tool.ts
// Supports: SSE servers (direct), stdio servers (via Claude MCP), URL proxy tools
import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/src/lib/prisma";
import { mcpClientManager } from "@/src/lib/mcp/client";
import { getMCPClient } from "../../../lib/ai/mcp/mcpOfficialClient";
import { requireAuth } from "@/src/lib/api/auth";

/**
 * Unified tool execution endpoint
 * Handles: SSE servers, stdio servers (Claude MCP), mock tools for development
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({
      success: false,
      error: `Method ${req.method} not allowed`
    });
  }

  // Support both legacy format (serverId) and new format (serverName)
  const {
    serverId,
    serverName = serverId,
    toolName,
    parameters,
    useClaudeMCP = false // Flag to force Claude MCP usage
  } = req.body;

  if (!serverName || !toolName) {
    return res.status(400).json({
      success: false,
      error: "Server name/ID and tool name are required"
    });
  }

  try {
    // If useClaudeMCP flag is set or serverName is a string (new format), use Claude MCP
    if (useClaudeMCP || typeof serverName === "string") {
      return await handleClaudeMCPTool(serverName, toolName, parameters, res);
    }

    // Legacy path: require authentication and use database lookup
    const userId = await requireAuth(req, res);
    if (!userId) return;

    return await handleLegacyServerTool(serverId, toolName, parameters, res);
  } catch (error: any) {
    console.error(`Error in unified tool execution:`, error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to execute tool",
      code: error.code || "INTERNAL_ERROR",
      server: serverName,
      tool: toolName,
      executedAt: new Date().toISOString()
    });
  }
}

/**
 * Handle tool execution via Claude MCP (unified from stdio-tool.ts)
 */
async function handleClaudeMCPTool(serverName: string, toolName: string, parameters: any, res: NextApiResponse) {
  const mcpClient = getMCPClient();

  // Check if server exists in Claude MCP registry
  const server = mcpClient.getServer(serverName);
  if (!server) {
    return res.status(404).json({
      success: false,
      error: `Server ${serverName} not found in Claude MCP registry`
    });
  }

  console.log(`🔧 Executing ${server.type} tool: ${serverName}.${toolName}`);

  // Handle stdio servers
  if (server.type === "stdio") {
    // Test server connection first
    const connectionTest = await mcpClient.testMCPConnection(serverName);
    if (!connectionTest.success) {
      return res.status(503).json({
        success: false,
        error: `Server ${serverName} is not available: ${connectionTest.message}`,
        serverStatus: "unavailable"
      });
    }

    const result = await mcpClient.executeStdioTool(serverName, toolName, parameters);

    if (result.success) {
      console.log(`✅ Stdio tool execution successful: ${serverName}.${toolName}`);
      return res.status(200).json({
        success: true,
        result: result.result,
        server: serverName,
        tool: toolName,
        serverType: "stdio",
        executedAt: new Date().toISOString()
      });
    } else {
      console.error(`❌ Stdio tool execution failed: ${serverName}.${toolName} - ${result.error}`);

      // Try development mock responses
      const mockResponse = getDevelopmentMockResponse(toolName, parameters, serverName);
      if (mockResponse) {
        return res.status(200).json(mockResponse);
      }

      return res.status(500).json({
        success: false,
        error: result.error || "Tool execution failed",
        server: serverName,
        tool: toolName,
        serverType: "stdio",
        executedAt: new Date().toISOString()
      });
    }
  }

  // Handle URL servers
  if (server.type === "url") {
    const result = await mcpClient.executeURLTool(serverName, toolName, parameters);

    if (result.success) {
      console.log(`✅ URL tool execution successful: ${serverName}.${toolName}`);
      return res.status(200).json({
        success: true,
        result: result.result,
        server: serverName,
        tool: toolName,
        serverType: "url",
        executedAt: new Date().toISOString()
      });
    } else {
      return res.status(500).json({
        success: false,
        error: result.error || "URL tool execution failed",
        server: serverName,
        tool: toolName,
        serverType: "url",
        executedAt: new Date().toISOString()
      });
    }
  }

  return res.status(400).json({
    success: false,
    error: `Unsupported server type: ${server.type}`,
    server: serverName,
    tool: toolName
  });
}

/**
 * Handle legacy server tool execution (from original tool.ts)
 */
async function handleLegacyServerTool(serverId: string, toolName: string, parameters: any, res: NextApiResponse) {
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

  // Handle SSE servers via mcpClientManager
  if (serverConfig.type === "sse") {
    return await handleSSEServerTool(serverId, serverConfig, toolName, parameters, res);
  }

  // Handle stdio servers via Claude MCP proxy
  if (serverConfig.type === "stdio") {
    return await handleClaudeMCPTool(serverConfig.name, toolName, parameters, res);
  }

  return res.status(400).json({
    success: false,
    error: `Unknown server type: ${serverConfig.type}`
  });
}

/**
 * Handle SSE server tool execution
 */
async function handleSSEServerTool(
  serverId: string,
  serverConfig: any,
  toolName: string,
  parameters: any,
  res: NextApiResponse
) {
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

      const result = await newClient.callTool({
        name: toolName,
        arguments: parameters
      });

      return res.status(200).json({
        success: true,
        result,
        server: serverConfig.name,
        tool: toolName,
        serverType: "sse",
        executedAt: new Date().toISOString()
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
    const result = await client.callTool({
      name: toolName,
      arguments: parameters
    });

    return res.status(200).json({
      success: true,
      result,
      server: serverConfig.name,
      tool: toolName,
      serverType: "sse",
      executedAt: new Date().toISOString()
    });
  } catch (toolError) {
    console.error(`Failed to execute tool ${toolName} on SSE server ${serverId}:`, toolError);
    return res.status(500).json({
      success: false,
      error: toolError || "Failed to execute tool",
      code: toolError || "TOOL_ERROR",
      server: serverConfig.name,
      tool: toolName,
      serverType: "sse"
    });
  }
}

/**
 * Development mock responses for testing
 */
function getDevelopmentMockResponse(toolName: string, parameters: any, serverName: string) {
  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  const commonResponse = {
    success: true,
    server: serverName,
    tool: toolName,
    note: "Mock response for development",
    executedAt: new Date().toISOString()
  };

  switch (toolName) {
    case "readFile":
      if (parameters?.path) {
        return {
          ...commonResponse,
          result: {
            content: `Mock content for file: ${parameters.path}`,
            mimeType: "text/plain",
            size: 100
          }
        };
      }
      break;

    case "listFiles":
      if (parameters?.path) {
        return {
          ...commonResponse,
          result: {
            files: [
              { name: "example.txt", type: "file", size: 1024 },
              { name: "folder", type: "directory" }
            ],
            path: parameters.path
          }
        };
      }
      break;

    case "writeFile":
      if (parameters?.path && parameters?.content) {
        return {
          ...commonResponse,
          result: {
            path: parameters.path,
            bytesWritten: parameters.content.length
          }
        };
      }
      break;

    case "echo":
      if (parameters?.text) {
        return {
          ...commonResponse,
          result: parameters.text
        };
      }
      break;

    case "execute_command":
      if (parameters?.command) {
        return {
          ...commonResponse,
          result: {
            commandExecuted: parameters.command,
            args: parameters.args || [],
            exitCode: 0,
            output: `Executed command: ${parameters.command} ${parameters.args ? parameters.args.join(" ") : ""}`
          }
        };
      }
      break;
  }

  return null;
}
