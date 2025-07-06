// src/lib/ai/mcp/mcpOfficialClient.ts
// MCP Client conforme alla specifica ufficiale Anthropic - BROWSER SAFE
import Anthropic from "@anthropic-ai/sdk";

import os from "os";
import path from "path";

// Import necessary types and the service from websearchService
import {
  webSearchService,
  WebSearchOptions as OriginalWebSearchOptions, // Import with alias
  CADContextForSearch as OriginalCADContextForSearch, // Import with alias
  WebSearchResponse
} from "@/src/lib/ai/websearch/websearchService"; // Adjust path if necessary
import { AIResponse } from "@/src/types/ai"; // Assuming AIResponse is a general type

// Re-export the types for use by consumers of mcpOfficialClient
export type WebSearchOptions = OriginalWebSearchOptions;
export type CADContextForSearch = OriginalCADContextForSearch;
export type { WebSearchResponse }; // Can also re-export directly if no name change

/**
 * Configurazione server MCP secondo spec Anthropic
 */
export interface MCPServerConfig {
  type: "url" | "stdio";
  url?: string; // Per type: 'url'
  command?: string; // Per type: 'stdio'
  args?: string[]; // Per type: 'stdio'
  workingDirectory?: string; // Per type: 'stdio'
  name: string;
  tool_configuration?: {
    enabled: boolean;
    allowed_tools?: string[];
  };
  authorization_token?: string;
}

/**
 * Risultato di una tool call MCP
 */
export interface MCPToolCall {
  server: string;
  tool: string;
  input: any;
  result?: any;
}

/**
 * Risposta processata da MCP
 */
export interface MCPProcessedResponse {
  textContent: string;
  mcpToolCalls: MCPToolCall[];
}

/**
 * Client MCP ufficiale che implementa la specifica Anthropic
 */
export class MCPOfficialClient {
  private client: Anthropic;
  private servers: Map<string, MCPServerConfig> = new Map();

  // Static variable to track last log time for each server
  private static _lastLogTime: Map<string, number> | null = null;

  constructor(apiKey?: string) {
    // Use server-side API key, never expose client-side
    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    if (!key) {
      console.warn("⚠️ No Anthropic API key available - MCP features will be limited");
    }
    this.client = new Anthropic({
      apiKey: key,
      dangerouslyAllowBrowser: typeof window !== "undefined"
    });
  }

  /**
   * Registra un server MCP
   */
  registerMCPServer(config: MCPServerConfig): void {
    this.servers.set(config.name, config);
  }

  /**
   * Ottieni server registrati
   */
  getRegisteredServers(): MCPServerConfig[] {
    return Array.from(this.servers.values());
  }

  /**
   * Ottieni un server specifico
   */
  getServer(name: string): MCPServerConfig | undefined {
    return this.servers.get(name);
  }

