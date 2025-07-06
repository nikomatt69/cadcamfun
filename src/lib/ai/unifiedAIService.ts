import {
  AIModelType,
  AIRequest,
  AIResponse,
  TextToCADRequest,
  AIDesignSuggestion,
  MCPRequestParams,
  MCPResponse,
} from "@/src/types/AITypes";
import { aiCache } from "./ai-new/aiCache";
import { aiAnalytics } from "./ai-new/aiAnalytics";
import { promptTemplates } from "./promptTemplates";
import type { Element } from "@/src/store/elementsStore";
import { mcpService } from "./ai-new/mcpService";
import { aiConfigManager } from "./ai-new/aiConfigManager";
import { aiStreamingService } from "./aiStreamingService";
import {
  getMCPIntegratedService,
  MCPIntegratedRequest,
} from "./mcp/mcpIntegratedService";
import { getExtendedThinkingService } from "./ai-new/extendedThinkingService";
import { v4 as uuidv4 } from "uuid";
import {
  ContinuityOrchestrator,
  AutonomousServiceCall,
  SessionUpdate,
} from "./autonomous/continuityOrchestrator";
import {
  AutonomousSession,
  AutonomousPreferences,
  CADContext,
  ProgressReport,
} from "@/src/types/autonomousTypes";

// Enhanced CAD Generation System Imports
import {
  AdvancedCADParser,
  EnhancedElement,
  ValidationResult,
} from "./parsers/advancedCADParser";
import {
  GeometricValidator,
  GeometricValidationRule,
} from "./validation/geometricValidator";
import {
  ComponentLibraryService,
  StandardComponent,
} from "./component-library/standardComponents";
import { ContextEngine, EngineeringContext } from "./context/contextEngine";
import { AssemblyEngine, AssemblyPlan } from "./assembly/assemblyEngine";
import {
  CADGenerationAnalytics,
  GenerationMetrics,
} from "./analytics/cadGenerationAnalytics";
import {
  CADGenerationTester,
  CADTestCase,
  TestSuiteResults,
} from "./tests/cadGenerationTests";

// Add necessary imports from openaiService and AITypes if not already present
import { openAIService } from "./openaiService"; // Ensure this is the singleton instance
import {
  webSearchService,
  WebSearchOptions,
  CADContextForSearch,
} from "./websearch/websearchService";
// Adjust import to include types specifically used by the new method
import {
  AIMessage,
  AIArtifact,
  AIAction,
  ResponseStyle,
  ComplexityLevel,
  AssistantRole,
  MessageContent,
  TextContentBlock,
  ImageContentBlock,
  // Removed OpenAI specific types - will use general types or 'any' for now
} from "@/src/types/AITypes"; // Adjust path as needed

// Code Interpreter imports
import { codeInterpreterService } from "./codeInterpreter/codeInterpreterService";
import { containerManager } from "./codeInterpreter/containerManager";
import {
  CodeInterpreterRequest,
  CodeInterpreterResponse,
  CADCodeRequest,
  GCodeCodeRequest,
  ContainerInfo,
} from "@/src/types/codeInterpreterTypes";

// NUOVO: Import Vision Service
import { openAIVisionService } from "./vision/openaiVisionService";
import type {
  ImageAnalysisRequest,
  VisionAnalysisResult,
} from "@/src/types/visionTypes";

// Define ForceToolChoice locally if not exported elsewhere
interface ForceToolChoice {
  type: "function";
  function: { name: string };
}

/**
 * Servizio AI unificato che gestisce tutte le interazioni con i modelli AI
 * e fornisce metodi specializzati per i diversi casi d'uso dell'applicazione.
 */
export class UnifiedAIService {
  // Sistema autonomo
  private autonomousOrchestrator: ContinuityOrchestrator;
  private apiKey: string;
  private allowBrowser: boolean = true;
  private defaultModel: AIModelType = "claude-sonnet-4-20250514";
  private defaultMaxTokens: number = 8000;
  private mcpEnabled: boolean = false;
  private mcpStrategy: "aggressive" | "balanced" | "conservative" = "balanced";
  private mcpCacheLifetime: number = 3600000; // 1 ora in millisecondi
  private apiEndpoint = "/api/ai/proxy"; // Added apiEndpoint property

  // Enhanced CAD Generation Configuration
  private cadEnhancementsEnabled: boolean = true;
  private validationEnabled: boolean = true;
  private componentLibraryEnabled: boolean = true;
  private contextAwarenessEnabled: boolean = true;
  private assemblyIntelligenceEnabled: boolean = true;
  private analyticsEnabled: boolean = true;
  private autoCorrectionsEnabled: boolean = true;

  // Code Interpreter Configuration
  private codeInterpreterEnabled: boolean = true;
  private defaultCodeInterpreterModel: AIModelType = "gpt-4.1";
  private autoContainerCleanup: boolean = true;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || "";

    // Instantiate ContinuityOrchestrator with openAIService
    // unifiedAIService will be set via a setter to break the circular dependency.
    this.autonomousOrchestrator = new ContinuityOrchestrator(openAIService);
    // Now, inject this UnifiedAIService instance into the orchestrator.
    this.autonomousOrchestrator.setUnifiedAIService(this);

