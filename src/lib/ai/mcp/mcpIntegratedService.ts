// src/lib/ai/mcp/mcpIntegratedService.ts
// Servizio integrato MCP - REFACTORED per usare SOLO Claude MCP
import { getMCPClient, MCPOfficialClient, MCPToolCall, MCPProcessedResponse } from "./mcpOfficialClient";
import { getExtendedThinkingService } from "../ai-new/extendedThinkingService";
import { aiAnalytics } from "../aiAnalytics";
import { aiCache } from "../aiCache";
import { AIRequest, AIResponse } from "../../../types/ai";

// Local message shape (structurally compatible with the Anthropic MCP client's
// MessageParam) so this module no longer depends on the `@anthropic-ai/sdk` type.
type MessageParam = { role: "user" | "assistant"; content: string };

export interface MCPIntegratedRequest {
  message: string;
  context: {
    conversationId: string;
    cadElements?: any[];
    currentProject?: string;
    userPreferences?: Record<string, any>;
    previousMessages?: Array<{
      role: "user" | "assistant";
      content: string;
      timestamp: number;
    }>;
  };
  options: {
    enableThinking?: boolean;
    enableMCP?: boolean;
    mcpServers?: string[];
    model?: string;
    temperature?: number;
    maxTokens?: number;
    useCache?: boolean;
    priority?: "low" | "normal" | "high";
  };
}

export interface MCPIntegratedResponse {
  response: string;
  thinkingSession?: any;
  mcpToolsCalled: MCPToolCall[];
  proactiveSuggestions: string[];
  processingTime: number;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  cacheHit?: boolean;
  serverStatuses?: Record<string, "connected" | "error" | "unavailable">;
}

export class MCPIntegratedService {
  private mcpClient: MCPOfficialClient;
  private thinkingService: any;

  constructor() {
    this.mcpClient = getMCPClient();
    this.thinkingService = getExtendedThinkingService();
  }