  /**
   * Invia messaggio con supporto MCP completo
   */
  async sendMessageWithMCP(
    messages: Anthropic.Messages.MessageParam[],
    options: {
      model?: string;
      system?: string;
      max_tokens?: number;
      temperature?: number;
      mcpServers?: string[]; // nomi dei server da utilizzare
      thinking?: {
        type: string;
        budget_tokens: number;
      };
    } = {}
  ): Promise<Anthropic.Messages.Message> {
    const {
      model = "claude-sonnet-4-20250514",
      system,
      max_tokens = 4000,
      temperature = 0.7,
      mcpServers = [],
      thinking
    } = options;

    // When thinking is enabled, temperature must be 1 (Anthropic requirement)
    const finalTemperature = thinking ? 1 : temperature;

    // Separare server URL e stdio per processing separato
    const urlServers: MCPServerConfig[] = [];
    const stdioServers: MCPServerConfig[] = [];

    mcpServers.forEach(serverName => {
      const server = this.servers.get(serverName);
      if (server) {
        if (server.type === "url") {
          urlServers.push(server);
        } else if (server.type === "stdio") {
          stdioServers.push(server);
        }
      }
    });

    // Per server URL, utilizziamo i nostri proxy API locali
    if (urlServers.length > 0) {
      console.log(`🌐 Using ${urlServers.length} URL servers through local proxies`);
    }

    // Per server stdio, esegui chiamate attraverso proxy API
    if (stdioServers.length > 0) {
      console.log(`🔧 Using ${stdioServers.length} stdio servers through proxy`);

      // Esegui chiamate ai tool degli stdio servers se necessario
      for (const stdioServer of stdioServers) {
        try {
          // Esempio di chiamata per il filesystem server
          if (stdioServer.name === "filesystem") {
            // Qui puoi aggiungere logica specifica per il filesystem
            console.log(`📁 Filesystem server available`);
          }
        } catch (error) {
          console.warn(`⚠️ error`);
        }
      }
    }

    try {
      const requestParams: any = {
        model,
        max_tokens,
        temperature: finalTemperature,
        messages,
        ...(system && { system }),
        ...(thinking && { thinking }),
        // Solo server URL per Claude API
        ...(urlServers.length > 0 && { mcp_servers: urlServers })
      };

      const response = await this.client.messages.create(requestParams, {
        // Header beta richiesto per MCP
        headers: {
          "anthropic-beta": "mcp-client-2025-04-04"
        }
      });

      return response;
    } catch (error) {
      console.error("❌ MCP request failed:", error);
      throw error;
    }
  }

  /**
   * Processa i block MCP dalla risposta
   */
  processMCPBlocks(response: Anthropic.Messages.Message): MCPProcessedResponse {
    const textContent: string[] = [];
    const mcpToolCalls: MCPToolCall[] = [];

    response.content.forEach(block => {
      if (block.type === "text") {
        textContent.push(block.text);
      } else if ((block as any).type === "mcp_tool_call") {
        const mcpBlock = block as any;
        mcpToolCalls.push({
          server: mcpBlock.server,
          tool: mcpBlock.tool,
          input: mcpBlock.input
        });
      } else if ((block as any).type === "mcp_tool_result") {
        const mcpBlock = block as any;
        // Associa il risultato alla chiamata corrispondente
        const toolCall = mcpToolCalls.find(call => call.server === mcpBlock.server && call.tool === mcpBlock.tool);
        if (toolCall) {
          toolCall.result = mcpBlock.result;
        }
      }
    });

    return {
      textContent: textContent.join("\n"),
      mcpToolCalls
    };
  }

