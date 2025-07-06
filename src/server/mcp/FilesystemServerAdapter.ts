// src/server/mcp/FilesystemServerAdapter.ts
// Special adapter for the @modelcontextprotocol/server-filesystem package

import { spawn, ChildProcess } from "child_process";
import { v4 as uuidv4 } from "uuid";
import { EventEmitter } from "events";

// Default capabilities for filesystem server
const DEFAULT_FILESYSTEM_CAPABILITIES = {
  name: "filesystem",
  version: "1.0.0",
  resources: [
    {
      name: "Directory",
      description: "Directory contents",
      uriTemplate: "resource://directory/{path}"
    },
    {
      name: "File",
      description: "File contents",
      uriTemplate: "resource://file/{path}"
    },
    {
      name: "Status",
      description: "Server status information",
      uriTemplate: "resource://status"
    }
  ],
  tools: [
    {
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
    {
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
    {
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
  ]
};

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

class FilesystemServerAdapter extends EventEmitter {
  private process: ChildProcess | null = null;
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private requestTimeout: number = 8000; // 8 seconds
  private outputBuffer: string = "";
  private isReady: boolean = false;
  private serverId: string;
  private serverPath: string;
  private workingDirectory: string;

  constructor(serverId: string, serverPath: string, workingDirectory: string) {
    super();
    this.serverId = serverId;
    this.serverPath = serverPath;
    this.workingDirectory = workingDirectory;
  }

  public async start(): Promise<boolean> {
    if (this.process) {
      return true; // Already running
    }

    try {
      console.log(`Starting filesystem server: ${this.serverPath}`);
      console.log(`Working directory: ${this.workingDirectory}`);

      // Check if we need to install the package first
      if (this.serverPath.includes("@modelcontextprotocol/server-filesystem")) {
        console.log("Installing MCP filesystem server package...");
        try {
          // Install the package globally to avoid package.json issues
          const installProcess = spawn("npm", ["install", "-g", "@modelcontextprotocol/server-filesystem"], {
            stdio: "inherit",
            shell: true
          });

          await new Promise<void>((resolve, reject) => {
            installProcess.on("close", code => {
              if (code === 0) {
                console.log("Package installed successfully");
                resolve();
              } else {
                console.error(`Package installation failed with code ${code}`);
                reject(new Error(`Package installation failed with code ${code}`));
              }
            });
          });
        } catch (installError) {
          console.error("Failed to install package:", installError);
          // Continue anyway, the package might be installed globally
        }
      }

      // Use mcp-server-filesystem directly instead of npx
      this.process = spawn(
        "mcp-server-filesystem",
        [
          this.workingDirectory // Use working directory as the allowed directory
        ],
        {
          cwd: this.workingDirectory,
          stdio: ["pipe", "pipe", "pipe"],
          shell: true,
          env: { ...process.env, MCP_SERVER_ID: this.serverId }
        }
      );

      // Set up event handlers
      this.process.stdout?.on("data", data => this.handleStdout(data));
      this.process.stderr?.on("data", data => this.handleStderr(data));

      this.process.on("error", error => {
        console.error(`Filesystem server error: ${error.message}`);
        this.emit("error", error);
      });

      this.process.on("exit", (code, signal) => {
        console.log(`Filesystem server exited with code ${code} and signal ${signal}`);
        this.process = null;
        this.isReady = false;
        this.emit("exit", { code, signal });
      });

      // Wait for server to be ready
      return new Promise<boolean>(resolve => {
        // The filesystem server may not output any ready message
        // So we'll just consider it ready after a short delay
        setTimeout(() => {
          this.isReady = true;
          this.emit("ready");
          resolve(true);
        }, 2000);
      });
    } catch (error) {
      console.error(`Failed to start filesystem server: ${error}`);
      return false;
    }
  }

  public isRunning(): boolean {
    return this.process !== null && this.isReady;
  }

  public async stop(): Promise<boolean> {
    if (!this.process) {
      return true; // Already stopped
    }

    try {
      // Reject all pending requests
      for (const [requestId, request] of Array.from(this.pendingRequests.entries())) {
        clearTimeout(request.timeout);
        request.reject(new Error("Server stopped"));
        this.pendingRequests.delete(requestId);
      }

      // Send SIGTERM to the process
      this.process.kill();

      return new Promise<boolean>(resolve => {
        setTimeout(() => {
          if (this.process) {
            // Force kill if still running
            this.process.kill("SIGKILL");
            this.process = null;
          }
          this.isReady = false;
          resolve(true);
        }, 2000);
      });
    } catch (error) {
      console.error(`Failed to stop filesystem server: ${error}`);
      return false;
    }
  }

  public async getCapabilities(): Promise<any> {
    if (!this.isRunning()) {
      throw new Error("Server is not running");
    }

    // For filesystem server, we'll use the default capabilities
    // since it may not follow the standard MCP protocol
    return DEFAULT_FILESYSTEM_CAPABILITIES;
  }

  public async readResource(resourceUri: string): Promise<any> {
    if (!this.isRunning()) {
      throw new Error("Server is not running");
    }

    // Parse the resource URI
    const match = resourceUri.match(/^resource:\/\/([^/]+)\/?(.*)$/);
    if (!match) {
      throw new Error(`Invalid resource URI: ${resourceUri}`);
    }

    const [, resourceType, path] = match;

    // Handle different resource types
    switch (resourceType) {
      case "status":
        return {
          status: "running",
          pid: this.process?.pid,
          startedAt: new Date().toISOString()
        };

      case "directory":
        return this.callTool("listFiles", { path: path || "." });

      case "file":
        return this.callTool("readFile", { path, encoding: "utf8" });

      default:
        throw new Error(`Unknown resource type: ${resourceType}`);
    }
  }

  public async callTool(toolName: string, parameters: any): Promise<any> {
    if (!this.isRunning()) {
      throw new Error("Server is not running");
    }

    // Generate a unique ID for this request
    const requestId = uuidv4();

    // Create a JSON-RPC style request
    const request = {
      jsonrpc: "2.0",
      id: requestId,
      method: toolName,
      params: parameters
    };

    return new Promise((resolve, reject) => {
      // Set a timeout for the request
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Request timed out after ${this.requestTimeout}ms`));
      }, this.requestTimeout);

      // Store the request
      this.pendingRequests.set(requestId, { resolve, reject, timeout });

      // Implement tool-specific logic for filesystem server
      switch (toolName) {
        case "readFile":
          this.handleReadFile(requestId, parameters.path, parameters.encoding);
          break;
        case "writeFile":
          this.handleWriteFile(requestId, parameters.path, parameters.content, parameters.encoding);
          break;
        case "listFiles":
          this.handleListFiles(requestId, parameters.path);
          break;
        default:
          clearTimeout(timeout);
          this.pendingRequests.delete(requestId);
          reject(new Error(`Unknown tool: ${toolName}`));
      }
    });
  }

  private handleStdout(data: Buffer): void {
    const text = data.toString();
    this.outputBuffer += text;

    console.log(`[Filesystem stdout] ${text.trim()}`);

    // Try to extract JSON responses from the output
    this.processOutputBuffer();
  }

  private handleStderr(data: Buffer): void {
    const text = data.toString();
    console.error(`[Filesystem stderr] ${text.trim()}`);
  }

  private processOutputBuffer(): void {
    // Look for JSON objects in the output buffer
    const jsonMatches = this.outputBuffer.match(/\{[\s\S]*?\}/g);
    if (!jsonMatches) return;

    for (const jsonStr of jsonMatches) {
      try {
        const response = JSON.parse(jsonStr);

        // Check if this is a response to a pending request
        if (response.id && this.pendingRequests.has(response.id)) {
          const { resolve, reject, timeout } = this.pendingRequests.get(response.id)!;

          clearTimeout(timeout);

          if (response.error) {
            reject(new Error(response.error.message || "Unknown error"));
          } else {
            resolve(response.result);
          }

          this.pendingRequests.delete(response.id);
        }

        // Remove the processed JSON from the buffer
        this.outputBuffer = this.outputBuffer.replace(jsonStr, "");
      } catch (error) {
        // Not valid JSON, keep in buffer
      }
    }
  }

  // Custom implementations for filesystem server tools
  private async handleReadFile(requestId: string, path: string, encoding: string = "utf8"): Promise<void> {
    try {
      // Implementation uses Node.js fs module directly
      const fs = require("fs").promises;
      const content = await fs.readFile(path, { encoding });

      this.resolveRequest(requestId, content);
    } catch (error: any) {
      this.rejectRequest(requestId, error);
    }
  }

  private async handleWriteFile(
    requestId: string,
    path: string,
    content: string,
    encoding: string = "utf8"
  ): Promise<void> {
    try {
      const fs = require("fs").promises;
      await fs.writeFile(path, content, { encoding });

      this.resolveRequest(requestId, { success: true, path });
    } catch (error: any) {
      this.rejectRequest(requestId, error);
    }
  }

  private async handleListFiles(requestId: string, path: string): Promise<void> {
    try {
      const fs = require("fs").promises;
      const files = await fs.readdir(path, { withFileTypes: true });

      const result = files.map((dirent: any) => ({
        name: dirent.name,
        isDirectory: dirent.isDirectory(),
        isFile: dirent.isFile()
      }));

      this.resolveRequest(requestId, result);
    } catch (error: any) {
      this.rejectRequest(requestId, error);
    }
  }

  private resolveRequest(requestId: string, result: any): void {
    const request = this.pendingRequests.get(requestId);
    if (!request) return;

    clearTimeout(request.timeout);
    request.resolve(result);
    this.pendingRequests.delete(requestId);
  }

  private rejectRequest(requestId: string, error: Error): void {
    const request = this.pendingRequests.get(requestId);
    if (!request) return;

    clearTimeout(request.timeout);
    request.reject(error);
    this.pendingRequests.delete(requestId);
  }
}

export class FilesystemServerManager {
  private servers: Map<string, FilesystemServerAdapter> = new Map();

  public async getServer(
    serverId: string,
    serverPath: string,
    workingDirectory: string
  ): Promise<FilesystemServerAdapter> {
    // Check if we already have a server instance
    if (this.servers.has(serverId)) {
      return this.servers.get(serverId)!;
    }

    // Create a new server instance
    const server = new FilesystemServerAdapter(serverId, serverPath, workingDirectory);
    this.servers.set(serverId, server);

    return server;
  }

  public async startServer(serverId: string, serverPath: string, workingDirectory: string): Promise<boolean> {
    const server = await this.getServer(serverId, serverPath, workingDirectory);
    return server.start();
  }

  public async stopServer(serverId: string): Promise<boolean> {
    const server = this.servers.get(serverId);
    if (!server) {
      return false;
    }

    const stopped = await server.stop();
    if (stopped) {
      this.servers.delete(serverId);
    }

    return stopped;
  }

  public async stopAllServers(): Promise<void> {
    const promises = Array.from(this.servers.keys()).map(serverId => this.stopServer(serverId));

    await Promise.all(promises);
  }
}

// Create a singleton instance
export const filesystemServerManager = new FilesystemServerManager();
