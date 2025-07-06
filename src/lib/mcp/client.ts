import { Client } from "@modelcontextprotocol/sdk/client/index.js";

// Changed from 'import type' to a regular import to use it as a value (constructor)
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import * as path from "path"; // Added import for path
import * as fs from "fs"; // Added import for fs

const createMCPClient = (options: { transport: any }) => new Client(options.transport);
type MCPServer = Client;

// Base for all server configs
interface MCPBaseServerConfig {
  id: string;
  name: string;
  enabled: boolean;
}

// Config for SSE type servers
export interface MCPSseConfig extends MCPBaseServerConfig {
  type: "sse";
  url: string;
  // SSE specific fields, if any, can go here
}

// Config for Standard I/O type servers
export interface MCPStdioServerConfig extends MCPBaseServerConfig {
  type: "stdio";
  command: string;
  args?: string[]; // Args should be an array of strings, made optional
  workingDirectory?: string; // Made optional
  defaultWorkingDirectory?: string; // Added for default directory
  // Stdio specific fields, if any, can go here
}

// Union type for all possible server configurations
export type MCPServerConfig = MCPSseConfig | MCPStdioServerConfig;

// Use browser-compatible UUID generation instead of relying on crypto
function generateId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Default MCP server configurations
export function getDefaultMCPConfigurations(): MCPServerConfig[] {
  // Determine OS-specific application data directory
  let baseAppPath: string;
  if (typeof window !== "undefined") {
    // For browser environment, use a generic path or a specific known one if applicable
    // This part might need adjustment based on how you want to handle browser vs. Node context for defaults
    baseAppPath = window.location.pathname.includes("cad-cam-app")
      ? "/Users/nikoemme/cad-cam-app-main-prod-main-2/user_data" // Example for a specific dev setup
      : "/workspace/user_data"; // Generic browser workspace
  } else {
    // For Node.js environment (e.g., server-side or CLI tools)
    const homeDir = process.env.HOME || "";
    if (process.platform === "darwin") {
      baseAppPath = path.join(homeDir, "Library", "Application Support");
    } else if (process.platform === "win32") {
      baseAppPath = process.env.APPDATA || path.join(homeDir, "AppData", "Roaming");
    } else {
      // Linux and other Unix-like systems
      baseAppPath = process.env.XDG_CONFIG_HOME || path.join(homeDir, ".config");
    }
    baseAppPath = path.join(baseAppPath, "cadcamfun"); // Your application-specific folder
  }

  // Ensure the base application path and project directory exist
  const workspacePath = baseAppPath; // The main workspace for the application data
  const defaultProjectDirectory = path.join(workspacePath, "projects", "default-project");

  if (typeof window === "undefined") {
    // Only try to create directories in Node.js environment
    try {
      fs.mkdirSync(workspacePath, { recursive: true });
      fs.mkdirSync(defaultProjectDirectory, { recursive: true });
      if (process.env.NODE_ENV === "development") {
        console.log(`Ensured directories exist: ${workspacePath} and ${defaultProjectDirectory}`);
      }
    } catch (error) {
      console.error("Failed to create default directories:", error);
      // Fallback to a simpler path if creation fails, or handle error as appropriate
    }
  }

  return [
    {
      id: generateId(),
      name: "Filesystem Server",
      type: "stdio",
      enabled: true,
      command: "npx",
      args: [
        "-y",
        "@modelcontextprotocol/server-filesystem"
        // The server-filesystem will operate on the workspacePath by default
        // Or it can be configured to point to a specific subdirectory if needed
      ],
      // workingDirectory can be set by the user or dynamically based on the project
      defaultWorkingDirectory: workspacePath // General workspace path as default
    },
    {
      id: generateId(),
      name: "CAD Tools Server",
      type: "stdio",
      enabled: true,
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-cad-tools"],
      defaultWorkingDirectory: defaultProjectDirectory // Default project directory for CAD tools
    },
    {
      id: generateId(),
      name: "Analysis Tools Server",
      type: "stdio",
      enabled: true,
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-analysis-tools"],
      defaultWorkingDirectory: defaultProjectDirectory // Default project directory for Analysis tools
    }
  ];
}

export class MCPClientManager {
  private servers: Map<string, MCPServer> = new Map();
  private configs: MCPServerConfig[] = [];

  constructor() {
    // Load default configurations on initialization
    this.loadDefaultConfigurations();
  }

  // Load default MCP configurations
  public loadDefaultConfigurations(): void {
    const defaultConfigs = getDefaultMCPConfigurations();
    this.configs = [...defaultConfigs];

    // Initialize enabled servers
    for (const serverConfig of this.configs) {
      if (serverConfig.enabled) {
        this.connectServer(serverConfig);
      }
    }
  }