  /**
   * Test di connessione con un server MCP
   */
  async testMCPConnection(serverName: string): Promise<{
    success: boolean;
    message: string;
    availableTools?: string[];
    error?: string;
  }> {
    const server = this.servers.get(serverName);
    if (!server) {
      return {
        success: false,
        message: `Server ${serverName} not registered`,
        error: "SERVER_NOT_FOUND"
      };
    }

    // Static variable to track last log time for each server
    if (!MCPOfficialClient._lastLogTime) {
      MCPOfficialClient._lastLogTime = new Map<string, number>();
    }

    // Only log if more than 30 seconds have passed since the last log for this server
    const now = Date.now();
    const lastLog = MCPOfficialClient._lastLogTime.get(serverName) || 0;
    const shouldLog = now - lastLog > 30000; // 30 seconds throttle

    if (shouldLog) {
      console.log(`🔍 Testing MCP connection to ${serverName}...`);
      MCPOfficialClient._lastLogTime.set(serverName, now);
    }

    if (server.type === "stdio") {
      // Per server stdio, testa attraverso proxy API
      try {
        const baseUrl = process.env.NEXTAUTH_URL || process.env.VERCEL_URL || "https://cadcamfun.xyz";
        const apiUrl = new URL("/api/mcp/stdio-server-status", baseUrl).toString();

        const response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            serverName: serverName,
            command: server.command,
            args: server.args
          })
        });

        if (!response.ok) {
          throw new Error(`Proxy response not ok: ${response.status}`);
        }

        const data = await response.json();

        console.log(`✅ Stdio MCP server ${serverName} is accessible through proxy`);
        return {
          success: true,
          message: `Successfully connected to stdio server ${serverName}`,
          availableTools: server.tool_configuration?.allowed_tools || []
        };
      } catch (proxyError) {
        console.error(`❌ Stdio MCP proxy test failed for ${serverName}:`, proxyError);
        return {
          success: false,
          message: `Failed to connect to stdio server ${serverName} through proxy`,
          error: proxyError instanceof Error ? proxyError.message : "Proxy connection failed"
        };
      }
    } else {
      // Test per server URL attraverso proxy locale
      try {
        // Test con tool di base per verificare connettività
        const testTools = {
          "web-search-tools": "web_search",
          "cad-tools": "analyze_geometry",
          "cam-tools": "generate_toolpath",
          "analysis-tools": "stress_analysis"
        };

        const testTool = testTools[serverName as keyof typeof testTools];
        if (testTool) {
          const testResult = await this.executeURLTool(serverName, testTool, { test: true });

          if (testResult.success) {
            console.log(`✅  ${serverName}`);
            return {
              success: true,
              message: `Successfully connected to URL server ${serverName} through proxy`,
              availableTools: server.tool_configuration?.allowed_tools || []
            };
          } else {
            throw new Error(testResult.error || "Tool test failed");
          }
        } else {
          // Fallback: assume connection is OK if server is registered
          return {
            success: true,
            message: `URL server ${serverName} is registered and configured`,
            availableTools: server.tool_configuration?.allowed_tools || []
          };
        }
      } catch (proxyError) {
        console.error(`❌  ${serverName}:`, proxyError);
        return {
          success: false,
          message: `Failed to connect to URL server ${serverName} through proxy`,
          error: proxyError instanceof Error ? proxyError.message : "Proxy connection failed"
        };
      }
    }
  }

  /**
   * Test completo di tutti i server registrati
   */
  async testAllConnections(): Promise<{
    totalServers: number;
    successfulConnections: number;
    results: Array<{
      serverName: string;
      success: boolean;
      message: string;
      availableTools?: string[];
    }>;
  }> {
    const servers = Array.from(this.servers.keys());
    const results = [];
    let successfulConnections = 0;

    for (const serverName of servers) {
      const result = await this.testMCPConnection(serverName);
      results.push({
        serverName,
        ...result
      });

      if (result.success) {
        successfulConnections++;
      }
    }

    return {
      totalServers: servers.length,
      successfulConnections,
      results
    };
  }

  /**
   * Setup server MCP predefiniti per CAD/CAM
   */
  setupDefaultMCPServers(): void {
    console.log("🔧 Setting up default MCP servers for CAD/CAM...");

    // Browser-safe path handling
    let baseAppPath: string;
    if (typeof window === "undefined") {
      // Server-side: use Node.js paths

      const homeDir = os.homedir();
      if (process.platform === "darwin") {
        baseAppPath = path.join(homeDir, "Library", "Application Support", "cadcamfun");
      } else if (process.platform === "win32") {
        baseAppPath = path.join(homeDir, "AppData", "Roaming", "cadcamfun");
      } else {
        baseAppPath = path.join(homeDir, ".config", "cadcamfun");
      }
    } else {
      // Browser-side: use current working directory reference
      baseAppPath = "/Users/"; // This is a placeholder for browser, actual paths for stdio servers come from args or specific config.
    }

    // Server filesystem con stdio (updated with path from claude_desktop_config.json)
    this.registerMCPServer({
      type: "stdio",
      name: "filesystem",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", baseAppPath],
      workingDirectory: baseAppPath, // Keep original workingDirectory logic
      tool_configuration: {
        enabled: true,
        allowed_tools: ["readFile", "writeFile", "listFiles", "createDirectory", "deleteFile", "getFileInfo"]
      }
    });

    // Server WebSearch per Claude AI (URL-based)
    this.registerMCPServer({
      type: "url",
      name: "web-search-tools",
      url: "https://api.anthropic.com/v1/mcp/websearch", // Placeholder - sarà gestito dal servizio locale
      tool_configuration: {
        enabled: true,
        allowed_tools: ["web_search", "search_with_context", "semantic_search"]
      }
    });

    // Database server removed - not essential for basic functionality

    // Server Database CADCAMFUN (stdio-based)

    // Memory server for persistent context
    this.registerMCPServer({
      type: "stdio",
      name: "memory",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-memory"],
      tool_configuration: {
        enabled: true,
        allowed_tools: [
          "mcp_memory_create_entities",
          "mcp_memory_create_relations",
          "mcp_memory_add_observations",
          "mcp_memory_delete_entities",
          "mcp_memory_delete_observations",
          "mcp_memory_delete_relations",
          "mcp_memory_read_graph",
          "mcp_memory_search_nodes",
          "mcp_memory_open_nodes"
        ]
      }
    });

    // Sequential thinking server for enhanced reasoning
    this.registerMCPServer({
      type: "stdio",
      name: "sequential-thinking",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
      tool_configuration: {
        enabled: true,
        allowed_tools: [
          "thinking_create_session",
          "thinking_add_step",
          "thinking_get_session",
          "thinking_list_sessions"
        ]
      }
    });

    // Setup complete - core servers ready
  }

  /**
   * Esegui tool call su server URL attraverso proxy API locale
   */
  async executeURLTool(
    serverName: string,
    toolName: string,
    parameters: any
  ): Promise<{
    success: boolean;
    result?: any;
    error?: string;
  }> {
    const server = this.servers.get(serverName);
    if (!server || server.type !== "url") {
      return {
        success: false,
        error: `Server ${serverName} not found or not a URL server`
      };
    }

    try {
      // Determina l'endpoint proxy basato sul server name
      let proxyEndpoint: string;
      switch (serverName) {
        case "web-search-tools":
          proxyEndpoint = "/api/mcp/websearch";
          break;
        case "cad-tools":
        case "cam-tools":
        case "analysis-tools":
        case "specialized-tools":
          proxyEndpoint = "/api/mcp/specialized-tools";
          break;
        case "cadcamfun-database":
          // Database server uses stdio, not URL proxy
          return {
            success: false,
            error: `Server ${serverName} is a stdio server, use executeStdioTool instead`
          };
        default:
          return {
            success: false,
            error: `No proxy endpoint configured for server ${serverName}`
          };
      }

      const baseUrl =
        typeof window !== "undefined"
          ? window.location.origin
          : process.env.NEXTAUTH_URL || process.env.VERCEL_URL || "https://cadcamfun.xyz";
      const apiUrl = new URL(proxyEndpoint, baseUrl).toString();

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          tool: toolName,
          parameters
        })
      });

      if (!response.ok) {
        throw new Error(`Tool execution failed: ${response.status}`);
      }

      const result = await response.json();
      return {
        success: result.success,
        result: result.result
      };
    } catch (error) {
      console.error(`❌ URL tool execution failed for ${serverName}.${toolName}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }

  /**
   * Esegui tool call su server stdio attraverso proxy API
   */
  async executeStdioTool(
    serverName: string,
    toolName: string,
    parameters: any
  ): Promise<{
    success: boolean;
    result?: any;
    error?: string;
  }> {
    const server = this.servers.get(serverName);
    if (!server || server.type !== "stdio") {
      return {
        success: false,
        error: `Server ${serverName} not found or not a stdio server`
      };
    }

    try {
      const baseUrl = process.env.NEXTAUTH_URL || process.env.VERCEL_URL || "https://cadcamfun.xyz";
      const apiUrl = new URL("/api/mcp/tool", baseUrl).toString();

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          serverName,
          toolName,
          parameters,
          command: server.command,
          args: server.args,
          workingDirectory: server.workingDirectory
        })
      });

      if (!response.ok) {
        throw new Error(`Tool execution failed: ${response.status}`);
      }

      const result = await response.json();
      return {
        success: true,
        result: result.data
      };
    } catch (error) {
      console.error(`❌ Stdio tool execution failed for ${serverName}.${toolName}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }
}