    // Leggi le configurazioni da aiConfigManager se disponibili
    const config = aiConfigManager.getConfig();
    if (config) {
      this.defaultModel = config.defaultModel || this.defaultModel;
      this.defaultMaxTokens = config.maxTokens || this.defaultMaxTokens;
      this.allowBrowser = config.allowBrowser ?? this.allowBrowser;
      this.mcpEnabled = config.mcpEnabled ?? this.mcpEnabled;

      // Carica le impostazioni MCP se disponibili
      if (config.mcpStrategy) {
        this.mcpStrategy = config.mcpStrategy as
          | "aggressive"
          | "balanced"
          | "conservative";
      }
      if (config.mcpCacheLifetime) {
        this.mcpCacheLifetime = config.mcpCacheLifetime;
      }

      // Carica impostazioni Code Interpreter se disponibili
      // Note: These would be added to AIServiceConfig type if needed
      // this.codeInterpreterEnabled = config.codeInterpreterEnabled ?? this.codeInterpreterEnabled;
    }
  }

  /**
   * Processo generico per le richieste AI con supporto per caching e analytics
   */
  async processRequest<T>({
    prompt,
    model = this.defaultModel,
    systemPrompt,
    temperature = 0.7,
    maxTokens = this.defaultMaxTokens,
    parseResponse,
    onProgress,
    metadata = {},
    useMCP,
    mcpParams,
  }: AIRequest): Promise<AIResponse<T>> {
    // Determina se utilizzare MCP
    const shouldUseMCP = useMCP ?? this.mcpEnabled;

    // Se MCP è abilitato, utilizza il servizio MCP
    if (shouldUseMCP) {
      return this.processMCPRequest<T>({
        prompt,
        model,
        systemPrompt,
        temperature,
        maxTokens,
        parseResponse,
        onProgress,
        metadata,
        mcpParams,
      });
    }

    // Genera una chiave di cache basata sui parametri della richiesta
    const cacheKey = aiCache.getKeyForRequest({
      prompt,
      model,
      systemPrompt,
      temperature,
    });

    // Verifica se la risposta è già in cache
    const cachedResponse = aiCache.get<AIResponse<T>>(cacheKey);
    if (cachedResponse) {
      return {
        ...cachedResponse,
        fromCache: true,
      };
    }

    // Traccia l'inizio della richiesta per analytics
    const requestId = aiAnalytics.trackRequestStart("ai_request", model, {
      promptLength: prompt.length,
      ...metadata,
    });

    const startTime = Date.now();

    try {
      let fullResponse = "";
      let tokenUsage = {
        promptTokens: Math.round(prompt.length / 4), // stima approssimativa
        completionTokens: 0,
        totalTokens: Math.round(prompt.length / 4),
      };

      // Usa il proxy API invece di chiamare direttamente Anthropic
      const response = await fetch("/api/ai/proxy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: maxTokens,
          temperature,
          system: systemPrompt,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "API request failed");
      }

      const data = await response.json();

      // Estrai il testo dalla risposta
      fullResponse =
        data.content[0]?.type === "text" ? data.content[0].text : "";

      // Ottieni l'utilizzo dei token dalla risposta
      if (data.usage) {
        tokenUsage = {
          promptTokens: data.usage.input_tokens,
          completionTokens: data.usage.output_tokens,
          totalTokens: data.usage.input_tokens + data.usage.output_tokens,
        };
      } else {
        // Stima dei token se non disponibile nella risposta
        tokenUsage.completionTokens = Math.round(fullResponse.length / 4);
        tokenUsage.totalTokens =
          tokenUsage.promptTokens + tokenUsage.completionTokens;
      }

      // Calcola il tempo di elaborazione
      const processingTime = Date.now() - startTime;

      // Registra il completamento della richiesta
      aiAnalytics.trackRequestComplete(
        requestId,
        processingTime,
        true,
        tokenUsage.promptTokens,
        tokenUsage.completionTokens
      );

      // Analizza la risposta se è fornita una funzione di parsing
      let parsedData: T | null = null;
      let parsingError: Error | null = null;

      if (parseResponse && fullResponse) {
        try {
          parsedData = await parseResponse(fullResponse);
        } catch (err) {
          parsingError =
            err instanceof Error ? err : new Error("Failed to parse response");

          // Traccia l'errore di parsing
          aiAnalytics.trackEvent({
            eventType: "error",
            eventName: "parsing_error",
            success: false,
            metadata: {
              requestId,
              error: parsingError.message,
            },
          });
        }
      }

      // Prepara la risposta finale
      const finalResponse: AIResponse<T> = {
        rawResponse: fullResponse,
        data: parsedData,
        error: parsingError?.message,
        parsingError,
        processingTime,
        model,
        success: !parsingError,
        usage: tokenUsage,
        metadata: {
          ...metadata,
          requestId,
        },
      };

      // Memorizza la risposta nella cache
      aiCache.set(cacheKey, finalResponse);

      return finalResponse;
    } catch (error) {
      const finalError =
        error instanceof Error
          ? error
          : new Error("Unknown error during AI request processing");
      // Traccia l'errore
      aiAnalytics.trackEvent({
        eventType: "error",
        eventName: "api_error",
        errorType: finalError.name,
        success: false,
        metadata: {
          requestId,
          message: finalError.message,
        },
      });

      // Restituisci una risposta di errore
      return {
        rawResponse: null,
        data: null,
        error: finalError.message,
        success: false,
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        },
        metadata: {
          ...metadata,
          requestId,
        },
      };
    }
  }

  /**
   * Elabora una richiesta tramite il protocollo MCP
   */
  private async processMCPRequest<T>(
    request: AIRequest
  ): Promise<AIResponse<T>> {
    // Configura parametri MCP basati sulla strategia selezionata
    const defaultMCPParams: MCPRequestParams = this.getMCPParamsFromStrategy();

    // Unisci i parametri di default con quelli forniti (se presenti)
    const mcpParams: MCPRequestParams = {
      ...defaultMCPParams,
      ...(request.mcpParams || {}),
    };

    // Aggiungi parametri MCP alla richiesta
    const mcpRequest: AIRequest = {
      ...request,
      mcpParams,
    };

    try {
      // Determina la priorità in base al tipo di richiesta
      const priority = this.getMCPPriorityFromMetadata(request.metadata);

      // Invia la richiesta tramite MCP service
      const mcpResponse = await mcpService.enqueue<T>(mcpRequest, priority);

      // Registra analisi MCP se è stata utilizzata la cache
      if (mcpResponse.cacheHit) {
        aiAnalytics.trackEvent({
          eventType: "mcp",
          eventName: "cache_hit",
          success: true,
          metadata: {
            similarity: mcpResponse.similarity,
            savings: mcpResponse.savingsEstimate,
          },
        });
      }

      return mcpResponse.response;
    } catch (error) {
      console.error("MCP request failed:", error);

      // Fallback al processamento standard in caso di errore MCP
      console.log("Falling back to standard request processing");

      // Rimuovi i parametri MCP e riprova con il processamento standard
      const {
        mcpParams: removedMcpParams,
        useMCP,
        ...standardRequest
      } = request;
      return this.processRequest<T>(standardRequest);
    }
  }

  /**
   * Determina i parametri MCP basati sulla strategia configurata
   */
  private getMCPParamsFromStrategy(): MCPRequestParams {
    switch (this.mcpStrategy) {
      case "aggressive":
        return {
          cacheStrategy: "hybrid",
          minSimilarity: 0.65,
          cacheTTL: this.mcpCacheLifetime,
          priority: "speed",
          storeResult: true,
        };
      case "conservative":
        return {
          cacheStrategy: "exact",
          minSimilarity: 0.9,
          cacheTTL: this.mcpCacheLifetime,
          priority: "quality",
          storeResult: true,
        };
      case "balanced":
      default:
        return {
          cacheStrategy: "semantic",
          minSimilarity: 0.8,
          cacheTTL: this.mcpCacheLifetime,
          priority: "quality",
          storeResult: true,
        };
    }
  }

  /**
   * Determina la priorità MCP in base ai metadati della richiesta
   */
  private getMCPPriorityFromMetadata(
    metadata: Record<string, any> = {}
  ): "high" | "normal" | "low" {
    const requestType = metadata?.type || "";

    // Richieste ad alta priorità
    if (
      requestType.includes("message") ||
      requestType.includes("critical") ||
      requestType.includes("interactive")
    ) {
      return "high";
    }

    // Richieste a bassa priorità
    if (
      requestType.includes("background") ||
      requestType.includes("batch") ||
      requestType.includes("analysis")
    ) {
      return "low";
    }

    // Priorità normale di default
    return "normal";
  }

  /**
   * Converte descrizione di testo in elementi CAD
   */
  async textToCADElements(
    request: TextToCADRequest
  ): Promise<AIResponse<Element[]>> {
    const {
      description,
      constraints,
      style = "precise",
      complexity = "moderate",
      context = [],
      structuredContext,
    } = request;

    // Costruisce il prompt di sistema utilizzando il template
    const systemPrompt = promptTemplates.textToCAD.system
      .replace("{{complexity}}", complexity)
      .replace("{{style}}", style);

    // Costruisce il prompt utente
    let userPrompt = promptTemplates.textToCAD.user.replace(
      "{{description}}",
      description
    );
    if (constraints) {
      userPrompt += "\n\nConstraints:\n" + JSON.stringify(constraints, null, 2);
    }
    if (context && context.length > 0) {
      userPrompt += "\n\nReference Context:\n";
      const maxContextLength = 5000; // Limit context size
      context.forEach((contextItem, index) => {
        const truncatedContext =
          contextItem.length > maxContextLength
            ? contextItem.substring(0, maxContextLength) +
              "... [content truncated]"
            : contextItem;
        userPrompt += `\n--- Context Document ${index + 1} ---\n${truncatedContext}\n`;
      });
      userPrompt += "\n\nPlease consider the above reference context...";
    }

    // Aggiungi contesto strutturato se disponibile
    if (structuredContext && Object.keys(structuredContext).length > 0) {
      userPrompt +=
        "\n\nStructured Context Information:\n" +
        JSON.stringify(structuredContext, null, 2);
      userPrompt +=
        "\n\nPlease use this structured context to guide your element generation.";
    }

    // Revert to calling this.processRequest
    return this.processRequest<Element[]>({
      prompt: userPrompt, // Pass the constructed user prompt
      systemPrompt,
      model: "claude-sonnet-4-20250514",

      temperature: complexity === "creative" ? 0.8 : 0.5,
      maxTokens: this.defaultMaxTokens,
      parseResponse: this.parseTextToCADResponseEnhanced, // Use the enhanced parsing function with fallback
      metadata: {
        // Pass relevant metadata
        type: "text_to_cad",
        description: description.substring(0, 100),
        complexity,
        style,
        contextCount: context?.length || 0,
      },
      // Add useMCP/mcpParams here if needed based on request
      // useMCP: request.useMCP,
      // mcpParams: request.mcpParams
    });
  }

  /**
   * Analizza progetti CAD e fornisce suggerimenti
   */
  async analyzeDesign(
    elements: Element[],
    enhancedContext?: string,
    structuredContext?: Record<string, any>,
    overrideSystemPrompt?: string
  ): Promise<AIResponse<AIDesignSuggestion[]>> {
    const prompt = promptTemplates.designAnalysis.user.replace(
      "{{elements}}",
      JSON.stringify(elements, null, 2)
    );

    // Aggiungi contesto avanzato se disponibile
    let userPrompt = prompt;
    if (enhancedContext) {
      userPrompt += "\n\nAdditional Context:\n" + enhancedContext;
    }

    // Aggiungi contesto strutturato se disponibile
    if (structuredContext && Object.keys(structuredContext).length > 0) {
      userPrompt +=
        "\n\nStructured Context Information:\n" +
        JSON.stringify(structuredContext, null, 2);
    }

    return this.processRequest<AIDesignSuggestion[]>({
      prompt: userPrompt,
      systemPrompt:
        overrideSystemPrompt || promptTemplates.designAnalysis.system,
      model: "claude-sonnet-4-20250514",
      temperature: 0.3,
      maxTokens: this.defaultMaxTokens,
      parseResponse: this.parseDesignResponse,
      metadata: {
        type: "design_analysis",
        elementCount: elements.length,
      },
    });
  }

  /**
   * Ottimizza G-code per macchine CNC
   */
  async optimizeGCode(
    gcode: string,
    machineType: string,
    enhancedContext?: string,
    structuredContext?: Record<string, any>,
    material?: string,
    overrideSystemPrompt?: string
  ): Promise<AIResponse<string>> {
    const templateSystemPrompt =
      promptTemplates.gcodeOptimization.system.replace(
        "{{machineType}}",
        machineType
      );

    const constraints = `- Optimize for speed and efficiency
    - Maintain part accuracy and quality
    - Ensure safe machine operation
    - Follow ${machineType} best practices`;

    let prompt = promptTemplates.gcodeOptimization.user
      .replace("{{machineType}}", machineType)
      .replace("{{material}}", material || "unknown material")
      .replace("{{gcode}}", gcode)
      .replace("{{constraints}}", constraints);

    // Aggiungi contesto avanzato se disponibile
    if (enhancedContext) {
      prompt += "\n\nAdditional Context:\n" + enhancedContext;
    }

    // Aggiungi contesto strutturato se disponibile
    if (structuredContext && Object.keys(structuredContext).length > 0) {
      prompt +=
        "\n\nStructured Context Information:\n" +
        JSON.stringify(structuredContext, null, 2);
    }

    return this.processRequest<string>({
      prompt,
      // Use overrideSystemPrompt if provided, otherwise default to template-based one
      systemPrompt: overrideSystemPrompt || templateSystemPrompt,
      model: "claude-sonnet-4-20250514",
      temperature: 0.3,
      maxTokens: this.defaultMaxTokens,
      parseResponse: (text) => Promise.resolve(text),
      metadata: {
        type: "gcode_optimization",
        machineType,
        material,
        codeLength: gcode.length,
      },
    });
  }

  /**
   * Genera suggerimenti specifici per il contesto corrente
   */
  async generateSuggestions(
    context: string,
    mode: string,
    overrideSystemPrompt?: string
  ): Promise<AIResponse<string[]>> {
    const prompt = `Based on the current ${mode} context, generate 3-5 helpful suggestions.
    
    Context details:
    ${context}
    
    Provide suggestions as a JSON array of strings. Each suggestion should be clear, specific, and actionable.`;

    const defaultSystemPrompt = `You are an AI CAD/CAM assistant helping users with ${mode} tasks. Generate helpful context-aware suggestions.`;

    return this.processRequest<string[]>({
      prompt,
      systemPrompt: overrideSystemPrompt || defaultSystemPrompt,
      model: "claude-sonnet-4-20250514",
      temperature: 0.7,
      maxTokens: 1000,
      parseResponse: this.parseSuggestionsResponse,
      metadata: {
        type: "suggestions",
        mode,
      },
    });
  }

  /**
   * Ottimizza parametri di lavorazione in base al materiale e all'utensile
   */
  async optimizeMachiningParameters(
    material: string,
    toolType: string,
    operation: string
  ): Promise<AIResponse<any>> {
    const prompt = promptTemplates.machiningParameters.user
      .replace("{{material}}", material)
      .replace("{{tool}}", toolType)
      .replace("{{operation}}", operation)
      .replace("{{machine}}", "Generic CNC");

    return this.processRequest<any>({
      prompt,
      systemPrompt: promptTemplates.machiningParameters.system,
      model: "claude-sonnet-4-20250514",
      temperature: 0.3,
      maxTokens: 4000,
      parseResponse: this.parseMachiningResponse,
      metadata: {
        type: "machining_parameters",
        material,
        toolType,
        operation,
      },
    });
  }

  /**
   * Esegue ricerca web ottimizzata per CAD/CAM
   */
  async searchWeb(
    query: string,
    options?: WebSearchOptions,
    cadContext?: CADContextForSearch,
    useAI: boolean = true
  ): Promise<AIResponse<any>> {
    const startTime = Date.now();

    try {
      // Use 'any' for serviceResponse initially, as its 'usage' type differs.
      let serviceResponse: any;
      if (useAI) {
        const aiCoreService = await import("./aiCore").then((m) => m.aiCore);
        serviceResponse = await aiCoreService.processWebSearchRequest({
          query,
          options,
          cadContext,
          useSemanticAnalysis: !!cadContext,
          conversationId: `unified_search_${Date.now()}`,
        });
      } else {
        serviceResponse = await webSearchService.search(
          query,
          options,
          cadContext
        );
      }

      // Ensure usage field conforms to the expected type with non-optional token counts
      const usageInput = serviceResponse.usage || {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      };
      const conformingUsage = {
        promptTokens: usageInput.promptTokens ?? 0,
        completionTokens: usageInput.completionTokens ?? 0,
        totalTokens: usageInput.totalTokens ?? 0,
        cost: usageInput.cost,
      };

      return {
        ...serviceResponse,
        usage: conformingUsage,
      } as AIResponse<any>; // Cast the final result to the expected return type
    } catch (error) {
      return {
        rawResponse: null,
        data: null,
        error: error instanceof Error ? error.message : "Unknown error",
        success: false,
        processingTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Ricerca web con analisi contestuale dei progetti CAD
   */
  async searchWebWithContext(
    query: string,
    elements: Element[],
    projectContext: Record<string, any>,
    options?: WebSearchOptions
  ): Promise<AIResponse<any>> {
    // Estrai contesto CAD dagli elementi
    const cadContext: CADContextForSearch = {
      projectType: projectContext.type || "general",
      materials: this.extractMaterialsFromElements(elements),
      machineType: projectContext.machineType,
      toolTypes: this.extractToolTypesFromElements(elements),
      currentOperation: projectContext.currentOperation,
      technicalTerms: this.extractTechnicalTerms(
        query + " " + JSON.stringify(projectContext)
      ),
    };

    // Esegui ricerca con contesto
    return this.searchWeb(
      query,
      {
        ...options,
        contextAware: true,
        searchDepth: "deep",
      },
      cadContext
    );
  }

  /**
   * NUOVO: Analizza immagini usando OpenAI Vision API
   * Metodo dedicato per l'analisi di immagini nel contesto CAD/CAM
   */
  async processImageAnalysis(
    request: ImageAnalysisRequest
  ): Promise<AIResponse<VisionAnalysisResult[]>> {
    const startTime = Date.now();
    const requestId = uuidv4();

    // Validazione input
    if (!request.images || request.images.length === 0) {
      return {
        rawResponse: null,
        data: [],
        error: "No images provided for analysis",
        success: false,
        processingTime: Date.now() - startTime,
        model: "gpt-4.1-mini-vision" as AIModelType,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      };
    }

    // Track analytics
    aiAnalytics.trackRequestStart("vision_analysis", "gpt-4.1-mini-vision", {
      imageCount: request.images.length,
      analysisType: request.analysisType,
      requestId,
      hasCADContext: !!request.cadContext,
    });

    try {
      // Usa il servizio Vision dedicato
      const results =
        await openAIVisionService.processImageAnalysisRequest(request);

      const processingTime = Date.now() - startTime;

      // Calcola usage approssimativo per Vision API
      const estimatedUsage = {
        promptTokens: Math.round(request.prompt.length / 4),
        completionTokens: Math.round(
          results.reduce((acc, result) => acc + result.analysis.length, 0) / 4
        ),
        totalTokens: 0,
      };
      estimatedUsage.totalTokens =
        estimatedUsage.promptTokens + estimatedUsage.completionTokens;

      // Track completion
      aiAnalytics.trackRequestComplete(
        requestId,
        processingTime,
        true,
        estimatedUsage.promptTokens,
        estimatedUsage.completionTokens
      );

      return {
        rawResponse: JSON.stringify(results),
        data: results,
        success: true,
        error: undefined,
        processingTime,
        model: "gpt-4.1-mini-vision" as AIModelType,
        provider: "openai",
        usage: estimatedUsage,
        metadata: {
          requestId,
          imageCount: request.images.length,
          analysisType: request.analysisType,
          averageConfidence:
            results.reduce((acc, r) => acc + r.confidence, 0) / results.length,
          hasCADContext: !!request.cadContext,
        },
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Unknown vision analysis error";

      console.error(
        `❌ [UnifiedAIService] Vision analysis failed (${processingTime}ms):`,
        error
      );

      // Track error
      aiAnalytics.trackRequestComplete(requestId, processingTime, false, 0, 0);
      aiAnalytics.trackEvent({
        eventType: "error",
        eventName: "vision_analysis_error",
        errorType: error instanceof Error ? error.name : "unknown",
        success: false,
        metadata: {
          requestId,
          message: errorMessage,
          imageCount: request.images.length,
          analysisType: request.analysisType,
        },
      });

      return {
        rawResponse: null,
        data: null,
        error: `Vision analysis failed: ${errorMessage}`,
        success: false,
        processingTime,
        model: "gpt-4.1-mini-vision" as AIModelType,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        metadata: {
          requestId,
          errorType: error instanceof Error ? error.name : "unknown",
        },
      };
    }
  }

  /**
   * Helper: Estrai materiali dagli elementi
   */
  private extractMaterialsFromElements(elements: Element[]): string[] {
    const materials = new Set<string>();
    elements.forEach((el) => {
      if (el.material) materials.add(el.material);
    });
    return Array.from(materials);
  }

  /**
   * Helper: Estrai tipi di utensili dagli elementi
   */
  private extractToolTypesFromElements(elements: Element[]): string[] {
    const tools = new Set<string>();
    elements.forEach((el) => {
      if (el.toolType) tools.add(el.toolType);
      if (el.toolPath?.toolType) tools.add(el.toolPath.toolType);
    });
    return Array.from(tools);
  }

  /**
   * Helper: Estrai termini tecnici
   */
  private extractTechnicalTerms(text: string): string[] {
    const technicalKeywords = [
      "tolerance",
      "roughness",
      "feed rate",
      "spindle speed",
      "toolpath",
      "g-code",
      "surface finish",
      "chip load",
      "cutting speed",
      "depth of cut",
      "step over",
      "plunge rate",
    ];

    const found: string[] = [];
    const lowerText = text.toLowerCase();

    technicalKeywords.forEach((keyword) => {
      if (lowerText.includes(keyword)) {
        found.push(keyword);
      }
    });

    return found;
  }

  /**
   * Genera completamenti per G-code durante l'editing
   */
  async completeGCode(
    context: string,
    cursorPosition: any
  ): Promise<AIResponse<string>> {
    const prompt = `Complete the following G-code at the cursor position.
    
    Current G-code:
    ${context}
    
    Cursor position: line ${cursorPosition.lineNumber}, column ${cursorPosition.column}
    
    Provide only the completion text, no explanations.`;

    return this.processRequest<string>({
      prompt,
      systemPrompt: `You are a CNC programming expert. Complete G-code accurately and efficiently.`,
      model: "claude-sonnet-4-20250514", // Modello veloce per completamenti in tempo reale
      temperature: 0.2,
      maxTokens: 100,
      parseResponse: (text) => Promise.resolve(text.trim()),
      metadata: {
        type: "gcode_completion",
        contextLength: context.length,
      },
    });
  }

  /**
   * Processa un messaggio diretto dall'assistente AI
   */
  async processMessage(
    message: string,
    mode: string
  ): Promise<AIResponse<string>> {
    let contextPrefix = "";

    // Aggiunge contesto in base alla modalità
    switch (mode) {
      case "cad":
        contextPrefix =
          "You are an expert CAD design assistant helping with 3D modeling. ";
        break;
      case "cam":
        contextPrefix =
          "You are an expert CAM programming assistant helping with CNC manufacturing. ";
        break;
      case "gcode":
        contextPrefix =
          "You are an expert G-code programming assistant helping with CNC code. ";
        break;
      case "toolpath":
        contextPrefix =
          "You are an expert toolpath optimization assistant for CNC machines. ";
        break;
      default:
        contextPrefix = "You are a helpful CAD/CAM software assistant. ";
    }

    return this.processRequest<string>({
      prompt: message,
      systemPrompt:
        contextPrefix +
        "Provide helpful, concise, and accurate responses to the user.",
      model: "claude-sonnet-4-20250514",
      temperature: 0.7,
      maxTokens: 4000,
      parseResponse: (text) => Promise.resolve(text),
      metadata: {
        type: "assistant_message",
        mode,
        messageLength: message.length,
      },
    });
  }

  /**
   * Configura i parametri del servizio AI
   */
  setConfig(config: {
    defaultModel?: AIModelType;
    defaultMaxTokens?: number;
    allowBrowser?: boolean;
    mcpEnabled?: boolean;
    mcpStrategy?: "aggressive" | "balanced" | "conservative";
    mcpCacheLifetime?: number;
  }): void {
    if (config.defaultModel) this.defaultModel = config.defaultModel;
    if (config.defaultMaxTokens)
      this.defaultMaxTokens = config.defaultMaxTokens;
    if (config.allowBrowser !== undefined)
      this.allowBrowser = config.allowBrowser;

    // Aggiungi configurazioni MCP
    if (config.mcpEnabled !== undefined) this.mcpEnabled = config.mcpEnabled;
    if (config.mcpStrategy) this.mcpStrategy = config.mcpStrategy;
    if (config.mcpCacheLifetime)
      this.mcpCacheLifetime = config.mcpCacheLifetime;
  }

  /**
   * Enhanced Parser: Converti testo in elementi CAD con validazione ingegneristica
   * Integra parser avanzato con fallback al parser originale in caso di errori
   */
  private parseTextToCADResponseEnhanced = async (
    text: string
  ): Promise<EnhancedElement[]> => {
    // If enhancements are disabled, use original parser directly
    if (!this.cadEnhancementsEnabled) {
      return this.enhanceBasicElements(await this.parseTextToCADResponse(text));
    }

    try {
      // Step 1: Try advanced parsing
      let parseResult;
      try {
        parseResult = await AdvancedCADParser.parseCADResponse(text);
      } catch (parseError) {
        // Use original parser but continue with enhanced processing if possible
        const basicElements = await this.parseTextToCADResponse(text);
        parseResult = { elements: this.enhanceBasicElements(basicElements) };
      }

      // Step 2: Try validation (if we have elements)
      if (this.validationEnabled && parseResult.elements.length > 0) {
        try {
          const validationResults = GeometricValidator.validateElements(
            parseResult.elements
          );
          const categorized =
            GeometricValidator.categorizeResults(validationResults);

          // Log validation results
          if (
            categorized.critical.length > 0 ||
            categorized.warnings.length > 0
          ) {
            console.warn("CAD Validation Results:", {
              critical: categorized.critical.length,
              warnings: categorized.warnings.length,
              suggestions: categorized.suggestions.length,
            });
          }

          // Step 3: Try auto-corrections (if needed and enabled)
          if (this.autoCorrectionsEnabled && categorized.critical.length > 0) {
            try {
              const correctedElements = await this.applyEngineeringCorrections(
                parseResult.elements,
                categorized.critical
              );
              return correctedElements;
            } catch (correctionError) {
              console.warn("Auto-correction failed:", correctionError);
              console.log("Continuing with uncorrected elements");
            }
          }
        } catch (validationError) {
          console.warn("Validation failed:", validationError);
          console.log("Continuing without validation");
        }
      }

      return parseResult.elements;
    } catch (error) {
      // Complete fallback - if anything goes wrong, use original parser
      console.error("Enhanced CAD processing completely failed:", error);
      console.log("Falling back to original parser with no enhancements");
      return this.enhanceBasicElements(await this.parseTextToCADResponse(text));
    }
  };

  /**
   * Convert basic elements from original parser to enhanced elements
   * This ensures type compatibility when falling back to the original parser
   */
  private enhanceBasicElements(basicElements: Element[]): EnhancedElement[] {
    return basicElements.map((element) => {
      // Add required EnhancedElement properties
      const enhanced = {
        ...element,
        id: element.id || uuidv4(),
        metadata: element.metadata || {
          source: "original-parser",
          confidence: 0.8,
          validationStatus: "unvalidated",
        },
        engineeringProperties: {
          material: element.material || "unknown",
          tolerance: "standard",
          surfaceFinish: "regular",
          manufacturingProcess: ["machining"],
          criticalDimensions: [],
        },
        validationStatus: "valid",
        validationMessages: [],
      };

      return enhanced as EnhancedElement;
    });
  }

  /**
   * Apply engineering corrections to CAD elements based on validation results
   * @param elements The elements to correct
   * @param validationIssues The validation issues to fix
   * @returns The corrected elements
   */
  private async applyEngineeringCorrections(
    elements: EnhancedElement[],
    validationIssues: ValidationResult[]
  ): Promise<EnhancedElement[]> {
    // Create a deep copy of elements to avoid mutating the original
    const correctedElements = JSON.parse(JSON.stringify(elements));

    // Apply corrections for each validation issue
    for (const issue of validationIssues) {
      const elementIndex = correctedElements.findIndex(
        (el: EnhancedElement) => el.id === issue.elementId
      );

      if (elementIndex === -1) continue;

      const element = correctedElements[elementIndex];

      switch (issue.type) {
        case "dimension_warning":
          // Fix dimension issues
          if (element.width <= 0) element.width = 1;
          if (element.height <= 0) element.height = 1;
          if (element.depth <= 0) element.depth = 1;
          if (element.radius <= 0) element.radius = 1;
          break;

        case "geometry_error":
          // Fix geometry issues including positions and self-intersections
          if (isNaN(element.x)) element.x = 0;
          if (isNaN(element.y)) element.y = 0;
          if (isNaN(element.z)) element.z = 0;

          // Simplify complex geometries with issues
          if (element.points && element.points.length > 0) {
            element.points = this.simplifyPoints(element.points);
          }
          break;

        case "manufacturing_error":
          // Adjust elements to make them manufacturable
          this.removeIncompatibleProperties(element);
          break;

        case "interference_error":
          // Adjust positions to resolve interference
          if (issue.affectedProperty && issue.recommendedValue !== undefined) {
            (element as any)[issue.affectedProperty] = issue.recommendedValue;
          }
          break;

        case "material_warning":
        case "tolerance_error":
          // Apply suggested fix if provided
          if (issue.affectedProperty && issue.recommendedValue !== undefined) {
            (element as any)[issue.affectedProperty] = issue.recommendedValue;
          }
          break;

        default:
          console.warn(`No correction available for issue type: ${issue.type}`);
      }
    }

    return correctedElements;
  }

  /**
   * Helper method to simplify points array by removing duplicates or very close points
   */
  private simplifyPoints(points: any[]): any[] {
    if (!points || points.length <= 2) return points;

    const result = [points[0]];
    const minDistance = 0.001;

    for (let i = 1; i < points.length; i++) {
      const prevPoint = result[result.length - 1];
      const currentPoint = points[i];

      // Calculate distance between points
      const distance = Math.sqrt(
        Math.pow((currentPoint.x || 0) - (prevPoint.x || 0), 2) +
          Math.pow((currentPoint.y || 0) - (prevPoint.y || 0), 2) +
          Math.pow((currentPoint.z || 0) - (prevPoint.z || 0), 2)
      );

      // Only add point if it's far enough from previous point
      if (distance > minDistance) {
        result.push(currentPoint);
      }
    }

    return result;
  }

  /**
   * Helper method to remove properties not compatible with element type
   */
  private removeIncompatibleProperties(element: EnhancedElement): void {
    const typePropertyMap: Record<string, string[]> = {
      cube: ["x", "y", "z", "width", "height", "depth", "color", "rotation"],
      sphere: ["x", "y", "z", "radius", "color"],
      cylinder: ["x", "y", "z", "radius", "height", "color", "rotation"],
      cone: ["x", "y", "z", "radius", "height", "color", "rotation"],
      path: ["points", "color", "thickness"],
      text: ["x", "y", "z", "text", "color", "size", "rotation"],
    };

    const allowedProps = typePropertyMap[element.type] || [];

    // Keep only allowed properties plus common ones like id, name, etc.
    const commonProps = ["id", "name", "type", "metadata"];
    const validProps = [...allowedProps, ...commonProps];

    // Remove invalid properties
    Object.keys(element).forEach((prop) => {
      if (!validProps.includes(prop)) {
        delete element[prop];
      }
    });
  }

  /**
   * Parser: Converti testo in elementi CAD (versione originale)
   */
  private parseTextToCADResponse = async (text: string): Promise<Element[]> => {
    try {
      // Cerca blocchi JSON nella risposta
      const jsonMatch =
        text.match(/```json\n([\s\S]*?)\n```/) ||
        text.match(/\[\s*\{[\s\S]*\}\s*\]/);

      if (!jsonMatch) {
        throw new Error("No valid JSON found in response");
      }

      const json = jsonMatch[1] || jsonMatch[0];
      const elements = JSON.parse(json);

      // Valida e arricchisce gli elementi con valori predefiniti
      return elements.map((el: any) => ({
        type: el.type || "cube",
        x: el.x ?? 0,
        y: el.y ?? 0,
        z: el.z ?? 0,
        width: el.width ?? 50,
        height: el.height ?? 50,
        depth: el.depth ?? 50,
        radius: el.radius ?? 25,
        color: el.color ?? "#1e88e5",
        ...(el.rotation && {
          rotation: {
            x: el.rotation.x ?? 0,
            y: el.rotation.y ?? 0,
            z: el.rotation.z ?? 0,
          },
        }),
        ...el,
      }));
    } catch (error) {
      console.error("Failed to parse CAD elements:", error);
      throw error;
    }
  };

  /**
   * Parser: Analisi del design
   */
  private parseDesignResponse = async (
    text: string
  ): Promise<AIDesignSuggestion[]> => {
    try {
      // Cerca JSON in diversi formati
      const jsonMatch =
        text.match(/```json\n([\s\S]*?)\n```/) ||
        text.match(/```\n([\s\S]*?)\n```/) ||
        text.match(/\[\s*\{[\s\S]*\}\s*\]/);

      if (!jsonMatch) {
        throw new Error("No valid JSON found in response");
      }

      const json = jsonMatch[1] || jsonMatch[0];
      const parsed = JSON.parse(json);

      // Gestisce sia array diretti che oggetti annidati
      if (Array.isArray(parsed)) {
        return parsed;
      } else if (parsed.suggestions) {
        return parsed.suggestions;
      } else {
        throw new Error("Unexpected JSON format in design response");
      }
    } catch (error) {
      console.error("Failed to parse design response:", error);
      throw error;
    }
  };

  /**
   * Parser: Suggerimenti
   */
  private parseSuggestionsResponse = async (
    text: string
  ): Promise<string[]> => {
    try {
      // Cerca JSON in diversi formati
      const jsonMatch =
        text.match(/```json\n([\s\S]*?)\n```/) ||
        text.match(/\[\s*"[\s\S]*"\s*\]/) ||
        text.match(/\[\s*\{[\s\S]*\}\s*\]/);

      if (!jsonMatch) {
        // Se non trova JSON, estrae elenchi puntati
        const bulletPoints = text.match(/[-*]\s+([^\n]+)/g);
        if (bulletPoints) {
          return bulletPoints.map((point) =>
            point.replace(/^[-*]\s+/, "").trim()
          );
        }

        // Altrimenti divide per righe
        return text
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line.length > 0);
      }

      const json = jsonMatch[1] || jsonMatch[0];
      const parsed = JSON.parse(json);

      // Gestisce sia array di stringhe che array di oggetti
      if (Array.isArray(parsed)) {
        if (typeof parsed[0] === "string") {
          return parsed;
        } else if (typeof parsed[0] === "object") {
          return parsed.map(
            (item) =>
              item.text ||
              item.suggestion ||
              item.description ||
              JSON.stringify(item)
          );
        }
      }

      throw new Error("Unexpected JSON format in suggestions response");
    } catch (error) {
      console.error("Failed to parse suggestions:", error);
      return [];
    }
  };

  /**
   * Parser: Parametri di lavorazione
   */
  private parseMachiningResponse = async (text: string): Promise<any> => {
    try {
      // Cerca JSON in diversi formati
      const jsonMatch =
        text.match(/```json\n([\s\S]*?)\n```/) || text.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const json = jsonMatch[1] || jsonMatch[0];
        return JSON.parse(json);
      }

      // Se non trova JSON, crea un oggetto strutturato
      const params: any = {};

      // Estrae velocità di taglio (SFM o m/min)
      const speedMatch = text.match(
        /cutting speed:?\s*([\d.]+)\s*(sfm|m\/min)/i
      );
      if (speedMatch) {
        params.cuttingSpeed = {
          value: parseFloat(speedMatch[1]),
          unit: speedMatch[2].toLowerCase(),
        };
      }

      // Estrae avanzamento (feed rate)
      const feedMatch = text.match(
        /feed(?:\s*rate)?:?\s*([\d.]+)\s*(ipr|mm\/rev)/i
      );
      if (feedMatch) {
        params.feedRate = {
          value: parseFloat(feedMatch[1]),
          unit: feedMatch[2].toLowerCase(),
        };
      }

      // Estrae profondità di taglio
      const depthMatch = text.match(/depth of cut:?\s*([\d.]+)\s*(in|mm)/i);
      if (depthMatch) {
        params.depthOfCut = {
          value: parseFloat(depthMatch[1]),
          unit: depthMatch[2].toLowerCase(),
        };
      }

      // Estrae step-over
      const stepoverMatch = text.match(
        /step(?:\s*over|\-over):?\s*([\d.]+)(?:\s*%)?/i
      );
      if (stepoverMatch) {
        params.stepover = parseFloat(stepoverMatch[1]);
      }

      return params;
    } catch (error) {
      console.error("Failed to parse machining parameters:", error);
      throw error;
    }
  };

  /**
   * Enhanced CAD request processing with full MCP and Extended Thinking integration
   */
  async processCADRequestWithMCP<T>({
    message,
    cadElements = [],
    projectName,
    userPreferences = {},
    conversationId,
    requestType = "general",
    enableThinking = true,
    enableMCP = true,
    parseResponse,
  }: {
    message: string;
    cadElements?: any[];
    projectName?: string;
    userPreferences?: Record<string, any>;
    conversationId?: string;
    requestType?: "design" | "analysis" | "toolpath" | "gcode" | "general";
    enableThinking?: boolean;
    enableMCP?: boolean;
    parseResponse?: (text: string) => Promise<T>;
  }): Promise<
    AIResponse<T> & {
      thinkingSession?: any;
      mcpToolsCalled?: any[];
      proactiveSuggestions?: string[];
    }
  > {
    const mcpService = getMCPIntegratedService();

    // Determine optimal servers based on request type
    const mcpServers = this.getMCPServersForRequestType(requestType);

    const mcpRequest: MCPIntegratedRequest = {
      message,
      context: {
        conversationId: conversationId || `cad_session_${Date.now()}`,
        cadElements,
        currentProject: projectName,
        userPreferences,
      },
      options: {
        enableThinking,
        enableMCP,
        mcpServers,
        model: this.getOptimalModelForRequestType(requestType),
        temperature: requestType === "analysis" ? 0.3 : 0.7,
        maxTokens: requestType === "gcode" ? 6000 : 4000,
      },
    };

    try {
      const result = await mcpService.processWithMCPAndThinking(mcpRequest);

      // Parse response if parser is provided
      let parsedData: T | null = null;
      let parsingError: Error | null = null;

      if (parseResponse && result.response) {
        try {
          parsedData = await parseResponse(result.response);
        } catch (err) {
          parsingError =
            err instanceof Error ? err : new Error("Failed to parse response");
        }
      }

      return {
        rawResponse: result.response,
        data: parsedData,
        error: parsingError?.message,
        parsingError,
        processingTime: result.processingTime,
        model: mcpRequest.options.model! as AIModelType,
        success: !parsingError,
        usage: result.usage,
        thinkingSession: result.thinkingSession,
        mcpToolsCalled: result.mcpToolsCalled,
        proactiveSuggestions: result.proactiveSuggestions,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return {
        rawResponse: null,
        data: null,
        error: errorMessage,
        success: false,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      };
    }
  }

  /**
   * Get optimal MCP servers for request type
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
        return ["cad-tools", "cam-tools"];
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
        return this.defaultModel;
    }
  }

  /**
   * Test MCP integration from unified service
   */
  async testMCPIntegration(): Promise<{
    success: boolean;
    message: string;
    details?: any;
  }> {
    try {
      const mcpService = getMCPIntegratedService();

      // Verifica se il servizio esiste senza eseguire query
      if (mcpService) {
        return {
          success: true,
          message: "MCP integration ready",
          details: { status: "Available without test query" },
        };
      }

      /* Test disabilitato per evitare chiamate inutili
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
          maxTokens: 2000
        }
      });
      */

      return {
        success: false,
        message: "MCP service not available",
        details: { error: "Could not find MCP service" },
      };
    } catch (error) {
      return {
        success: false,
        message: "MCP integration test failed",
        details: {
          error: error instanceof Error ? error.message : "Unknown error",
        },
      };
    }
  }
  async getAssistantCompletion(
    messages: AIMessage[],
    context: string,
    availableActions: string[] = [],
    responseStyle: ResponseStyle = "detailed",
    complexityLevel: ComplexityLevel = "moderate",
    assistantRole: AssistantRole = "General AI",
    forceToolChoice?: ForceToolChoice,
    modelOverride?: AIModelType,
    structuredContext?: Record<string, any>,
    reasoningEnabled: boolean = true
  ): Promise<AIResponse<any>> {
    const modelToUse = modelOverride || this.defaultModel;
    const startTime = Date.now();
    const requestId = uuidv4();

    // --- Caching Logic ---
    const lastMessage = messages[messages.length - 1];
    const hasImages =
      Array.isArray(lastMessage?.content) &&
      lastMessage.content.some((block) => block.type === "image_url");
    let cacheKey = null;
    let cachedResponse = null;

    // NUOVO: Controllo per analisi Vision se ci sono immagini
    if (hasImages) {
      console.log(
        "🖼️ [UnifiedAIService] Detected images in message, checking for Vision analysis"
      );

      // Estrai testo e immagini dal messaggio
      const textFromMessage = this.extractTextFromMessage(lastMessage);
      const imagesFromMessage = this.extractImagesFromMessage(lastMessage);

      // Controlla se è una richiesta di analisi immagini
      if (this.isImageAnalysisRequest(textFromMessage, availableActions)) {
        console.log(
          "🔍 [UnifiedAIService] Processing as Vision analysis request"
        );

        const analysisType = this.inferAnalysisTypeFromContext(
          context,
          textFromMessage,
          availableActions
        );

        const visionRequest: ImageAnalysisRequest = {
          images: imagesFromMessage,
          prompt:
            textFromMessage ||
            "Analyze this image for CAD/engineering insights",
          cadContext: {
            elements: [],
            projectName: this.extractProjectNameFromContext(context),
          },
          analysisType,
          options: {
            extractDimensions: analysisType === "measurement",
            suggestCADElements: analysisType === "design",
            analyzeManufacturability: analysisType === "manufacturing",
            detectMaterials: true,
          },
        };

        const visionResult = await this.processImageAnalysis(visionRequest);

        // Adatta il risultato Vision al formato AIResponse standard
        if (
          visionResult.success &&
          visionResult.data &&
          visionResult.data.length > 0
        ) {
          const primaryResult = visionResult.data[0];

          return {
            rawResponse: JSON.stringify(visionResult),
            data: {
              content: primaryResult.analysis,
              visionAnalysis: primaryResult,
              artifacts: primaryResult.extractedElements
                ? [
                    {
                      id: uuidv4(),
                      type: "cad_elements",
                      content: primaryResult.extractedElements,
                      title: "Extracted CAD Elements",
                    },
                  ]
                : undefined,
            },
            success: true,
            error: undefined,
            processingTime: visionResult.processingTime || 0,
            model: modelOverride || ("gpt-4.1-mini-vision" as AIModelType),
            provider: "openai",
            usage: visionResult.usage,
            metadata: {
              visionAnalysis: true,
              imageCount: imagesFromMessage.length,
              analysisType,
              requestId,
            },
          };
        } else {
          // Fallback al processamento normale se Vision fallisce
          console.warn(
            "⚠️ [UnifiedAIService] Vision analysis failed, falling back to normal processing"
          );
        }
      }
    }

    if (!hasImages) {
      // Re-add cache key payload generation
      const cacheKeyPayload = {
        messages: messages.map((m) => ({
          role: m.role,
          content:
            typeof m.content === "string"
              ? m.content
              : Array.isArray(m.content)
                ? m.content
                    .filter((b) => b.type === "text")
                    .map((b) => (b as TextContentBlock).text)
                    .join("\\n")
                : "[Unsupported Content]",
        })),
        context,
        availableActions,
        responseStyle,
        complexityLevel,
        assistantRole,
        forceToolChoice,
        model: modelToUse,
      };
      cacheKey = aiCache.getKeyForRequest(cacheKeyPayload); // Pass payload
      cachedResponse = aiCache.get<
        AIResponse<{
          content: string;
          actions?: AIAction[];
          artifacts?: AIArtifact[];
        }>
      >(cacheKey);
    }
    if (cachedResponse) {
      return { ...cachedResponse, fromCache: true };
    }
    // --- End Caching Logic ---

    // --- Analytics Start (Reverting to 3 args) ---
    const metadata = {
      assistantRole,
      responseStyle,
      complexityLevel,
      requestId,
    };
    aiAnalytics.trackRequestStart(
      "assistant_completion", // eventName (string)
      modelToUse, // model (string)
      {
        // metadata (object)
        messageCount: messages.length,
        actionCount: availableActions.length,
        forcedTool: !!forceToolChoice,
        ...metadata, // Spread the specific metadata
      }
    );
    // --- End Analytics Start ---

    try {
      // 1. Construct System Prompt
      let systemPrompt = `You are an AI assistant integrated into a CAD/CAM application. Your role is: ${assistantRole}. `;
      systemPrompt += `Current context: ${context}. `;

      // Aggiungi contesto strutturato al prompt di sistema se disponibile
      if (structuredContext && Object.keys(structuredContext).length > 0) {
        systemPrompt += `\n\nStructured Context Information:\n${JSON.stringify(structuredContext, null, 2)}\n\n`;
      }
      systemPrompt += `Respond in a ${responseStyle} manner, appropriate for a user with ${complexityLevel} understanding. `;
      if (availableActions.length > 0) {
        systemPrompt += `You have the following tools available: ${availableActions.join(", ")}. Only use tools when specifically requested or clearly necessary based on the user's request.`;
      }

      // 2. Filter Messages (exclude system roles)
      const filteredMessages = messages.filter(
        (msg) => msg.role === "user" || msg.role === "assistant"
      );

      // 3. Use streaming service with thinking support if reasoning is enabled
      if (reasoningEnabled && modelToUse.includes("claude")) {
        console.log(
          "[UnifiedAIService] Using streaming service with thinking for Claude model:",
          modelToUse
        );

        const conversationId = `assistant_${Date.now()}`;
        const contextDescription = `${assistantRole} - ${responseStyle} response - ${complexityLevel} level`;

        const streamingResponse = await aiStreamingService.streamMessage(
          filteredMessages,
          modelToUse,
          systemPrompt,
          {
            reasoningEnabled: true,
            conversationId,
            context: contextDescription,
            onThinking: (chunk) => {
              console.log("[UnifiedAIService] Thinking chunk:", chunk);
            },
            onThinkingSummary: (thinking, duration) => {
              console.log("[UnifiedAIService] Thinking summary:", {
                thinking,
                duration,
              });
            },
            onText: (chunk) => {
              console.log("[UnifiedAIService] Text chunk:", chunk);
            },
          }
        );

        // Process the streaming response
        const finalData = {
          content: streamingResponse.content || "(No content)",
          thinking: streamingResponse.thinking,
          thinkingDuration: streamingResponse.thinkingDuration,
          thinkingSteps: streamingResponse.thinkingSteps,
          actions: undefined, // Streaming doesn't handle tool calls yet
          artifacts: undefined,
        };

        const finalResponse: AIResponse<typeof finalData> = {
          rawResponse: JSON.stringify(streamingResponse),
          data: finalData,
          success: streamingResponse.isComplete && !!streamingResponse.content,
          error: streamingResponse.isComplete ? undefined : "Stream incomplete",
          processingTime: Date.now() - startTime,
          model: modelToUse,
          provider: "claude",
          usage: this.extractUsageFromStreamingResponse(streamingResponse),
          metadata: {
            ...metadata,
            thinking: streamingResponse.thinking,
            thinkingDuration: streamingResponse.thinkingDuration,
            thinkingSessionId: streamingResponse.thinkingSessionId,
          },
        };

        // Cache the successful response
        if (cacheKey) {
          aiCache.set(cacheKey, finalResponse);
        }

        return finalResponse;
      }

      // 4. Fallback to openaiService for non-thinking or non-Claude models
      console.log(
        "[UnifiedAIService] Using openaiService.sendMessage for model:",
        modelToUse
      );
      const response: any = await openAIService.sendMessage(
        filteredMessages, // 1st arg: messages array
        systemPrompt, // 2nd arg: system prompt string
        availableActions // 3rd arg: available actions string array
      );
      console.log(
        "[UnifiedAIService] Received response from openaiService:",
        response
      );

      // --- Process OpenAI Response ---
      const processingTime = Date.now() - startTime;
      const success = !response?.error; // Infer success
      const errorMessage = response?.error || response?.message || null;
      const usageData = response?.usage; // Assume usage object exists
      const promptTokens =
        usageData?.promptTokens ??
        usageData?.prompt_tokens ??
        usageData?.input_tokens ??
        0;
      const completionTokens =
        usageData?.completionTokens ??
        usageData?.completion_tokens ??
        usageData?.output_tokens ??
        0;
      const totalTokens =
        usageData?.totalTokens ?? promptTokens + completionTokens;
      const extractedContent =
        response?.data?.content ?? response?.content ?? ""; // Prioritize response.data.content if exists
      const extractedActions = response?.data?.actions; // Check standard location
      const extractedArtifacts = response?.data?.artifacts; // Check standard location

      // --- Analytics Complete (Reverting to 5 args) ---
      aiAnalytics.trackRequestComplete(
        requestId, // string
        processingTime, // number
        success, // boolean
        promptTokens, // number
        completionTokens // number
      );

      // --- Construct Final AIResponse ---
      if (success) {
        const finalData = {
          content: extractedContent || "(No content)",
          actions: extractedActions,
          artifacts: extractedArtifacts,
        };
        const finalResponse: AIResponse<typeof finalData> = {
          rawResponse: JSON.stringify(response),
          data: finalData,
          success: true,
          error: undefined,
          processingTime: processingTime,
          model: modelToUse,
          provider: "openai",
          usage: { promptTokens, completionTokens, totalTokens },
          metadata: { ...metadata, ...(response?.metadata || {}) },
        };
        // Cache the successful response
        if (cacheKey) {
          aiCache.set(cacheKey, finalResponse);
          console.log(
            "UnifiedAIService (getAssistantCompletion): Cached new response for key:",
            cacheKey
          );
        }
        return finalResponse;
      } else {
        throw new Error(
          errorMessage || "openaiService.sendMessage returned an error"
        );
      }
    } catch (error) {
      // --- Error Handling ---
      const processingTime = Date.now() - startTime;
      console.error("Error in getAssistantCompletion:", error);
      // --- Analytics Complete (Error - Reverting to 5 args) ---
      aiAnalytics.trackRequestComplete(requestId, processingTime, false, 0, 0);
      // --- Analytics Event Error (Restoring full object) ---
      aiAnalytics.trackEvent({
        eventType: "error",
        eventName: "assistant_completion_error",
        errorType: error instanceof Error ? error.name : "unknown",
        success: false,
        duration: processingTime, // Add duration back?
        metadata: {
          requestId,
          message: error instanceof Error ? error.message : "Unknown error",
        },
      });
      const errorResponse: AIResponse<any> = {
        rawResponse: null,
        data: null,
        error: error instanceof Error ? error.message : "Unknown error",
        success: false,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        metadata: metadata,
      };
      return errorResponse;
    }
  }

  // =======================================================================================
  // SISTEMA AUTONOMO - Metodi per elaborazione autonoma e continuativa
  // =======================================================================================

  /**
   * Avvia una sessione di elaborazione autonoma
   * L'AI continuerà a migliorare la risposta finché non raggiunge la qualità desiderata
   */
  async startAutonomousSession(
    request: string,
    context: CADContext = {},
    preferences: Partial<AutonomousPreferences> = {},
    onUpdate?: (update: SessionUpdate) => void,
    // Add AI model parameters
    aiModelConfig?: {
      model?: AIModelType;
      temperature?: number;
      maxTokens?: number;
    }
  ): Promise<AutonomousSession> {
    console.log(
      `🚀 [UnifiedAIService] Starting autonomous session for: "${request.substring(0, 100)}..."`
    );

    // Crea il servizio di chiamata AI che usa questo servizio unificato
    const aiServiceCall: AutonomousServiceCall = async (
      prompt: string,
      cadContext?: CADContext
    ) => {
      // Usa il metodo processMessage con contesto CAD autonomo
      const response = await this.processRequest<string>({
        prompt,
        systemPrompt: this.buildAutonomousSystemPrompt(cadContext),
        model: aiModelConfig?.model || (this.defaultModel as AIModelType),
        temperature: aiModelConfig?.temperature || 0.7,
        maxTokens: aiModelConfig?.maxTokens || this.defaultMaxTokens,
        parseResponse: (text) => Promise.resolve(text),
        metadata: {
          type: "autonomous_iteration",
          sessionId: "pending", // Sarà aggiornato dal orchestratore
          context: cadContext,
        },
        useMCP: this.mcpEnabled,
      });

      if (!response.success || !response.rawResponse) {
        throw new Error(response.error || "No response from AI");
      }

      return response.rawResponse;
    };

    // Avvia la sessione tramite l'orchestratore
    return this.autonomousOrchestrator.startAutonomousSession(
      request,
      context,
      aiServiceCall,
      preferences,
      onUpdate
    );
  }

  /**
   * Interrompe una sessione autonoma in corso
   */
  interruptAutonomousSession(sessionId: string): boolean {
    return this.autonomousOrchestrator.interruptAutonomousSession(sessionId);
  }

  /**
   * Ottiene lo stato corrente di una sessione autonoma
   */
  getAutonomousSessionState(sessionId: string): AutonomousSession | null {
    return this.autonomousOrchestrator.getSessionState(sessionId);
  }

  /**
   * Ottiene tutte le sessioni autonome attive
   */
  getActiveAutonomousSessions(): AutonomousSession[] {
    return this.autonomousOrchestrator.getActiveSessions();
  }

  /**
   * Ottiene le statistiche del sistema autonomo
   */
  getAutonomousStats(): any {
    return this.autonomousOrchestrator.getOrchestratorStats();
  }

  /**
   * Pulisce le sessioni autonome completate
   */
  cleanupAutonomousSessions(): number {
    return this.autonomousOrchestrator.cleanupCompletedSessions();
  }

  /**
   * Genera un report finale da una sessione autonoma
   */
  generateAutonomousReport(session: AutonomousSession): ProgressReport {
    const engineClass =
      require("./autonomous/autonomousEngine").AutonomousEngine;
    const engine = new engineClass();
    return engine.generateProgressReport(session);
  }

  /**
   * Costruisce il prompt di sistema per le sessioni autonome
   */
  private buildAutonomousSystemPrompt(context?: CADContext): string {
    let prompt = `You are an advanced AI assistant operating in autonomous mode for a CAD/CAM application.

`;

    prompt += `Your task is to iteratively improve your responses until they meet high quality standards.
`;
    prompt += `After each response, analyze what could be improved and continue refining.

`;

    if (context) {
      prompt += `Current CAD Context:\n`;
      if (context.elements && context.elements.length > 0) {
        prompt += `- ${context.elements.length} CAD elements in the project\n`;
      }
      if (context.projectName) {
        prompt += `- Project: ${context.projectName}\n`;
      }
      if (context.elements) {
        prompt += `- ${context.elements[0]}CAD elements in the project\n`;
      }

      prompt += `\n`;
    }

    prompt += `Guidelines for autonomous operation:\n`;
    prompt += `1. Start with a complete response to the user's request\n`;
    prompt += `2. Self-evaluate your response for completeness, accuracy, and quality\n`;
    prompt += `3. If improvements are needed, explain what you're improving and provide the enhanced version\n`;
    prompt += `4. Continue until the response is optimal or you've reached a satisfactory result\n`;
    prompt += `5. Be concise in your improvements - focus on substance over repetition\n`;

    return prompt;
  }

  /**
   * Test del sistema autonomo
   */

  /**
   * Processa una richiesta con continuità autonoma opzionale
   * Wrapper convenience per integrare facilmente il sistema autonomo
   */
  async processWithAutonomy<T>({
    prompt,
    enableAutonomy = false,
    autonomousPreferences,
    onAutonomousUpdate,
    ...standardRequestParams
  }: AIRequest & {
    enableAutonomy?: boolean;
    autonomousPreferences?: Partial<AutonomousPreferences>;
    onAutonomousUpdate?: (update: SessionUpdate) => void;
  }): Promise<AIResponse<T> & { autonomousSession?: AutonomousSession }> {
    if (!enableAutonomy) {
      // Processa normalmente senza autonomia
      return this.processRequest<T>({ prompt, ...standardRequestParams });
    }

    // Avvia sessione autonoma
    const session = await this.startAutonomousSession(
      prompt,
      {
        /* contesto CAD se disponibile */
      },
      autonomousPreferences, // Pass preferences directly
      onAutonomousUpdate,
      // Pass AI model config separately
      {
        model: standardRequestParams.model || this.defaultModel,
        temperature: standardRequestParams.temperature,
        maxTokens: standardRequestParams.maxTokens,
      }
    );

    // Attendi il completamento o timeout
    const maxWaitTime = 60000; // 1 minuto
    const startTime = Date.now();

    while (session.isActive && Date.now() - startTime < maxWaitTime) {
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Aggiorna lo stato della sessione
      const currentState = this.getAutonomousSessionState(session.id);
      if (currentState) {
        Object.assign(session, currentState);
      }
    }

    // Prepara la risposta finale
    const finalIteration = session.iterations[session.iterations.length - 1];
    const finalReport =
      session.finalReport || this.generateAutonomousReport(session);

    let parsedData: T | null = null;
    if (standardRequestParams.parseResponse && finalIteration?.output) {
      try {
        parsedData = await standardRequestParams.parseResponse(
          finalIteration.output
        );
      } catch (err) {
        console.error("Failed to parse autonomous result:", err);
      }
    }

    return {
      rawResponse: finalIteration?.output || null,
      data: parsedData,
      success: finalReport.summary === "success",
      error:
        finalReport.summary === "failure"
          ? "Autonomous processing failed"
          : undefined,
      processingTime: session.endTime
        ? session.endTime.getTime() - session.startTime.getTime()
        : 0,
      model:
        session.context.userPreferences?.model ||
        (this.defaultModel as AIModelType),
      usage: {
        promptTokens: session.context.userPreferences?.maxTokens || 0,
        completionTokens: 0,
        totalTokens: session.context.userPreferences?.maxTokens || 0,
      },
      metadata: {
        autonomous: true,
        iterations: session.iterations.length,
        finalQuality: finalReport.finalQualityScore,
      },
      autonomousSession: session,
    };
  }

  /**
   * Executes a chain of CAD actions with intelligent orchestration
   * Supports conditional logic, rollback, and multi-element operations
   */
  async executeActionChain({
    chainId,
    steps,
    rollbackOnFailure = true,
    context = {},
    onStepComplete,
    onChainComplete,
  }: {
    chainId: string;
    steps: Array<{
      stepId: string;
      action: string;
      payload: any;
      condition?: {
        type: string;
        target: string;
        operator: string;
        value: any;
      };
      onSuccess?: string[];
      onFailure?: string[];
    }>;
    rollbackOnFailure?: boolean;
    context?: Record<string, any>;
    onStepComplete?: (stepId: string, success: boolean, result?: any) => void;
    onChainComplete?: (
      chainId: string,
      success: boolean,
      results: any[]
    ) => void;
  }): Promise<{
    success: boolean;
    results: any[];
    rollbackActions?: any[];
    errorStep?: string;
    error?: string;
  }> {
    console.log(
      `🔗 [UnifiedAIService] Starting action chain: ${chainId} with ${steps.length} steps`
    );

    const executedSteps: Array<{
      stepId: string;
      action: string;
      payload: any;
      result: any;
    }> = [];
    const results: any[] = [];
    let rollbackActions: any[] = [];

    try {
      // Execute steps in sequence
      for (const step of steps) {
        console.log(
          `⚡ [UnifiedAIService] Executing step: ${step.stepId} (${step.action})`
        );

        // Check condition if present
        if (
          step.condition &&
          !this.evaluateCondition(step.condition, context)
        ) {
          console.log(
            `⏭️ [UnifiedAIService] Skipping step ${step.stepId} - condition not met`
          );
          continue;
        }

        // Execute the action
        try {
          const result = await this.executeChainAction(
            step.action,
            step.payload,
            context
          );

          // Store the result and track for rollback
          results.push(result);
          executedSteps.push({
            stepId: step.stepId,
            action: step.action,
            payload: step.payload,
            result,
          });

          // Add rollback action if needed
          if (rollbackOnFailure) {
            const rollbackAction = this.createRollbackAction(
              step.action,
              step.payload,
              result
            );
            if (rollbackAction) {
              rollbackActions.unshift(rollbackAction); // Add to beginning for reverse order
            }
          }

          // Notify step completion
          if (onStepComplete) {
            onStepComplete(step.stepId, true, result);
          }

          console.log(
            `✅ [UnifiedAIService] Step ${step.stepId} completed successfully`
          );

          // Execute success actions if any
          if (step.onSuccess && step.onSuccess.length > 0) {
            const successSteps = steps.filter((s) =>
              step.onSuccess!.includes(s.stepId)
            );
            if (successSteps.length > 0) {
              console.log(
                `🎯 [UnifiedAIService] Executing ${successSteps.length} success actions for step ${step.stepId}`
              );
              const successResult = await this.executeActionChain({
                chainId: `${chainId}_success_${step.stepId}`,
                steps: successSteps,
                rollbackOnFailure,
                context,
                onStepComplete,
                onChainComplete,
              });
              results.push(...successResult.results);
            }
          }
        } catch (stepError) {
          console.error(
            `❌ [UnifiedAIService] Step ${step.stepId} failed:`,
            stepError
          );

          // Notify step failure
          if (onStepComplete) {
            onStepComplete(step.stepId, false, stepError);
          }

          // Execute failure actions if any
          if (step.onFailure && step.onFailure.length > 0) {
            const failureSteps = steps.filter((s) =>
              step.onFailure!.includes(s.stepId)
            );
            if (failureSteps.length > 0) {
              console.log(
                `🔧 [UnifiedAIService] Executing ${failureSteps.length} failure actions for step ${step.stepId}`
              );
              try {
                const failureResult = await this.executeActionChain({
                  chainId: `${chainId}_failure_${step.stepId}`,
                  steps: failureSteps,
                  rollbackOnFailure: false, // Don't cascade rollbacks
                  context,
                  onStepComplete,
                  onChainComplete,
                });
                results.push(...failureResult.results);
              } catch (failureActionError) {
                console.error(
                  `❌ [UnifiedAIService] Failure action failed:`,
                  failureActionError
                );
              }
            }
          }

          // If rollback is enabled, execute all rollback actions
          if (rollbackOnFailure && rollbackActions.length > 0) {
            console.log(
              `🔄 [UnifiedAIService] Rolling back ${rollbackActions.length} actions`
            );
            await this.executeRollbackActions(rollbackActions);
          }

          const finalResult = {
            success: false,
            results,
            rollbackActions: rollbackOnFailure ? rollbackActions : undefined,
            errorStep: step.stepId,
            error:
              stepError instanceof Error ? stepError.message : "Unknown error",
          };

          if (onChainComplete) {
            onChainComplete(chainId, false, results);
          }

          return finalResult;
        }
      }

      // All steps completed successfully
      console.log(
        `🎉 [UnifiedAIService] Action chain ${chainId} completed successfully`
      );

      if (onChainComplete) {
        onChainComplete(chainId, true, results);
      }

      return {
        success: true,
        results,
        rollbackActions: rollbackOnFailure ? rollbackActions : undefined,
      };
    } catch (chainError) {
      console.error(
        `💥 [UnifiedAIService] Action chain ${chainId} failed:`,
        chainError
      );

      // Execute rollback if enabled
      if (rollbackOnFailure && rollbackActions.length > 0) {
        console.log(
          `🔄 [UnifiedAIService] Rolling back ${rollbackActions.length} actions due to chain failure`
        );
        await this.executeRollbackActions(rollbackActions);
      }

      if (onChainComplete) {
        onChainComplete(chainId, false, results);
      }

      return {
        success: false,
        results,
        rollbackActions: rollbackOnFailure ? rollbackActions : undefined,
        error:
          chainError instanceof Error
            ? chainError.message
            : "Unknown chain error",
      };
    }
  }

  /**
   * Evaluates a condition for action chain step execution
   */
  private evaluateCondition(
    condition: any,
    context: Record<string, any>
  ): boolean {
    try {
      const { type, target, operator, value } = condition;

      let targetValue: any;

      switch (type) {
        case "element_exists":
          targetValue =
            context.elements?.some((el: any) => el.id === target) || false;
          break;
        case "element_count":
          targetValue = context.elements?.length || 0;
          break;
        case "property_value":
          // Extract nested property value
          targetValue = this.getNestedProperty(context, target);
          break;
        default:
          console.warn(`Unknown condition type: ${type}`);
          return false;
      }

      // Evaluate the condition
      switch (operator) {
        case "equals":
          return targetValue === value;
        case "not_equals":
          return targetValue !== value;
        case "greater_than":
          return Number(targetValue) > Number(value);
        case "less_than":
          return Number(targetValue) < Number(value);
        case "contains":
          return String(targetValue).includes(String(value));
        default:
          console.warn(`Unknown operator: ${operator}`);
          return false;
      }
    } catch (error) {
      console.error("Error evaluating condition:", error);
      return false;
    }
  }

  /**
   * Executes a single action in the chain
   */
  private async executeChainAction(
    action: string,
    payload: any,
    context: Record<string, any>
  ): Promise<any> {
    switch (action) {
      case "generateCADElement":
        return this.textToCADElements({
          description: payload.description || "",
          constraints: payload.constraints,
          style: payload.style || "precise",
          complexity: payload.complexity || "moderate",
          context: payload.context || [],
        });

      case "updateCADElement":
      case "updateMultipleCADElements":
        // Use the multi-element version for both single and multiple updates
        const updateOperations =
          action === "updateCADElement"
            ? [{ id: payload.id, properties: payload.properties }]
            : payload.operations || [];

        return {
          action: "updateMultipleCADElements",
          operations: updateOperations,
          success: true,
        };

      case "removeCADElement":
      case "removeMultipleCADElements":
        // Use the multi-element version for both single and multiple removals
        const elementIds =
          action === "removeCADElement"
            ? [payload.id]
            : payload.elementIds || [];

        return {
          action: "removeMultipleCADElements",
          elementIds,
          success: true,
        };

      case "groupCADElements":
        return {
          action: "groupCADElements",
          groupName: payload.groupName,
          elementIds: payload.elementIds,
          groupType: payload.groupType || "collection",
          success: true,
        };

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  /**
   * Creates a rollback action for a given step
   */
  private createRollbackAction(
    action: string,
    originalPayload: any,
    result: any
  ): any | null {
    switch (action) {
      case "generateCADElement":
        // Rollback: remove the generated elements
        if (result?.data && Array.isArray(result.data)) {
          return {
            action: "removeMultipleCADElements",
            payload: {
              elementIds: result.data.map((el: any) => el.id).filter(Boolean),
            },
          };
        }
        break;

      case "updateCADElement":
      case "updateMultipleCADElements":
        // Rollback: restore original properties (would need to be stored)
        // For now, just log that rollback is not fully implemented
        console.warn(
          "Update rollback not fully implemented - original properties needed"
        );
        return null;

      case "removeCADElement":
      case "removeMultipleCADElements":
        // Rollback: restore the removed elements (would need original data)
        console.warn(
          "Remove rollback not fully implemented - original element data needed"
        );
        return null;

      case "groupCADElements":
        // Rollback: ungroup the elements
        return {
          action: "ungroupCADElements",
          payload: {
            groupId: result?.groupId,
          },
        };

      default:
        return null;
    }
  }

  /**
   * Executes rollback actions in reverse order
   */
  private async executeRollbackActions(rollbackActions: any[]): Promise<void> {
    for (const rollbackAction of rollbackActions) {
      try {
        console.log(
          `🔄 [UnifiedAIService] Executing rollback: ${rollbackAction.action}`
        );
        await this.executeChainAction(
          rollbackAction.action,
          rollbackAction.payload,
          {}
        );
      } catch (rollbackError) {
        console.error("Rollback action failed:", rollbackError);
      }
    }
  }

  /**
   * Helper to get nested property value from object
   */
  private getNestedProperty(obj: any, path: string): any {
    return path.split(".").reduce((current, key) => current?.[key], obj);
  }

  // NUOVO: Helper methods per Vision Analysis

  /**
   * Estrae il testo da un messaggio che può avere contenuto complesso
   */
  private extractTextFromMessage(message: AIMessage): string {
    if (typeof message.content === "string") {
      return message.content;
    }

    if (Array.isArray(message.content)) {
      return message.content
        .filter((block) => block.type === "text")
        .map((block) => (block as any).text)
        .join(" ");
    }

    return "";
  }

  /**
   * Estrae le immagini da un messaggio con contenuto complesso
   */
  private extractImagesFromMessage(message: AIMessage): any[] {
    if (!Array.isArray(message.content)) {
      return [];
    }

    return message.content
      .filter((block) => block.type === "image_url")
      .map((block, index) => ({
        url: (block as any).image_url?.url || "",
        name: `image_${index + 1}`,
        type: "image",
      }));
  }

  /**
   * Determina se un messaggio è una richiesta di analisi immagini
   */
  private isImageAnalysisRequest(
    text: string,
    availableActions: string[]
  ): boolean {
    if (availableActions.includes("imageAnalysis")) {
      return true; // Se l'azione è disponibile, probabilmente è richiesta
    }

    const lowerText = text.toLowerCase();
    const analysisKeywords = [
      "analizza",
      "analyze",
      "esamina",
      "examine",
      "misura",
      "measure",
      "dimensio",
      "dimension",
      "identifica",
      "identify",
      "riconosci",
      "recognize",
      "descrivi",
      "describe",
      "cosa vedi",
      "what do you see",
      "che cosa",
      "what is",
      "manufacturing",
      "design",
    ];

    return analysisKeywords.some((keyword) => lowerText.includes(keyword));
  }

  /**
   * Inferisce il tipo di analisi dal contesto e dal testo
   */
  private inferAnalysisTypeFromContext(
    context: string,
    text: string,
    availableActions: string[]
  ): any {
    const combinedText = (context + " " + text).toLowerCase();

    if (
      combinedText.includes("misura") ||
      combinedText.includes("dimensio") ||
      combinedText.includes("measure")
    ) {
      return "measurement";
    }
    if (
      combinedText.includes("produzione") ||
      combinedText.includes("fabbrica") ||
      combinedText.includes("manufactur")
    ) {
      return "manufacturing";
    }
    if (
      combinedText.includes("design") ||
      combinedText.includes("progett") ||
      combinedText.includes("model")
    ) {
      return "design";
    }
    return "general";
  }

  /**
   * Estrae il nome del progetto dal contesto
   */
  private extractProjectNameFromContext(context: string): string | undefined {
    const projectMatch = context.match(/project[:\s]+([^\n,]+)/i);
    return projectMatch ? projectMatch[1].trim() : undefined;
  }

  /**
   * Estrae informazioni sui token dal response di streaming
   */
  private extractUsageFromStreamingResponse(streamingResponse: any): {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  } {
    // Default values
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;

    try {
      // Check if usage information is available in the streaming response
      if (streamingResponse?.usage) {
        const usage = streamingResponse.usage;
        promptTokens =
          usage.promptTokens || usage.prompt_tokens || usage.input_tokens || 0;
        completionTokens =
          usage.completionTokens ||
          usage.completion_tokens ||
          usage.output_tokens ||
          0;
        totalTokens =
          usage.totalTokens ||
          usage.total_tokens ||
          promptTokens + completionTokens;
      }

      // Check metadata for usage information
      if (streamingResponse?.metadata?.usage) {
        const metaUsage = streamingResponse.metadata.usage;
        promptTokens =
          metaUsage.promptTokens ||
          metaUsage.prompt_tokens ||
          metaUsage.input_tokens ||
          promptTokens;
        completionTokens =
          metaUsage.completionTokens ||
          metaUsage.completion_tokens ||
          metaUsage.output_tokens ||
          completionTokens;
        totalTokens =
          metaUsage.totalTokens ||
          metaUsage.total_tokens ||
          promptTokens + completionTokens;
      }

      // Check if anthropic/claude specific usage data exists
      if (streamingResponse?.anthropic_usage) {
        const anthropicUsage = streamingResponse.anthropic_usage;
        promptTokens = anthropicUsage.input_tokens || promptTokens;
        completionTokens = anthropicUsage.output_tokens || completionTokens;
        totalTokens = promptTokens + completionTokens || totalTokens;
      }

      // Estimate from content length if no usage data available
      if (totalTokens === 0 && streamingResponse?.content) {
        const contentLength = streamingResponse.content.length;
        // Rough estimation: ~4 characters per token
        const estimatedTokens = Math.ceil(contentLength / 4);
        completionTokens = estimatedTokens;
        totalTokens = estimatedTokens; // Without prompt context, we can only estimate completion tokens

        console.log(
          `📊 [UnifiedAIService] Estimated token usage from content length: ${estimatedTokens} tokens`
        );
      }

      // Validate and sanitize values
      promptTokens = Math.max(0, Math.floor(promptTokens));
      completionTokens = Math.max(0, Math.floor(completionTokens));
      totalTokens = Math.max(0, Math.floor(totalTokens));

      // Ensure totalTokens is at least the sum of prompt and completion tokens
      if (totalTokens < promptTokens + completionTokens) {
        totalTokens = promptTokens + completionTokens;
      }

      console.log(
        `📊 [UnifiedAIService] Extracted token usage: prompt=${promptTokens}, completion=${completionTokens}, total=${totalTokens}`
      );
    } catch (error) {
      console.warn(
        `⚠️ [UnifiedAIService] Failed to extract token usage from streaming response:`,
        error
      );
      // Return safe defaults on error
      return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    }

    return {
      promptTokens,
      completionTokens,
      totalTokens,
    };
  }
}

// Esporta un'istanza singleton
export const unifiedAIService = new UnifiedAIService();