  // Merge default configurations with user configurations
  public setConfigurations(configs: MCPServerConfig[]): void {
    // Keep default configs and merge with user configs
    const defaultConfigs = getDefaultMCPConfigurations();
    const mergedConfigs = [...defaultConfigs];

    // Add user configs that don't conflict with defaults
    for (const userConfig of configs) {
      const existingDefault = defaultConfigs.find(def => def.name === userConfig.name);
      if (!existingDefault) {
        mergedConfigs.push(userConfig);
      } else {
        // User config overrides default for same-named servers
        const defaultIndex = mergedConfigs.findIndex(conf => conf.name === userConfig.name);
        if (defaultIndex !== -1) {
          mergedConfigs[defaultIndex] = userConfig;
        }
      }
    }

    this.configs = mergedConfigs;

    // Initialize all enabled servers
    for (const serverConfig of this.configs) {
      if (serverConfig.enabled) {
        this.connectServer(serverConfig);
      }
    }
  }

  // Connect to a specific server
  public async connectServer(config: MCPServerConfig): Promise<MCPServer | null> {
    try {
      if (config.type === "sse") {
        if (!config.url) {
          console.error(`SSE server configuration for ${config.name} is missing a URL.`);
          return null;
        }

        // Create and configure SSE transport

        // Create and store client
        const client = createMCPClient(config.url as any);
        this.servers.set(config.id, client);
        return client;
      } else if (config.type === "stdio") {
        if (!config.command) {
          console.error(`Stdio server configuration for ${config.name} is missing a command.`);
          return null;
        }

        // For browser environments, stdio connections are handled by a server-side proxy
        // The actual connection happens through API endpoints

        // Create a dummy client for the stdio server that will route through API endpoints
        // This is a placeholder until connected to the backend proxy
        try {
          // Make a request to check if the proxy is available and the server is accessible
          const response = await fetch("/api/mcp/stdio-server-status", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ serverId: config.id })
          });

          // Silent check - only log on success
          if (response.ok) {
            console.log(`✅ MCP servers ready`);
          }
        } catch (proxyError) {
          // Silent error handling
        }

        return null; // No direct client object for stdio servers in browser environment
      }

      // If config.type is neither 'sse' nor 'stdio', log error
      console.error(`Unknown server type: ${(config as any).type}`);
      return null;
    } catch (error) {
      console.error(`Failed to connect to MCP server ${config.name}:`, error);
      return null;
    }
  }

  // Get all available servers
  public getServers(): Map<string, MCPServer> {
    return this.servers;
  }

  // Get a specific server by ID
  public getServer(id: string): MCPServer | undefined {
    return this.servers.get(id);
  }

  // Get all server configurations
  public getConfigurations(): MCPServerConfig[] {
    return this.configs;
  }

  // Add a new server configuration
  public async addServerConfiguration(
    config: Omit<MCPSseConfig, "id"> | Omit<MCPStdioServerConfig, "id">
  ): Promise<MCPServerConfig> {
    const newConfigWithId = {
      ...config,
      id: generateId()
    } as MCPServerConfig; // Type assertion needed here due to conditional properties

    this.configs.push(newConfigWithId);

    if (newConfigWithId.enabled) {
      await this.connectServer(newConfigWithId);
    }

    return newConfigWithId;
  }

  // Update an existing server configuration
  public async updateServerConfiguration(id: string, updatePayload: Partial<MCPServerConfig>): Promise<void> {
    const index = this.configs.findIndex(s => s.id === id);

    if (index !== -1) {
      const existingConfig = this.configs[index];
      // Merge carefully, ensuring the discriminated union shape is maintained.
      // This is a simplified merge; robust merging of discriminated unions can be complex.
      const updatedConfig = { ...existingConfig, ...updatePayload } as MCPServerConfig;

      // Basic validation to ensure required fields are present if type is stdio
      if (updatedConfig.type === "stdio" && typeof updatedConfig.command === "undefined") {
        console.error("Update invalid: MCPStdioServerConfig must have a command.");
        // Potentially throw an error or handle this case more gracefully
        return;
      }
      // Similar validation for MCPSseConfig if it had more required fields than MCPBaseServerConfig
      if (updatedConfig.type === "sse" && typeof updatedConfig.url === "undefined") {
        console.error("Update invalid: MCPSseConfig must have a url.");
        return;
      }

      this.configs[index] = updatedConfig;

      if (this.servers.has(id)) {
        this.servers.get(id)?.close(); // Assuming close is the disconnect method
        this.servers.delete(id);

        if (updatedConfig.enabled) {
          await this.connectServer(updatedConfig);
        }
      } else if (updatedConfig.enabled) {
        await this.connectServer(updatedConfig);
      }
    }
  }

  // Remove a server configuration
  public removeServerConfiguration(id: string): void {
    const index = this.configs.findIndex(s => s.id === id);

    if (index !== -1) {
      this.configs.splice(index, 1);

      // Disconnect if connected
      if (this.servers.has(id)) {
        this.servers.get(id)?.close();
        this.servers.delete(id);
      }
    }
  }

  // Disconnect from a specific server
  public async disconnectServer(id: string): Promise<void> {
    const server = this.servers.get(id);
    if (server) {
      await server.close();
      this.servers.delete(id);
    }
  }

  // Disconnect from all servers
  public async disconnectAll(): Promise<void> {
    for (const [id, server] of Array.from(this.servers.entries())) {
      await server.close();
      this.servers.delete(id);
    }
  }
}

// Create a singleton instance
export const mcpClientManager = new MCPClientManager();