// Singleton instance
let mcpClientInstance: MCPOfficialClient | null = null;

export const getMCPClient = (): MCPOfficialClient => {
  if (!mcpClientInstance) {
    // Never use NEXT_PUBLIC_ for API keys - security risk!
    const apiKey = typeof window === "undefined" ? process.env.ANTHROPIC_API_KEY : undefined;

    mcpClientInstance = new MCPOfficialClient(apiKey);
    mcpClientInstance.setupDefaultMCPServers();
  }
  return mcpClientInstance;
};

/**
 * Convenienza per ottenere il client con test di connessione
 */
export const getMCPClientWithTest = async (): Promise<{
  client: MCPOfficialClient;
  testResults: any;
}> => {
  const client = getMCPClient();
  const testResults = await client.testAllConnections();

  return { client, testResults };
};

/**
 * Test specifico per il filesystem server
 */
export const testFilesystemServer = async (): Promise<{
  success: boolean;
  tools: string[];
  error?: string;
}> => {
  try {
    const client = getMCPClient();
    const result = await client.testMCPConnection("filesystem");

    if (result.success) {
      console.log("✅ Filesystem server is working correctly");
      return {
        success: true,
        tools: result.availableTools || []
      };
    } else {
      console.error("❌ Filesystem server test failed:", result.message);
      return {
        success: false,
        tools: [],
        error: result.error
      };
    }
  } catch (error) {
    console.error("❌ Filesystem server test error:", error);
    return {
      success: false,
      tools: [],
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
};

/**
 * Esegui operazione file attraverso il filesystem server
 */
export const executeFilesystemOperation = async (
  operation: "readFile" | "writeFile" | "listFiles" | "createDirectory",
  params: any
) => {
  const client = getMCPClient();
  return await client.executeStdioTool("filesystem", operation, params);
};

/**
 * Esegui tool su server URL (websearch, cad, cam, analysis)
 */
export const executeURLTool = async (
  serverName: "web-search-tools" | "cad-tools" | "cam-tools" | "analysis-tools" | "mcp-db",
  toolName: string,
  params: any
) => {
  const client = getMCPClient();
  return await client.executeURLTool(serverName, toolName, params);
};

/**
 * Convenience function per websearch
 */
export const executeWebSearch = async (
  query: string,
  options?: WebSearchOptions, // Use the specific type from websearchService
  cadContext?: CADContextForSearch // Use the specific type from websearchService
): Promise<AIResponse<WebSearchResponse>> => {
  // Return type matches webSearchService.search
  console.log(`[mcpOfficialClient] executeWebSearch (new) called with query: "${query}"`);

  // Directly call the refactored webSearchService.search method
  // The options and cadContext are passed through.
  const result = await webSearchService.search(query, options, cadContext);

  // The result from webSearchService.search already matches AIResponse<WebSearchResponse>
  // It includes { success, data: { assistant_content, results (citations) }, error, processingTime }
  return result;
};

/**
 * Convenience function per CAD analysis
 */
export const executeCADAnalysis = async (
  toolName: "analyze_geometry" | "validate_design" | "calculate_properties" | "generate_drawing",
  params: any
) => {
  return await executeURLTool("cad-tools", toolName, params);
};

/**
 * Convenience function per CAM operations
 */
export const executeCAMOperation = async (
  toolName: "generate_toolpath" | "optimize_speeds" | "calculate_machining_time" | "validate_gcode",
  params: any
) => {
  return await executeURLTool("cam-tools", toolName, params);
};

/**
 * Convenience function per Analysis
 */
export const executeAnalysis = async (
  toolName: "stress_analysis" | "thermal_analysis" | "modal_analysis" | "optimization",
  params: any
) => {
  return await executeURLTool("analysis-tools", toolName, params);
};

/**
 * Convenience functions per Database Operations
 */

// User Management
export const createUser = async (userData: any) => {
  const client = getMCPClient();
  return await client.executeStdioTool("cadcamfun-database", "create_user", userData);
};

export const updateUser = async (userId: string, userData: any) => {
  const client = getMCPClient();
  return await client.executeStdioTool("cadcamfun-database", "update_user", { user_id: userId, data: userData });
};

export const deleteUser = async (userId: string) => {
  const client = getMCPClient();
  return await client.executeStdioTool("cadcamfun-database", "delete_user", { user_id: userId });
};

// Project Management
export const createProject = async (projectData: any) => {
  const client = getMCPClient();
  return await client.executeStdioTool("cadcamfun-database", "create_project", projectData);
};

export const updateProject = async (projectId: string, projectData: any) => {
  const client = getMCPClient();
  return await client.executeStdioTool("cadcamfun-database", "update_project", {
    project_id: projectId,
    data: projectData
  });
};

export const deleteProject = async (projectId: string) => {
  const client = getMCPClient();
  return await client.executeStdioTool("cadcamfun-database", "delete_project", { project_id: projectId });
};

// Drawing Management
export const createDrawing = async (drawingData: any) => {
  const client = getMCPClient();
  return await client.executeStdioTool("cadcamfun-database", "create_drawing", drawingData);
};

export const updateDrawing = async (drawingId: string, drawingData: any) => {
  const client = getMCPClient();
  return await client.executeStdioTool("cadcamfun-database", "update_drawing", {
    drawing_id: drawingId,
    data: drawingData
  });
};

export const deleteDrawing = async (drawingId: string) => {
  const client = getMCPClient();
  return await client.executeStdioTool("cadcamfun-database", "delete_drawing", { drawing_id: drawingId });
};

// Component Management
export const createComponent = async (componentData: any) => {
  const client = getMCPClient();
  return await client.executeStdioTool("cadcamfun-database", "create_component", componentData);
};

export const updateComponent = async (componentId: string, componentData: any) => {
  const client = getMCPClient();
  return await client.executeStdioTool("cadcamfun-database", "update_component", {
    component_id: componentId,
    data: componentData
  });
};

export const deleteComponent = async (componentId: string) => {
  const client = getMCPClient();
  return await client.executeStdioTool("cadcamfun-database", "delete_component", { component_id: componentId });
};

// Material Management
export const createMaterial = async (materialData: any) => {
  const client = getMCPClient();
  return await client.executeStdioTool("cadcamfun-database", "create_material", materialData);
};

export const updateMaterial = async (materialId: string, materialData: any) => {
  const client = getMCPClient();
  return await client.executeStdioTool("cadcamfun-database", "update_material", {
    material_id: materialId,
    data: materialData
  });
};

export const deleteMaterial = async (materialId: string) => {
  const client = getMCPClient();
  return await client.executeStdioTool("cadcamfun-database", "delete_material", { material_id: materialId });
};

// Tool Management
export const createTool = async (toolData: any) => {
  const client = getMCPClient();
  return await client.executeStdioTool("cadcamfun-database", "create_tool_prisma", toolData);
};

export const updateTool = async (toolId: string, toolData: any) => {
  const client = getMCPClient();
  return await client.executeStdioTool("cadcamfun-database", "update_tool_prisma", { tool_id: toolId, data: toolData });
};

export const deleteTool = async (toolId: string) => {
  const client = getMCPClient();
  return await client.executeStdioTool("cadcamfun-database", "delete_tool_prisma", { tool_id: toolId });
};

// Toolpath Management
export const createToolpath = async (toolpathData: any) => {
  const client = getMCPClient();
  return await client.executeStdioTool("cadcamfun-database", "create_toolpath", toolpathData);
};

export const updateToolpath = async (toolpathId: string, toolpathData: any) => {
  const client = getMCPClient();
  return await client.executeStdioTool("cadcamfun-database", "update_toolpath", {
    toolpath_id: toolpathId,
    data: toolpathData
  });
};

export const deleteToolpath = async (toolpathId: string) => {
  const client = getMCPClient();
  return await client.executeStdioTool("cadcamfun-database", "delete_toolpath", { toolpath_id: toolpathId });
};

// Machine Config Management
export const createMachineConfig = async (machineConfigData: any) => {
  const client = getMCPClient();
  return await client.executeStdioTool("cadcamfun-database", "create_machine_config", machineConfigData);
};

export const updateMachineConfig = async (machineConfigId: string, machineConfigData: any) => {
  const client = getMCPClient();
  return await client.executeStdioTool("cadcamfun-database", "update_machine_config", {
    machine_config_id: machineConfigId,
    data: machineConfigData
  });
};

export const deleteMachineConfig = async (machineConfigId: string) => {
  const client = getMCPClient();
  return await client.executeStdioTool("cadcamfun-database", "delete_machine_config", {
    machine_config_id: machineConfigId
  });
};

// Library Item Management
export const createLibraryItem = async (libraryItemData: any) => {
  const client = getMCPClient();
  return await client.executeStdioTool("cadcamfun-database", "create_library_item", libraryItemData);
};

export const updateLibraryItem = async (libraryItemId: string, libraryItemData: any) => {
  const client = getMCPClient();
  return await client.executeStdioTool("cadcamfun-database", "update_library_item", {
    library_item_id: libraryItemId,
    data: libraryItemData
  });
};

export const deleteLibraryItem = async (libraryItemId: string) => {
  const client = getMCPClient();
  return await client.executeStdioTool("cadcamfun-database", "delete_library_item", { library_item_id: libraryItemId });
};

// Organization Management
export const createOrganization = async (organizationData: any) => {
  const client = getMCPClient();
  return await client.executeStdioTool("cadcamfun-database", "create_organization", organizationData);
};

export const updateOrganization = async (organizationId: string, organizationData: any) => {
  const client = getMCPClient();
  return await client.executeStdioTool("cadcamfun-database", "update_organization", {
    organization_id: organizationId,
    data: organizationData
  });
};

export const deleteOrganization = async (organizationId: string) => {
  const client = getMCPClient();
  return await client.executeStdioTool("cadcamfun-database", "delete_organization", {
    organization_id: organizationId
  });
};

// Subscription Management
export const createSubscription = async (subscriptionData: any) => {
  const client = getMCPClient();
  return await client.executeStdioTool("cadcamfun-database", "create_subscription", subscriptionData);
};

export const updateSubscription = async (subscriptionId: string, subscriptionData: any) => {
  const client = getMCPClient();
  return await client.executeStdioTool("cadcamfun-database", "update_subscription", {
    subscription_id: subscriptionId,
    data: subscriptionData
  });
};

export const deleteSubscription = async (subscriptionId: string) => {
  const client = getMCPClient();
  return await client.executeStdioTool("cadcamfun-database", "delete_subscription", {
    subscription_id: subscriptionId
  });
};

// Notification System
export const triggerNotification = async (userId: string, message: string) => {
  const client = getMCPClient();
  return await client.executeStdioTool("cadcamfun-database", "trigger_main_app_notification", { userId, message });
};

/**
 * Test specifico per il database server
 */
export const testDatabaseServer = async (): Promise<{
  success: boolean;
  tools: string[];
  error?: string;
}> => {
  try {
    const client = getMCPClient();
    const result = await client.testMCPConnection("cadcamfun-database");

    if (result.success) {
      console.log("✅ CADCAMFUN Database server is working correctly");
      return {
        success: true,
        tools: result.availableTools || []
      };
    } else {
      console.error("❌ CADCAMFUN Database server test failed:", result.message);
      return {
        success: false,
        tools: [],
        error: result.error
      };
    }
  } catch (error) {
    console.error("❌ CADCAMFUN Database server test error:", error);
    return {
      success: false,
      tools: [],
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
};

/**
 * Esegui operazione Puppeteer attraverso il server stdio
 */
export const executePuppeteerTool = async (
  toolName:
    | "puppeteer_navigate"
    | "puppeteer_screenshot"
    | "puppeteer_click"
    | "puppeteer_fill"
    | "puppeteer_select"
    | "puppeteer_hover"
    | "puppeteer_evaluate",
  params: any
) => {
  const client = getMCPClient();
  return await client.executeStdioTool("puppeteer", toolName, params);
};

export default MCPOfficialClient;
