// src/lib/ai/aiCore.ts - Enhanced version with MCP Integration
import Anthropic from "@anthropic-ai/sdk";
import { AIServiceConfig, AIRequest, AIResponse, AIModelType } from "../../types/ai";
import { aiCache } from "./aiCache";
import { aiAnalytics } from "./aiAnalytics";
import { getMCPIntegratedService, MCPIntegratedRequest } from "./mcp/mcpIntegratedService";
import { getExtendedThinkingService } from "./ai-new/extendedThinkingService";
import {
  webSearchService,
  WebSearchOptions,
  CADContextForSearch,
  WebSearchResponse
} from "./websearch/websearchService";
import { z } from "zod";

const AIResponseSchema = z.object({
  suggestions: z.array(z.string()).optional(),
  rawResponse: z.string().nullable(),
  metadata: z.record(z.unknown()).optional(),
  timestamp: z.string().datetime(),
  model: z.enum(["claude-sonnet-4-20250514"]),
  thinking: z.object({
    type: z.string(),
    budget_tokens: z.number()
  }),
  usage: z.object({
    promptTokens: z.number(),
    completionTokens: z.number(),
    totalTokens: z.number()
  })
});

export type ValidatedAIResponse = z.infer<typeof AIResponseSchema>;

export async function validateAIResponse(response: unknown): Promise<ValidatedAIResponse> {
  return AIResponseSchema.parse(response);
}

export class AICore {
  private client: Anthropic;
  private config: AIServiceConfig;
  private requestQueue: AIRequest[] = [];
  private processing = false;
  private apiKeyValid = false;

  constructor(config: AIServiceConfig) {
    // SECURITY: Never use NEXT_PUBLIC_ for API keys!
    const secureApiKey = typeof window === "undefined" ? process.env.ANTHROPIC_API_KEY : undefined;

    this.config = {
      apiKey: secureApiKey,
      // Default values will be overridden by config
      ...config
    };

    if (!this.config.apiKey) {
      console.warn("⚠️ No Anthropic API key provided. AI features will be limited.");
      this.apiKeyValid = false;
    } else {
      this.apiKeyValid = true;
    }

    this.client = new Anthropic({
      apiKey: this.config.apiKey || "dummy-key",
      dangerouslyAllowBrowser: this.config.allowBrowser || typeof window !== "undefined"
    });
  }