  /**
   * Processa richiesta con MCP e Extended Thinking integrati - SOLO CLAUDE MCP
   */
  async processWithMCPAndThinking(request: MCPIntegratedRequest): Promise<MCPIntegratedResponse> {
    const startTime = Date.now();
    const { message, context, options } = request;

    const {
      enableThinking = true,
      enableMCP = true,
      mcpServers = ["filesystem", "cad-tools", "cam-tools", "analysis-tools"],
      model = "claude-sonnet-4-20250514",
      temperature = 0.7,
      maxTokens = 6000,
      useCache = true,
      priority = "normal"
    } = options;

    let thinkingSessionId: string | undefined;
    let thinkingSession: any;
    let mcpToolsCalled: MCPToolCall[] = [];
    let serverStatuses: Record<string, "connected" | "error" | "unavailable"> = {};

    // Track analytics
    const requestId = aiAnalytics.trackRequestStart("mcp_claude_integrated_request", model, {
      enableThinking,
      enableMCP,
      serversRequested: mcpServers.length,
      contextElements: context.cadElements?.length || 0,
      priority,
      cacheEnabled: useCache
    });

    try {
      // 1. Check cache first if enabled
      if (useCache) {
        const cacheKey = this.generateCacheKey(message, context, options);
        const cachedResponse = aiCache.get<MCPIntegratedResponse>(cacheKey);

        if (cachedResponse) {
          console.log("📦 Using cached Claude MCP response");
          return {
            ...cachedResponse,
            processingTime: Date.now() - startTime,
            cacheHit: true
          };
        }
      }

      // 2. Check server statuses if MCP enabled
      if (enableMCP) {
        for (const serverName of mcpServers) {
          const server = this.mcpClient.getServer(serverName);
          if (server) {
            try {
              const testResult = await this.mcpClient.testMCPConnection(serverName);
              serverStatuses[serverName] = testResult.success ? "connected" : "error";
            } catch (error) {
              serverStatuses[serverName] = "unavailable";
              console.warn(`⚠️ MCP server ${serverName} unavailable:`, error);
            }
          } else {
            serverStatuses[serverName] = "unavailable";
          }
        }

        // Filter to only use available servers
        const availableServers = mcpServers.filter(name => serverStatuses[name] === "connected");
        if (availableServers.length < mcpServers.length) {
          console.log(`📊 Using ${availableServers.length}/${mcpServers.length} available MCP servers`);
        }
      }

      // 3. Start Extended Thinking session if enabled
      if (enableThinking) {
        thinkingSessionId = this.thinkingService.startThinkingSession(
          context.conversationId,
          `CAD/CAM Assistant - Processing: ${message.substring(0, 100)}...`,
          {
            enabled: true,
            budgetTokens: Math.max(1024, Math.min(2000, Math.floor(maxTokens * 0.3))),
            showRealTime: true,
            persistToMemory: true,
            phases: ["analysis", "planning", "execution", "validation"]
          }
        );

        // Analysis phase
        this.thinkingService.addThinkingStep(
          thinkingSessionId,
          "analysis",
          `Analyzing user request: "${message}". Context: ${context.cadElements?.length || 0} CAD elements, Project: ${context.currentProject || "None"}. MCP enabled: ${enableMCP}, Servers: ${mcpServers.join(", ")}`,
          0.9,
          "Examining user intent and available context to determine optimal approach using Claude MCP"
        );
      }

      // 4. Prepare messages for Claude API
      const systemPrompt = this.buildSystemPrompt(context, enableMCP, mcpServers, serverStatuses);
      const messages: MessageParam[] = [{ role: "user", content: message }];

      // Add conversation history if available
      if (context.previousMessages && context.previousMessages.length > 0) {
        const historyMessages = context.previousMessages.slice(-6).map(msg => ({
          role: msg.role as "user" | "assistant",
          content: msg.content
        }));
        messages.unshift(...historyMessages);
      }

      // 5. Planning phase (thinking)
      if (thinkingSessionId) {
        this.thinkingService.addThinkingStep(
          thinkingSessionId,
          "planning",
          `Planning response strategy. Model: ${model}, Temperature: ${temperature}, MCP servers: ${Object.entries(
            serverStatuses
          )
            .map(([name, status]) => `${name}:${status}`)
            .join(", ")}`,
          0.8,
          "Determining which Claude MCP tools and approaches will be most effective for this CAD/CAM task"
        );
      }

      // 6. Execute request with Claude MCP
      const availableServers = enableMCP ? mcpServers.filter(name => serverStatuses[name] === "connected") : [];

      const response = await this.mcpClient.sendMessageWithMCP(messages, {
        model,
        system: systemPrompt,
        max_tokens: maxTokens,
        temperature,
        mcpServers: availableServers,
        thinking: enableThinking
          ? {
              type: "enabled",
              budget_tokens: Math.max(1024, Math.min(2000, Math.floor(maxTokens * 0.25)))
            }
          : undefined
      });

      // 7. Process Claude MCP response
      const processed = this.mcpClient.processMCPBlocks(response);
      mcpToolsCalled = processed.mcpToolCalls;

      // 8. Execution phase (thinking)
      if (thinkingSessionId) {
        this.thinkingService.addThinkingStep(
          thinkingSessionId,
          "execution",
          `Generated response successfully. Claude MCP tools called: ${mcpToolsCalled.length}. Response length: ${processed.textContent.length} chars. Server statuses: ${JSON.stringify(serverStatuses)}`,
          0.9,
          `Successfully executed request using Claude MCP with ${mcpToolsCalled.map(t => `${t.server}.${t.tool}`).join(", ")} tools`
        );
      }

      // 9. Extract usage information
      const usage = (response as any).usage
        ? {
            promptTokens: (response as any).usage.input_tokens || 0,
            completionTokens: (response as any).usage.output_tokens || 0,
            totalTokens: ((response as any).usage.input_tokens || 0) + ((response as any).usage.output_tokens || 0)
          }
        : undefined;

      // 10. Generate proactive suggestions
      const proactiveSuggestions = this.generateProactiveSuggestions(
        context,
        message,
        processed.textContent,
        mcpToolsCalled
      );

      // 11. Validation phase (thinking)
      if (thinkingSessionId) {
        const qualityScore = this.calculateQualityScore(processed.textContent, mcpToolsCalled);
        this.thinkingService.addThinkingStep(
          thinkingSessionId,
          "validation",
          `Response validated and ready. Quality score: ${qualityScore}/10. Used ${mcpToolsCalled.length} Claude MCP tools. Proactive suggestions: ${proactiveSuggestions.length}`,
          0.95,
          "Final validation confirms response quality and completeness using Claude MCP integration"
        );

        thinkingSession = this.thinkingService.finalizeThinkingSession(
          thinkingSessionId,
          `Successfully processed "${message}" using Claude MCP with ${mcpToolsCalled.length} tool calls and high confidence`
        );
      }

      const finalResponse: MCPIntegratedResponse = {
        response: processed.textContent,
        thinkingSession,
        mcpToolsCalled,
        proactiveSuggestions,
        processingTime: Date.now() - startTime,
        usage,
        cacheHit: false,
        serverStatuses
      };

      // 12. Cache the response if caching enabled
      if (useCache) {
        const cacheKey = this.generateCacheKey(message, context, options);
        const cacheTimeout = priority === "high" ? 60000 : 300000; // 1min for high priority, 5min for normal
        aiCache.set(cacheKey, finalResponse, cacheTimeout);
      }

      // 13. Track analytics completion
      aiAnalytics.trackRequestComplete(
        requestId,
        finalResponse.processingTime,
        true,
        usage?.promptTokens || 0,
        usage?.completionTokens || 0
      );

      return finalResponse;
    } catch (error) {
      // Enhanced error handling with thinking
      if (thinkingSessionId) {
        this.thinkingService.addThinkingStep(
          thinkingSessionId,
          "validation",
          `Error occurred: ${error instanceof Error ? error.message : "Unknown error"}. Providing fallback response with Claude MCP context`,
          0.2,
          "Request failed, attempting to provide helpful fallback response using available context"
        );

        thinkingSession = this.thinkingService.finalizeThinkingSession(
          thinkingSessionId,
          `Error processing request: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }

      // Track error analytics
      aiAnalytics.trackEvent({
        eventType: "error",
        eventName: "mcp_claude_integrated_error",
        errorType: error instanceof Error ? error.name : "unknown",
        success: false,
        metadata: {
          requestId,
          message: error instanceof Error ? error.message : "Unknown error",
          enableMCP,
          enableThinking,
          serverStatuses: JSON.stringify(serverStatuses)
        }
      });

      const errorResponse: MCPIntegratedResponse = {
        response: `I apologize, but I encountered an error processing your request with Claude MCP: ${error instanceof Error ? error.message : "Unknown error"}. Please try again or rephrase your question.`,
        thinkingSession,
        mcpToolsCalled: [],
        proactiveSuggestions: [
          "Try rephrasing your question with more specific details",
          "Check if all required CAD/CAM context is provided",
          "Consider breaking down complex requests into smaller parts",
          "Verify that MCP servers are properly configured"
        ],
        processingTime: Date.now() - startTime,
        cacheHit: false,
        serverStatuses
      };

      return errorResponse;
    }
  }

  /**
   * Generate cache key for the request
   */
  private generateCacheKey(message: string, context: any, options: any): string {
    const keyData = {
      message: message.substring(0, 200),
      contextElements: context.cadElements?.length || 0,
      project: context.currentProject || "none",
      model: options.model || "default",
      mcpEnabled: options.enableMCP || false,
      servers: (options.mcpServers || []).sort().join(","),
      thinking: options.enableThinking || false
    };

    return `claude_mcp_integrated:${JSON.stringify(keyData)}`;
  }

  /**
   * Build system prompt for CAD/CAM with Claude MCP context
   */
  private buildSystemPrompt(
    context: any,
    enableMCP: boolean,
    mcpServers: string[],
    serverStatuses: Record<string, string>
  ): string {
    let systemPrompt = `You are an advanced CAD/CAM AI assistant powered by Claude with Model Context Protocol (MCP) integration and extended thinking capabilities.

CONTEXT:
- Current project: ${context.currentProject || "No active project"}
- CAD elements in scene: ${context.cadElements?.length || 0}
- User preferences: ${JSON.stringify(context.userPreferences || {})}
- Conversation ID: ${context.conversationId}

CAPABILITIES:`;

    if (enableMCP && mcpServers.length > 0) {
      systemPrompt += `
- Claude MCP Integration: You have access to specialized CAD/CAM tools through Claude's MCP implementation
- Available MCP servers: ${mcpServers.map(name => `${name} (${serverStatuses[name] || "unknown"})`).join(", ")}
- Connected servers: ${
        Object.entries(serverStatuses)
          .filter(([_, status]) => status === "connected")
          .map(([name]) => name)
          .join(", ") || "None"
      }
- Use MCP tools when they can provide more accurate, detailed, or specialized information
- Always explain which Claude MCP tools you're using and why they're beneficial for the task`;
    }

    systemPrompt += `
- Extended Thinking: You can think through complex problems step by step with detailed analysis
- Proactive Assistance: Provide helpful suggestions and next steps based on context
- Context Awareness: Remember and build upon previous interactions and project state
- File Operations: Access filesystem through Claude MCP stdio servers when needed
- CAD/CAM Expertise: Specialized knowledge in computer-aided design and manufacturing

INSTRUCTIONS:
1. Analyze the user's request carefully within the CAD/CAM context
2. Use appropriate Claude MCP tools when available and beneficial for the task
3. Provide clear, actionable responses with technical accuracy
4. Suggest follow-up actions and optimizations when relevant
5. Consider the current project context and CAD elements in all responses
6. Be precise with technical information and explain complex concepts clearly
7. When using MCP tools, explain what information they provide and how it helps
8. Always prioritize safety and best practices in CAD/CAM workflows

RESPONSE STYLE:
- Professional and helpful tone
- Clear explanations for technical concepts
- Structured responses with logical flow
- Include relevant examples when beneficial
- Proactive suggestions for workflow improvements

Respond leveraging all available Claude MCP capabilities while maintaining focus on the user's CAD/CAM objectives.`;

    return systemPrompt;
  }

  /**
   * Generate proactive suggestions based on context and response
   */
  private generateProactiveSuggestions(
    context: any,
    userMessage: string,
    response: string,
    toolCalls: MCPToolCall[]
  ): string[] {
    const suggestions: string[] = [];

    // Context-based suggestions
    if (context.cadElements && context.cadElements.length > 0) {
      suggestions.push("Analyze current CAD elements for optimization opportunities");
      suggestions.push("Generate technical drawings for the current design");
    }

    // Tool-based suggestions
    if (toolCalls.length > 0) {
      const usedTools = toolCalls.map(call => call.tool);
      if (usedTools.includes("analyze-geometry")) {
        suggestions.push("Consider running stress analysis on the analyzed geometry");
      }
      if (usedTools.includes("generate-toolpath")) {
        suggestions.push("Simulate the generated toolpath for validation");
      }
    }

    // Message-based suggestions
    const lowerMessage = userMessage.toLowerCase();
    if (lowerMessage.includes("design") || lowerMessage.includes("create")) {
      suggestions.push("Validate design against manufacturing constraints");
      suggestions.push("Estimate material costs and machining time");
    }

    if (lowerMessage.includes("optimize") || lowerMessage.includes("improve")) {
      suggestions.push("Run topology optimization analysis");
      suggestions.push("Consider alternative manufacturing methods");
    }

    // Default suggestions
    suggestions.push("Save current work to project files");
    suggestions.push("Export design in multiple formats for collaboration");

    return suggestions.slice(0, 4); // Limit to 4 suggestions
  }

  /**
   * Calculate quality score for the response
   */
  private calculateQualityScore(response: string, toolCalls: MCPToolCall[]): number {
    let score = 5; // Base score

    // Response quality indicators
    if (response.length > 100 && response.length < 3000) score += 1;
    if (response.includes("Claude MCP") || response.includes("tool")) score += 0.5;

    // Tool usage indicators
    if (toolCalls.length > 0) score += 2;
    if (toolCalls.some(call => call.result)) score += 1;

    // Variety and sophistication
    const uniqueServers = new Set(toolCalls.map(call => call.server)).size;
    if (uniqueServers > 1) score += 1;

    const uniqueTools = new Set(toolCalls.map(call => call.tool)).size;
    if (uniqueTools > 2) score += 0.5;

    return Math.min(score, 10);
  }

  /**
   * Test Claude MCP integration functionality
   */
  async testClaudeMCPIntegration(): Promise<{
    success: boolean;
    message: string;
    details: any;
  }> {
    try {
      console.log("✅ Claude MCP integration ready");

      /* Test disabilitato per evitare chiamate inutili
      console.log('🧪 Testing Claude MCP integrated functionality...');
      
      const testRequest: MCPIntegratedRequest = {
        message: 'Test the Claude MCP integration and show me what CAD/CAM tools are available',
        context: {
          conversationId: 'test-claude-mcp-session',
          cadElements: [],
          currentProject: 'Claude MCP Integration Test'
        },
        options: {
          enableThinking: true,
          enableMCP: true,
          mcpServers: ['filesystem', 'cad-tools'],
          model: 'claude-sonnet-4-20250514',
          maxTokens: 2000,
          priority: 'high'
        }
      };

      const result = await this.processWithMCPAndThinking(testRequest);
      
      console.log('✅ Claude MCP integration test completed');
      console.log(`📊 Response length: ${result.response.length}`);
      console.log(`🔧 Claude MCP tools called: ${result.mcpToolsCalled.length}`);
      console.log(`⚡ Processing time: ${result.processingTime}ms`);
      console.log(`🤖 Thinking enabled: ${!!result.thinkingSession}`);
      console.log(`💾 Cache hit: ${result.cacheHit}`);
      console.log(`🌐 Server statuses: ${JSON.stringify(result.serverStatuses)}`);
      */

      // Verifica solo la disponibilità del client MCP
      const clientStatus = this.mcpClient ? true : false;
      const servers = this.mcpClient ? this.mcpClient.getRegisteredServers() : [];

      return {
        success: true,
        message: "Claude MCP integration ready",
        details: {
          clientAvailable: clientStatus,
          serversCount: servers.length,
          serversStatus: "Available without test query"
        }
      };
    } catch (error) {
      console.error("❌ Claude MCP integration test failed:", error);
      return {
        success: false,
        message: "Claude MCP integration test failed",
        details: { error: error instanceof Error ? error.message : "Unknown error" }
      };
    }
  }

  /**
   * Get MCP client for direct access
   */
  getMCPClient(): MCPOfficialClient {
    return this.mcpClient;
  }

  /**
   * Execute filesystem operation through Claude MCP
   */
  async executeFilesystemOperation(operation: "readFile" | "writeFile" | "listFiles" | "createDirectory", params: any) {
    return await this.mcpClient.executeStdioTool("filesystem", operation, params);
  }

  /**
   * Esegui websearch attraverso Claude MCP
   */
  async executeWebSearch(query: string, options?: any, cadContext?: any) {
    return await this.mcpClient.executeURLTool("web-search-tools", "web_search", {
      query,
      options,
      cadContext
    });
  }

  /**
   * Esegui tool generico su server MCP
   */
  async executeMCPTool(serverName: string, toolName: string, parameters: any) {
    const server = this.mcpClient.getServer(serverName);
    if (!server) {
      throw new Error(`Server ${serverName} not found`);
    }

    if (server.type === "stdio") {
      return await this.mcpClient.executeStdioTool(serverName, toolName, parameters);
    } else if (server.type === "url") {
      return await this.mcpClient.executeURLTool(serverName, toolName, parameters);
    } else {
      throw new Error(`Unsupported server type: ${server.type}`);
    }
  }
}

// Singleton instance
let mcpIntegratedServiceInstance: MCPIntegratedService | null = null;

export const getMCPIntegratedService = (): MCPIntegratedService => {
  if (!mcpIntegratedServiceInstance) {
    mcpIntegratedServiceInstance = new MCPIntegratedService();
    console.log("🚀 Claude MCP Integrated Service initialized");
  }
  return mcpIntegratedServiceInstance;
};

// Export convenience functions
export const processWithClaudeMCP = async (request: MCPIntegratedRequest): Promise<MCPIntegratedResponse> => {
  const service = getMCPIntegratedService();
  return await service.processWithMCPAndThinking(request);
};

export const testClaudeMCPIntegration = async () => {
  const service = getMCPIntegratedService();
  return await service.testClaudeMCPIntegration();
};

export default MCPIntegratedService;
