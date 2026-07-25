// Unified Server Info API
// Consolidates: server-info.ts + stdio-server-capabilities.ts
// Supports: SSE servers, stdio servers (filesystem and generic)
import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/src/lib/prisma";
import { mcpClientManager } from "@/src/lib/mcp/client";
import { requireAuth } from "src/lib/api/auth";
import { stdioProcessManager } from "@/src/server/mcp/StdioProcessManager";
import { filesystemServerManager } from "@/src/server/mcp/FilesystemServerAdapter";

interface ServerCapabilities {
  name?: string;
  version?: string;
  instructions?: string;
  resources?: { [x: string]: unknown; listChanged?: boolean | undefined; subscribe?: boolean | undefined };
  tools?: { [x: string]: unknown; listChanged?: boolean | undefined };
}

// Add default filesystem tools and resources for development
function addDefaultTools(info: ServerCapabilities): ServerCapabilities {
  if (process.env.NODE_ENV === "development") {
    info.tools = {
      readFile: {
        name: "readFile",
        description: "Read a file from the filesystem",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Path to the file"
            },
            encoding: {
              type: "string",
              description: "File encoding (default: utf8)"
            }
          },
          required: ["path"]
        }
      },
      writeFile: {
        name: "writeFile",
        description: "Write a file to the filesystem",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Path to the file"
            },
            content: {
              type: "string",
              description: "Content to write"
            },
            encoding: {
              type: "string",
              description: "File encoding (default: utf8)"
            }
          },
          required: ["path", "content"]
        }
      },
      listFiles: {
        name: "listFiles",
        description: "List files in a directory",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Path to the directory"
            }
          },
          required: ["path"]
        }
      }
    };

    info.resources = {
      Directory: {
        name: "Directory",
        description: "Directory contents",
        uriTemplate: "resource://directory/{path}"
      },
      File: {
        name: "File",
        description: "File contents",
        uriTemplate: "resource://file/{path}"
      },
      Status: {
        name: "Status",
        description: "Server status information",
        uriTemplate: "resource://status"
      }
    };
  }

  return info;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Check if authentication is required based on environment

  const userId = await requireAuth(req, res);
  if (!userId) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { serverId } = req.body;

  if (!serverId) {
    return res.status(400).json({ error: "Server ID is required" });
  }

  try {
    // Get server configuration from database
    const serverConfig = await prisma.mCPServerConfig.findUnique({
      where: { id: serverId }
    });

    if (!serverConfig) {
      return res.status(404).json({ error: "Server configuration not found" });
    }

    if (!serverConfig.enabled) {
      return res.status(400).json({ error: "Server is disabled" });
    }

    let info: ServerCapabilities;

    // Handle differently based on server type
    if (serverConfig.type === "sse") {
      // For SSE servers, get capabilities from the client
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
            return res.status(500).json({ error: "Failed to connect to SSE server" });
          }

          const capabilities = await newClient.getServerCapabilities();
          if (!capabilities) {
            throw new Error("getServerCapabilities returned undefined");
          }
          info = capabilities;
        } catch (connectError) {
          console.error(`Failed to connect to SSE server ${serverId}:`, connectError);
          return res.status(500).json({ error: "Failed to connect to SSE server" });
        }
      } else {
        // Get capabilities from existing client
        try {
          const capabilities = await client.getServerCapabilities();
          if (!capabilities) {
            throw new Error("getServerCapabilities returned undefined");
          }
          info = capabilities;
        } catch (capabilitiesError) {
          console.error(`Failed to get capabilities from SSE server ${serverId}:`, capabilitiesError);
          return res.status(500).json({ error: "Failed to get server capabilities" });
        }
      }
    } else if (serverConfig.type === "stdio") {
      // For stdio servers, get capabilities directly (consolidated from stdio-server-capabilities.ts)
      try {
        // Check if this is a filesystem server
        const isFilesystemServer =
          typeof serverConfig.command === "string" &&
          serverConfig.command.includes("@modelcontextprotocol/server-filesystem");

        if (isFilesystemServer) {
          // Use the specialized filesystem server adapter
          const serverPath =
            typeof serverConfig.command === "string"
              ? serverConfig.command.replace(/^npx\s+/, "")
              : "@modelcontextprotocol/server-filesystem";
          const workingDir = (serverConfig.workingDirectory as string) || process.cwd();

          await filesystemServerManager.startServer(serverId, serverPath, workingDir);
          const server = await filesystemServerManager.getServer(serverId, serverPath, workingDir);
          info = await server.getCapabilities();
        } else {
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
              throw new Error("Failed to start stdio server process");
            }
          }

          // Get capabilities from process manager
          info = await stdioProcessManager.getServerCapabilities(serverId);
        }
      } catch (stdioError: any) {
        console.error(`Error getting stdio server capabilities for ${serverId}:`, stdioError);

        // Provide default capabilities for development
        info = {
          name: serverConfig.name,
          version: "1.0.0",
          instructions: `Error retrieving capabilities: ${stdioError.message}`,
          resources: {
            Status: {
              name: "Status",
              description: "Server status information",
              uriTemplate: "resource://status"
            }
          },
          tools: {
            echo: {
              name: "echo",
              description: "Echo the input back to the output",
              parameters: {
                type: "object",
                properties: {
                  text: { type: "string", description: "Text to echo" }
                },
                required: ["text"]
              }
            }
          }
        };

        // Add default tools for development
        info = addDefaultTools(info);
      }
    } else {
      return res.status(400).json({ error: `Unknown server type: ${serverConfig.type}` });
    }

    // Return the server info
    return res.status(200).json(info);
  } catch (error: any) {
    console.error(`Error getting info from server ${serverId}:`, error);
    return res.status(500).json({ error: error.message || "Failed to get server info" });
  }
}