  /**
   * Process an AI request with error handling, retries, and caching
   */
  async processRequest<T>({
    prompt,
    model = this.config.defaultModel as AIModelType,
    systemPrompt,
    temperature = 0.7,
    maxTokens = 8000,
    parseResponse,
    onProgress,
    retryCount = 0
  }: AIRequest): Promise<AIResponse<T>> {
    // Check if API key is valid
    if (!this.apiKeyValid) {
      return {
        rawResponse: null,
        data: null,
        error: "No valid API key available",
        success: false,
        suggestions: undefined
      };
    }

    try {
      // Add monitoring/logging
      const startTime = Date.now();
      const requestId = aiAnalytics.trackRequestStart("ai_request", model, {
        promptLength: prompt.length,
        hasSystemPrompt: !!systemPrompt
      });

      // Check cache first (use prompt as cache key)
      const cacheKey = aiCache.getKeyForRequest({ prompt, model, systemPrompt, temperature });
      const cachedResponse = aiCache.get<AIResponse<T>>(cacheKey);

      if (cachedResponse) {
        aiAnalytics.trackEvent({
          eventType: "response",
          eventName: "cache_hit",
          success: true,
          metadata: { requestId, cacheKey }
        });

        return {
          ...cachedResponse,

          success: true
        };
      }

      // Make API call with streaming support if onProgress callback is provided
      let fullResponse = "";

      if (onProgress) {
        // Streaming response
        const stream = await this.client.beta.messages.create({
          model,
          max_tokens: maxTokens,
          temperature,
          system: systemPrompt,
          thinking: {
            type: "enabled",
            budget_tokens: 1500
          },
          messages: [{ role: "user", content: prompt }],
          stream: true
        });
        for await (const chunk of stream) {
          if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
            const text = chunk.delta.text;
            fullResponse += text;
            onProgress(text);
          }
        }
      } else {
        // Non-streaming response
        const response = await this.client.messages.create({
          model,
          max_tokens: maxTokens,
          temperature,
          thinking: {
            type: "enabled",
            budget_tokens: 1500
          },
          system: systemPrompt,
          messages: [{ role: "user", content: prompt }]
        });

        fullResponse = response.content[0]?.type === "text" ? response.content[0].text : "";
      }

      // Parse response if a parser is provided
      let parsedData: T | null = null;
      let parsingError: Error | null = null;

      if (parseResponse && fullResponse) {
        try {
          parsedData = await parseResponse(fullResponse);
        } catch (err) {
          parsingError = err instanceof Error ? err : new Error("Failed to parse response");

          // Log parsing error
          aiAnalytics.trackEvent({
            eventType: "error",
            eventName: "parsing_error",
            errorType: "parsing",
            success: false,
            metadata: { requestId, error: parsingError.message }
          });
        }
      }

      // Calculate processing time
      const processingTime = Date.now() - startTime;

      // Track completion
      aiAnalytics.trackRequestComplete(
        requestId,
        processingTime,
        true,
        prompt.length / 4, // rough estimate of prompt tokens
        fullResponse.length / 4 // rough estimate of completion tokens
      );

      // Create response object
      const finalResponse: AIResponse<T> = {
        rawResponse: fullResponse,
        data: parsedData,
        parsingError,
        processingTime,

        model,
        success: true,
        warnings: undefined
      };

      // Cache the response
      aiCache.set(cacheKey, finalResponse);

      return finalResponse;
    } catch (error) {
      // Track error
      aiAnalytics.trackEvent({
        eventType: "error",
        eventName: "api_error",
        errorType: error instanceof Error ? error.name : "unknown",
        success: false,
        metadata: { message: error instanceof Error ? error.message : "Unknown error" }
      });

      // Implement retries if configured
      if (retryCount < 2) {
        console.log(`Retry attempt ${retryCount + 1} for AI request`);

        // Exponential backoff
        const backoffTime = Math.min(1000 * Math.pow(2, retryCount), 10000);
        await new Promise(resolve => setTimeout(resolve, backoffTime));

        // Retry with incremented retry count
        return this.processRequest<T>({
          prompt,
          model,
          systemPrompt,
          temperature,
          maxTokens,
          parseResponse,
          onProgress,
          retryCount: retryCount + 1
        });
      }

      // Return error response after max retries
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return {
        rawResponse: null,
        data: null,
        error: errorMessage,
        success: false,
        suggestions: undefined
      };
    }
  }

  /**
   * Validate API key by making a minimal request
   */
  async validateApiKey(): Promise<boolean> {
    if (!this.config.apiKey) {
      this.apiKeyValid = false;
      return false;
    }

    try {
      await this.client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 10,
        messages: [{ role: "user", content: "API key validation test" }]
      });

      this.apiKeyValid = true;
      return true;
    } catch (error) {
      console.error("API key validation failed:", error);
      this.apiKeyValid = false;
      return false;
    }
  }

  /**
   * Set a new API key
   */
  setApiKey(apiKey: string): void {
    this.config.apiKey = apiKey;
    this.client = new Anthropic({
      apiKey,
      dangerouslyAllowBrowser: this.config.allowBrowser
    });

    // Validate the new key
    this.validateApiKey();
  }

  /**
   * Process request with integrated MCP and Extended Thinking
   */
  async processWithMCPThinking<T>(
    args: AIRequest & {
      /* ... context types ... */
    }
  ): Promise<
    AIResponse<T> & {
      /* ... mcp return types ... */
    }
  > {
    const {
      prompt,
      model = this.config.defaultModel as AIModelType,
      systemPrompt,
      temperature = 0.7,
      maxTokens = 8000,
      parseResponse,
      // onProgress, // Streaming will be more complex with a proxy, handle later if needed
      retryCount = 0,
      context = {}
      // enableMCP = true, // MCP logic might be handled server-side by the tool itself
      // enableThinking = true, // Thinking is an Anthropic API parameter
      // mcpServers = ['cad-tools', 'cam-tools'] // MCP server selection might be less relevant if tools are directly specified
    } = args;

    // API key validity is now handled by the proxy, but keep client-side checks if AICore can be used for non-proxied calls too.
    // However, for this proxied call, the server will do the primary API key check.
    // if (!this.apiKeyValid) { /* ... return error ... */ } // This check might be redundant for proxied calls.

    const startTime = Date.now();
    const requestId = aiAnalytics.trackRequestStart("ai_mcp_thinking_request", model, {
      promptLength: prompt.length,
      hasSystemPrompt: !!systemPrompt,
      contextKeys: Object.keys(context)
    });

    // Note: Caching strategy might need to be re-evaluated.
    // Caching before the proxy call might be okay, but the proxy itself won't cache unless implemented there.
    // const cacheKey = aiCache.getKeyForRequest({ prompt, model, systemPrompt, temperature, context });
    // const cachedResponse = aiCache.get<AIResponse<T>>(cacheKey);
    // if (cachedResponse) { /* ... return cached ... */ }

    try {
      const requestBodyToProxy = {
        prompt,
        model,
        systemPrompt,
        temperature,
        maxTokens,
        anthropicToolOptions: context.userPreferences?.anthropicToolOptions // Pass tool options
        // Pass other relevant parts of 'context' if the proxy needs them
      };

      console.log("[AICore] Calling /api/ai/anthropic-proxy with body:", JSON.stringify(requestBodyToProxy, null, 2));

      const proxyResponse = await fetch("/api/ai/anthropic-proxy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBodyToProxy)
      });

      if (!proxyResponse.ok) {
        const errorData = await proxyResponse.json();
        throw new Error(errorData.error || `Proxy request failed with status ${proxyResponse.status}`);
      }

      const responseFromServer = (await proxyResponse.json()) as AIResponse<any>; // Expects AIResponse structure from proxy

      console.log("[AICore] Received response from /api/ai/anthropic-proxy.");

      if (!responseFromServer.success || !responseFromServer.rawResponse) {
        throw new Error(responseFromServer.error || "Proxy returned unsuccessful or no rawResponse");
      }

      let parsedData: T | null = null;
      let parsingError: Error | null = null;
      let thinkingSession: any = undefined; // Placeholder
      let mcpToolsCalled: any[] = []; // Placeholder

      // The rawResponse from the proxy IS the Anthropic Message object.
      // The existing parseResponse function (e.g., webSearchService.parseSearchResponse)
      // should be designed to take this Anthropic Message object.
      if (parseResponse && responseFromServer.rawResponse) {
        try {
          // Handle both string and object formats for rawResponse
          let responseForParser: any;
          if (typeof responseFromServer.rawResponse === "string") {
            // If it's a string, pass it directly to parser (original behavior)
            responseForParser = responseFromServer.rawResponse;
          } else {
            // If it's an object (Anthropic Message), convert to string or pass as is based on parser expectation
            responseForParser = responseFromServer.rawResponse;
          }

          parsedData = await parseResponse(responseForParser);

          // Extract thinking/MCP data if the parser also returns it or if it's directly in rawResponse
          // This part might need refinement based on how `parseResponse` is structured
          if (typeof responseFromServer.rawResponse === "object" && responseFromServer.rawResponse) {
            const rawResponse = responseFromServer.rawResponse as any;
            if (rawResponse.stop_reason === "tool_use" && Array.isArray(rawResponse.content)) {
              // Potentially extract tool calls for mcpToolsCalled
              mcpToolsCalled = rawResponse.content
                .filter((block: any) => block.type === "tool_use")
                .map((block: any) => ({
                  id: block.id,
                  name: block.name,
                  input: block.input
                }));
            }
          }
          // Thinking session data might be part of parsedData or handled differently by thinking services
        } catch (err) {
          parsingError = err instanceof Error ? err : new Error("Failed to parse response from proxy");
          aiAnalytics.trackEvent({
            eventType: "error",
            eventName: "parsing_error",
            errorType: "parsing_proxy_response",
            success: false,
            metadata: { requestId, error: parsingError.message }
          });
        }
      }

      const processingTime = Date.now() - startTime;
      aiAnalytics.trackRequestComplete(requestId, processingTime, true, 0, 0); // Token counts harder to get here

      const finalResponse = {
        rawResponse: responseFromServer.rawResponse, // This is the Anthropic Message object
        data: parsedData,
        parsingError,
        processingTime,
        model: model as any,
        success: true,
        thinkingSession, // Populate if available
        mcpToolsCalled // Populate if available
        // proactiveSuggestions will need to be handled by a layer that calls this
      } as AIResponse<T> & { thinkingSession?: any; mcpToolsCalled?: any[]; proactiveSuggestions?: string[] };

      // Caching logic here might need to use the finalResponse if successful
      // aiCache.set(cacheKey, finalResponse);

      return finalResponse;
    } catch (error) {
      aiAnalytics.trackEvent({
        eventType: "error",
        eventName: "mcp_proxy_api_error",
        errorType: error instanceof Error ? error.name : "unknown",
        success: false,
        metadata: { requestId, message: error instanceof Error ? error.message : "Unknown error" }
      });

      // Retry logic would be more complex here, as it involves retrying the fetch to the proxy.
      // For now, simplifying by not retrying the proxy call itself from AICore.

      const errorMessage = error instanceof Error ? error.message : "Unknown error during MCP proxy call";
      return {
        rawResponse: null,
        data: null,
        error: errorMessage,
        success: false,
        thinkingSession: undefined,
        mcpToolsCalled: []
      } as any;
    }
  }

  /**
   * Quick method for CAD/CAM specific requests with full integration
   */
  async processCADRequest<T>({
    message,
    cadElements = [],
    projectName,
    userPreferences = {},
    conversationId,
    requestType = "general",
    parseResponse
  }: {
    message: string;
    cadElements?: any[];
    projectName?: string;
    userPreferences?: Record<string, any>;
    conversationId?: string;
    requestType?: "design" | "analysis" | "toolpath" | "gcode" | "general";
    parseResponse?: (text: string) => Promise<T>;
  }): Promise<
    AIResponse<T> & {
      thinkingSession?: any;
      mcpToolsCalled?: any[];
      proactiveSuggestions?: string[];
    }
  > {
    // Determine optimal servers based on request type
    const mcpServers = this.getMCPServersForRequestType(requestType);
    const model = this.getOptimalModelForRequestType(requestType);

    return this.processWithMCPThinking({
      prompt: message,
      model,
      temperature: requestType === "analysis" ? 0.3 : 0.7,
      maxTokens: requestType === "gcode" ? 6000 : 4000,
      parseResponse,
      context: {
        conversationId: conversationId || `cad_session_${Date.now()}`,
        cadElements,
        currentProject: projectName,
        userPreferences
      },
      enableMCP: true,
      enableThinking: true,
      mcpServers
    } as any);
  }

  /**
   * Determine optimal MCP servers for request type
   */
  private getMCPServersForRequestType(requestType: string): string[] {
    switch (requestType) {
      case "design":
        return ["cad-tools"];
      case "analysis":
        return ["cad-tools", "analysis-tools"];
      case "toolpath":
      case "gcode":
        return ["cam-tools"];
      default:
        return ["web-search-tools"];
    }
  }

  /**
   * Get optimal model for request type
   */
  private getOptimalModelForRequestType(requestType: string): AIModelType {
    switch (requestType) {
      case "analysis":
        return "claude-sonnet-4-20250514"; // Most accurate for analysis
      case "gcode":
        return "claude-sonnet-4-20250514"; // Precision for code generation
      default:
        return this.config.defaultModel as AIModelType;
    }
  }

  /**
   * Process web search request with AI enhancement - NO CIRCULAR DEPENDENCY
   */
  async processWebSearchRequest({
    query,
    options = {},
    cadContext,
    useSemanticAnalysis = false,
    conversationId
  }: {
    query: string;
    options?: any; // WebSearchOptions - using any to avoid circular import
    cadContext?: any; // CADContextForSearch - using any to avoid circular import
    useSemanticAnalysis?: boolean;
    conversationId?: string;
  }): Promise<
    AIResponse<any> & {
      thinkingSession?: any;
      semanticInsights?: any;
    }
  > {
    const startTime = Date.now();

    try {
      // Use MCP integrated service directly to avoid circular dependency
      const mcpRequest: MCPIntegratedRequest = {
        message: `Search the web for: ${query}`,
        context: {
          conversationId: conversationId || `websearch_${Date.now()}`,
          cadElements: [],
          currentProject: cadContext?.projectType,
          userPreferences: {
            searchOptions: options,
            cadContext
          }
        },
        options: {
          enableThinking: true,
          enableMCP: true,
          mcpServers: ["web-search-tools"],
          model: "claude-sonnet-4-20250514",
          temperature: 0.3,
          maxTokens: 4000
        }
      };

      const mcpService = getMCPIntegratedService();
      const result = await mcpService.processWithMCPAndThinking(mcpRequest);

      // Estrai i risultati di ricerca dalla risposta MCP
      let searchResponse: any = null;

      // Cerca nei tool chiamati per i risultati di websearch
      if (result.mcpToolsCalled) {
        const webSearchCall = result.mcpToolsCalled.find(tool => tool.tool === "web_search");
        if (webSearchCall && webSearchCall.result) {
          searchResponse = {
            query,
            results: webSearchCall.result.results || [],
            totalResults: webSearchCall.result.totalResults || 0,
            searchTime: webSearchCall.result.searchTime || Date.now(),
            suggestions: webSearchCall.result.suggestions,
            relatedQueries: webSearchCall.result.relatedQueries
          };
        }
      }

      // If MCP didn't return results, use direct URL tool execution
      if (!searchResponse) {
        try {
          // Lazy import to avoid circular dependency
          const { executeWebSearch } = await import("./mcp/mcpOfficialClient");
          const directResult = await executeWebSearch(query, options, cadContext);
          if (directResult.success && directResult.data) {
            searchResponse = directResult.data;
          }
        } catch (importError) {
          console.warn("Could not use direct web search:", importError);
        }
      }

      return {
        rawResponse: result.response,
        data: searchResponse,
        success: !!searchResponse,
        error: searchResponse ? undefined : "No search results found",
        processingTime: Date.now() - startTime,
        model: "claude-sonnet-4-20250514",
        usage: result.usage,
        thinkingSession: result.thinkingSession
      };
    } catch (error) {
      return {
        rawResponse: null,
        data: null,
        error: error instanceof Error ? error.message : "Unknown error",
        success: false,
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Batch web search with AI coordination - NO CIRCULAR DEPENDENCY
   */
  async processBatchWebSearch({
    queries,
    options = {},
    coordinateResults = true
  }: {
    queries: string[];
    options?: any; // WebSearchOptions - using any to avoid circular import
    coordinateResults?: boolean;
  }): Promise<AIResponse<any[]>> {
    const startTime = Date.now();

    try {
      // Execute searches through MCP to avoid circular dependency
      const results: any[] = [];
      const errors: string[] = [];

      // Execute searches in parallel with concurrency limit
      const batchSize = 3;
      for (let i = 0; i < queries.length; i += batchSize) {
        const batch = queries.slice(i, i + batchSize);
        const batchPromises = batch.map(async query => {
          try {
            const searchResult = await this.processWebSearchRequest({
              query,
              options,
              conversationId: `batch_${Date.now()}_${i}`
            });
            return searchResult;
          } catch (error) {
            return {
              success: false,
              error: error instanceof Error ? error.message : "Unknown error",
              data: null
            };
          }
        });

        const batchResults = await Promise.all(batchPromises);

        batchResults.forEach((result, index) => {
          if (result.success && result.data) {
            results.push(result.data);
          } else {
            errors.push(`Query "${batch[index]}": ${result.error || "Unknown error"}`);
          }
        });
      }

      if (!coordinateResults || results.length === 0) {
        return {
          rawResponse: JSON.stringify(results),
          data: results,
          success: errors.length === 0,
          error: errors.length > 0 ? errors.join("; ") : undefined,
          processingTime: Date.now() - startTime
        };
      }

      // Use AI to coordinate and synthesize results
      const synthesisPrompt = `
        Analyze and coordinate these web search results:
        ${JSON.stringify(results, null, 2)}
        
        Provide:
        1. Key insights across all searches
        2. Common patterns or themes
        3. Contradictions or inconsistencies
        4. Recommended next steps
      `;

      const synthesisResult = await this.processRequest<any>({
        prompt: synthesisPrompt,
        systemPrompt: "You are an expert at analyzing and synthesizing web search results for CAD/CAM applications.",
        temperature: 0.5,
        maxTokens: 2000
      });

      return {
        rawResponse: JSON.stringify(results),
        data: results,
        success: errors.length === 0,
        error: errors.length > 0 ? errors.join("; ") : undefined,
        processingTime: Date.now() - startTime,
        synthesis: synthesisResult.data
      };
    } catch (error) {
      return {
        rawResponse: null,
        data: null,
        error: error instanceof Error ? error.message : "Unknown error",
        success: false,
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Test MCP integration
   */
  async testMCPIntegration(): Promise<{
    success: boolean;
    message: string;
    details?: any;
  }> {
    try {
      const mcpService = getMCPIntegratedService();

      // Semplice controllo che il servizio esista senza eseguire query reali
      if (mcpService) {
        return {
          success: true,
          message: "MCP integration ready",
          details: { status: "Available without test query" }
        };
      }

      /* Query di test disabilitata per evitare chiamate inutili
      const result = await mcpService.processWithMCPAndThinking({
        message: 'Test the enhanced capabilities',
        context: {
          conversationId: 'test-session',
          cadElements: [],
          currentProject: 'Enhanced Test'
        },
        options: {
          enableThinking: true,
          enableMCP: true,
          mcpServers: ['filesystem', 'cad-tools', 'cam-tools'],
          model: 'claude-sonnet-4-20250514',
          temperature: 1,
          maxTokens: 2000,
        }
      }); 
      return {
        success: true,
        message: 'MCP integration test passed',
        details: result
      };
      */

      return {
        success: false,
        message: "MCP service not available",
        details: { error: "Could not find MCP service" }
      };
    } catch (error) {
      return {
        success: false,
        message: "MCP integration test failed",
        details: { error: error instanceof Error ? error.message : "Unknown error" }
      };
    }
  }
}

// Export a singleton instance with enhanced configuration
export const aiCore = new AICore({
  allowBrowser: true,
  defaultModel: "claude-sonnet-4-20250514",
  maxTokens: 6000,
  temperature: 0.7,
  cacheEnabled: true,
  analyticsEnabled: true
});

// Initialize MCP and thinking services on startup
if (typeof window !== "undefined") {
  // Client-side initialization - only log success
  aiCore
    .testMCPIntegration()
    .then(result => {
      if (result.success) {
        console.log("✅ MCP Integration ready");
      }
    })
    .catch(() => {
      // Silent error handling
    });
}
