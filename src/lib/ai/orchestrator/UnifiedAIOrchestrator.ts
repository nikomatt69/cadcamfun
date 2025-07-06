import { Element } from "@/src/store/elementsStore";
import {
  AIModelType,
  AIAction,
  AIMessage,
  ResponseStyle,
  ComplexityLevel,
  AssistantRole,
  TextToCADRequest,
  AIDesignSuggestion
} from "@/src/types/AITypes";

// Import tutti i servizi esistenti
import { textToCADStreamService } from "../textToCADStreamService";
import { unifiedAIService } from "../unifiedAIService";
import { unifiedAIService as camService } from "../unifiedAIServiceCAM";
import { openAIService } from "../openaiService";
import { contextAwareGenerationService } from "../ContextAwareGenerationService";
import { continuousCADAgent } from "../generation/progressiveGeneratorService";
import { aiActionService } from "../aiActionService";

// Context Analysis
import { ContextAnalyzer } from "./context/ContextAnalyzer";
import { ServiceRouter, ServiceStrategy } from "./routing/ServiceRouter";
import { IntentDetector } from "./intent/IntentDetector";
import { ResponseAggregator } from "./response/ResponseAggregator";

// Context Providers
import { PageContextProvider } from "./context/providers/PageContextProvider";
import { ElementsContextProvider } from "./context/providers/ElementsContextProvider";
import { GCodeContextProvider } from "./context/providers/GCodeContextProvider";
import { UserContextProvider } from "./context/providers/UserContextProvider";

// Smart Assistant
import { ContextualPromptBuilder, BuiltPrompt } from "./assistant/ContextualPromptBuilder";
import { ToolSelector } from "./assistant/ToolSelector";
import { ResponseEnhancer } from "./assistant/ResponseEnhancer";
import openAiGCodeService from "@/src/services/openAiGCodeService";
interface ForceToolChoice {
  type: "function";
  function: { name: string };
}
export interface ApplicationContext {
  // Contesto della pagina corrente
  page: {
    route: string;
    section: "cad" | "cam" | "gcode" | "materials" | "tools" | "projects" | "settings";
    mode: "design" | "analysis" | "manufacturing" | "simulation";
    activePanel?: string;
  };

  // Contesto degli elementi
  elements: {
    selected: Element[];
    visible: Element[];
    total: Element[];
    types: Record<string, number>;
    boundingBox?: {
      min: { x: number; y: number; z: number };
      max: { x: number; y: number; z: number };
    };
  };

  // Contesto G-Code (se applicabile)
  gcode?: {
    content: string;
    fileName: string;
    lines: number;
    errors: string[];
    warnings: string[];
    selectedLines?: { start: number; end: number };
  };

  // Contesto utente
  user: {
    recentActions: UserAction[];
    preferences: UserPreferences;
    skillLevel: "beginner" | "intermediate" | "advanced" | "expert";
    workingStyle: "explorative" | "systematic" | "efficiency-focused";
  };

  // Stato viewport/interfaccia
  viewport: {
    camera: { x: number; y: number; z: number; zoom: number };
    view: "iso" | "front" | "top" | "side" | "custom";
    grid: boolean;
    units: "mm" | "cm" | "in";
  };

  // Cronologia sessione
  session: {
    startTime: Date;
    totalActions: number;
    successfulOperations: number;
    lastAIInteraction?: Date;
    currentGoal?: string;
  };
}

export interface UserAction {
  timestamp: Date;
  type: "create" | "modify" | "delete" | "analyze" | "optimize" | "export" | "ai_query";
  target: string;
  success: boolean;
  context: Record<string, any>;
}

export interface UserPreferences {
  preferredModel: AIModelType;
  responseStyle: ResponseStyle;
  complexityLevel: ComplexityLevel;
  language: "en" | "it" | "es" | "fr";
  autoSuggestions: boolean;
  contextSensitivity: "high" | "medium" | "low";
}

export interface IntentAnalysis {
  primaryIntent: "create" | "modify" | "analyze" | "optimize" | "export" | "learn" | "chat" | "generate";
  confidence: number;
  targetElements?: string[];
  requiredServices: ServiceType[];
  contextDependency: "critical" | "high" | "medium" | "low";
  suggestedActions: AIAction[];
  estimatedComplexity: "simple" | "moderate" | "complex";
  timeToComplete?: number; // in seconds
}

export type ServiceType =
  | "textToCADStream"
  | "unifiedAI"
  | "unifiedCAM"
  | "openAI"
  | "contextAware"
  | "progressive"
  | "actionService"
  | "gcodeService";

export interface ServiceCapabilities {
  type: ServiceType;
  supports: {
    streaming: boolean;
    images: boolean;
    cad: boolean;
    cam: boolean;
    gcode: boolean;
    analysis: boolean;
    generation: boolean;
    optimization: boolean;
  };
  optimalFor: string[];
  averageResponseTime: number;
  reliability: number; // 0-1
}

export interface OrchestratorResponse {
  success: boolean;
  content: string;
  actions?: AIAction[];
  artifacts?: ResponseArtifact[];
  suggestions?: string[];
  context?: ApplicationContext;
  metadata: {
    servicesUsed: ServiceType[];
    processingTimeMs: number;
    confidenceScore: number;
    contextRelevance: number;
    fallbackUsed: boolean;
    [key: string]: any; // Allow additional metadata like qualityScore
  };
  error?: string;
}

export interface ResponseArtifact {
  id: string;
  type: "elements" | "gcode" | "analysis" | "documentation" | "preview" | "file";
  content: any;
  title: string;
  description: string;
  actions?: string[];
  [key: string]: any; // Allow additional metadata like metadata.contextRelevance
}

export class UnifiedAIOrchestrator {
  private contextAnalyzer: ContextAnalyzer;
  private serviceRouter: ServiceRouter;
  private intentDetector: IntentDetector;
  private responseAggregator: ResponseAggregator;

  // Context Providers
  private pageContext: PageContextProvider;
  private elementsContext: ElementsContextProvider;
  private gcodeContext: GCodeContextProvider;
  private userContext: UserContextProvider;

  // Assistant Components
  private promptBuilder: ContextualPromptBuilder;
  private toolSelector: ToolSelector;
  private responseEnhancer: ResponseEnhancer;

  // Service Registry
  private serviceRegistry: Map<ServiceType, ServiceCapabilities>;
  private currentContext: ApplicationContext | null = null;

  constructor() {
    this.contextAnalyzer = new ContextAnalyzer();
    this.serviceRouter = new ServiceRouter();
    this.intentDetector = new IntentDetector();
    this.responseAggregator = new ResponseAggregator();

    this.pageContext = new PageContextProvider();
    this.elementsContext = new ElementsContextProvider();
    this.gcodeContext = new GCodeContextProvider();
    this.userContext = new UserContextProvider();

    this.promptBuilder = new ContextualPromptBuilder();
    this.toolSelector = new ToolSelector();
    this.responseEnhancer = new ResponseEnhancer();

    this.serviceRegistry = new Map(); // Initialize serviceRegistry before calling registerServices
    this.registerServices();
    this.setupContextMonitoring();
  }

  /**
   * Main entry point - intelligently processes user requests
   */
  async processRequest(
    userInput: string,
    currentContext?: Partial<ApplicationContext>,
    options?: {
      forceService?: ServiceType;
      streaming?: boolean;
      includeContext?: boolean;
    }
  ): Promise<OrchestratorResponse> {
    const startTime = performance.now();

    try {
      // 1. Update and analyze current context
      const fullContext = await this.updateApplicationContext(currentContext);

      // 2. Detect user intent with context awareness
      const intentAnalysis = await this.intentDetector.analyzeIntent(userInput, fullContext, options);

      // 3. Select optimal service(s) for the request
      const serviceStrategy = await this.serviceRouter.determineStrategy(
        intentAnalysis,
        fullContext,
        options?.forceService
      );

      // 4. Build contextual prompt
      const builtPromptObject = await this.promptBuilder.buildPrompt(userInput, fullContext, intentAnalysis);

      // 5. Select appropriate tools
      const tools = await this.toolSelector.selectTools(intentAnalysis, fullContext);

      // 6. Execute request through optimal service(s)
      const preliminaryResponse = await this.executeServiceStrategy(
        serviceStrategy,
        builtPromptObject,
        tools,
        intentAnalysis,
        fullContext,
        options
      );

      // 7. Enhance and aggregate response
      const enhancedResponse = await this.responseEnhancer.enhanceResponse(
        preliminaryResponse,
        fullContext,
        intentAnalysis
      );

      // 8. Update context with results
      await this.updateContextWithResults(enhancedResponse);

      return {
        ...enhancedResponse,
        metadata: {
          ...enhancedResponse.metadata,
          processingTimeMs: performance.now() - startTime,
          contextRelevance: this.calculateContextRelevance(intentAnalysis, fullContext)
        }
      };
    } catch (error) {
      console.error("Orchestrator error:", error);
      return this.handleError(error, userInput, startTime);
    }
  }

  /**
   * Register all available services with their capabilities
   */
  private registerServices(): void {
    this.serviceRegistry.set("textToCADStream", {
      type: "textToCADStream",
      supports: {
        streaming: true,
        images: false,
        cad: true,
        cam: false,
        gcode: false,
        analysis: false,
        generation: true,
        optimization: false
      },
      optimalFor: ["progressive_cad_creation", "streaming_generation"],
      averageResponseTime: 15000,
      reliability: 0.85
    });

    this.serviceRegistry.set("unifiedAI", {
      type: "unifiedAI",
      supports: {
        streaming: false,
        images: false,
        cad: true,
        cam: true,
        gcode: true,
        analysis: true,
        generation: true,
        optimization: true
      },
      optimalFor: ["general_ai", "design_analysis", "optimization"],
      averageResponseTime: 8000,
      reliability: 0.92
    });

    this.serviceRegistry.set("unifiedCAM", {
      type: "unifiedCAM",
      supports: {
        streaming: false,
        images: false,
        cad: false,
        cam: true,
        gcode: true,
        analysis: true,
        generation: true,
        optimization: true
      },
      optimalFor: ["cam_specific_tasks", "toolpath_optimization", "gcode_analysis_cam"],
      averageResponseTime: 9000,
      reliability: 0.9
    });

    this.serviceRegistry.set("openAI", {
      type: "openAI",
      supports: {
        streaming: false,
        images: true,
        cad: true,
        cam: false,
        gcode: false,
        analysis: true,
        generation: true,
        optimization: false
      },
      optimalFor: ["multimodal_input", "tool_calling", "complex_reasoning"],
      averageResponseTime: 6000,
      reliability: 0.88
    });

    this.serviceRegistry.set("contextAware", {
      type: "contextAware",
      supports: {
        streaming: false,
        images: false,
        cad: true,
        cam: false,
        gcode: false,
        analysis: true,
        generation: true,
        optimization: false
      },
      optimalFor: ["contextual_generation", "element_relationships"],
      averageResponseTime: 12000,
      reliability: 0.9
    });

    this.serviceRegistry.set("gcodeService", {
      type: "gcodeService",
      supports: {
        streaming: false,
        images: false,
        cad: false,
        cam: true,
        gcode: true,
        analysis: true,
        generation: true,
        optimization: true
      },
      optimalFor: ["gcode_operations", "cam_programming"],
      averageResponseTime: 10000,
      reliability: 0.87
    });

    this.serviceRegistry.set("actionService", {
      type: "actionService",
      supports: {
        streaming: false,
        images: false,
        cad: true,
        cam: true,
        gcode: true, // Depending on the actions it can handle
        analysis: true,
        generation: true,
        optimization: true
      },
      optimalFor: ["direct_tool_execution", "specific_commands"],
      averageResponseTime: 100, // Assuming actions are quick
      reliability: 0.98
    });

    this.serviceRegistry.set("progressive", {
      // Assuming this maps to continuousCADAgent
      type: "progressive",
      supports: {
        streaming: true,
        images: false,
        cad: true,
        cam: true,
        gcode: true,
        analysis: true,
        generation: true,
        optimization: true
      },
      optimalFor: ["complex_cad_generation", "iterative_design"],
      averageResponseTime: 20000, // Can be long
      reliability: 0.85
    });
  }

  /**
   * Setup context monitoring for automatic updates
   */
  private setupContextMonitoring(): void {
    // Monitor route changes
    if (typeof window !== "undefined") {
      window.addEventListener("popstate", () => {
        this.pageContext.updateFromBrowser();
      });

      // Monitor element changes
      setInterval(() => {
        this.elementsContext.checkForUpdates();
      }, 1000);

      // Monitor user activity
      ["click", "keydown", "scroll"].forEach(event => {
        document.addEventListener(event, () => {
          this.userContext.recordActivity(event);
        });
      });
    }
  }

  /**
   * Update application context from various sources
   */
  private async updateApplicationContext(providedContext?: Partial<ApplicationContext>): Promise<ApplicationContext> {
    const context: ApplicationContext = {
      page: await this.pageContext.getCurrentPageContext(),
      elements: await this.elementsContext.getElementsContext(),
      user: await this.userContext.getUserContext(),
      viewport: await this.pageContext.getViewportState(),
      session: await this.userContext.getSessionContext(),
      ...providedContext
    };

    // Add G-Code context if applicable
    if (context.page.section === "gcode" || context.page.section === "cam") {
      context.gcode = await this.gcodeContext.getGCodeContext();
    }

    this.currentContext = context;
    return context;
  }

  /**
   * Execute service strategy
   */
  private async executeServiceStrategy(
    strategy: ServiceStrategy,
    builtPrompt: BuiltPrompt,
    tools: string[],
    intentAnalysis: IntentAnalysis,
    fullContext: ApplicationContext,
    options?: {
      streaming?: boolean;
      includeContext?: boolean;
    }
  ): Promise<OrchestratorResponse> {
    const { primaryService, fallbackServices, parameters } = strategy;
    const { systemPrompt, userPrompt } = builtPrompt;

    try {
      // Try primary service first
      const serviceCallResponse = await this.callService(primaryService, {
        systemPrompt,
        userPrompt,
        tools,
        intentAnalysis,
        fullContext,
        ...parameters,
        ...options
      });

      return {
        success: true,
        content:
          serviceCallResponse.content ||
          serviceCallResponse.rawResponse ||
          (typeof serviceCallResponse.data === "string" ? serviceCallResponse.data : "") ||
          "",
        actions:
          serviceCallResponse.actions ||
          (intentAnalysis.suggestedActions.length > 0 ? intentAnalysis.suggestedActions : []),
        artifacts: serviceCallResponse.artifacts || [],
        suggestions: serviceCallResponse.suggestions || [],
        metadata: {
          servicesUsed: [primaryService],
          processingTimeMs: 0, // Will be set by the main processRequest method
          confidenceScore: serviceCallResponse.confidenceScore || strategy.confidence,
          contextRelevance: 0, // Will be set by the main processRequest method
          fallbackUsed: false
        },
        error: serviceCallResponse.error
      };
    } catch (error) {
      console.warn(`Primary service ${primaryService} failed:`, error);

      // Try fallback services
      for (const fallbackService of fallbackServices) {
        try {
          const serviceCallResponse = await this.callService(fallbackService, {
            systemPrompt,
            userPrompt,
            tools,
            intentAnalysis,
            fullContext,
            ...parameters,
            ...options
          });

          return {
            success: true,
            content:
              serviceCallResponse.content ||
              serviceCallResponse.rawResponse ||
              (typeof serviceCallResponse.data === "string" ? serviceCallResponse.data : "") ||
              "",
            actions:
              serviceCallResponse.actions ||
              (intentAnalysis.suggestedActions.length > 0 ? intentAnalysis.suggestedActions : []),
            artifacts: serviceCallResponse.artifacts || [],
            suggestions: serviceCallResponse.suggestions || [],
            metadata: {
              servicesUsed: [primaryService, fallbackService],
              processingTimeMs: 0,
              confidenceScore: (serviceCallResponse.confidenceScore || strategy.confidence) * 0.8, // Lower confidence for fallback
              contextRelevance: 0,
              fallbackUsed: true
            },
            error: serviceCallResponse.error
          };
        } catch (fallbackError) {
          console.warn(`Fallback service ${fallbackService} failed:`, fallbackError);
          continue;
        }
      }

      throw new Error("All services failed");
    }
  }

  /**
   * Call specific service
   */
  private async callService(
    serviceType: ServiceType,
    params: {
      systemPrompt: string;
      userPrompt: string;
      tools: string[];
      intentAnalysis: IntentAnalysis;
      fullContext: ApplicationContext;
      [key: string]: any; // For strategy.parameters and options
    }
  ): Promise<any> {
    // Should return a structure that can be mapped to OrchestratorResponse
    const { intentAnalysis, fullContext, userPrompt, systemPrompt, tools } = params;
    const textToCADReq: TextToCADRequest = {
      description: userPrompt,
      constraints: params.constraints,
      context: [this.buildContextStringForUnifiedAI(fullContext)],
      style: params.style || "precise",
      complexity: fullContext.user.preferences.complexityLevel
    };

    switch (serviceType) {
      case "textToCADStream":
        return textToCADStreamService.streamTextToCAD({
          description: userPrompt,
          settings: params.settings || {
            progressiveGeneration: true,
            batchSize: 3,
            qualityCheck: true,
            autoValidation: true,
            streamDelay: 50
          },
          constraints: params.constraints,
          context: params.context, // e.g., string[] context from strategy.parameters
          onProgress: params.onProgress,
          systemPrompt: systemPrompt
        });

      case "unifiedAI":
        switch (intentAnalysis.primaryIntent) {
          case "create":
            return unifiedAIService.textToCADElements(textToCADReq);
          case "analyze":
            const designAnalysisContextString = this.buildContextStringForUnifiedAI(fullContext);
            const designAnalysisStructuredContext = {
              promptForAnalysis: userPrompt,
              userSkill: fullContext.user.skillLevel,
              otherParams: params.otherAnalysisParams || {}
            };
            return unifiedAIService.analyzeDesign(
              fullContext.elements.total,
              designAnalysisContextString,
              designAnalysisStructuredContext,
              systemPrompt
            );

          case "optimize":
            const optimizeContextString = this.buildContextStringForUnifiedAI(fullContext);
            const optimizeStructuredContext = {
              optimizationGoal: userPrompt,
              userSkill: fullContext.user.skillLevel,
              otherParams: params.otherOptimizeParams || {}
            };
            if (fullContext.gcode && (fullContext.page.section === "cam" || fullContext.page.section === "gcode")) {
              return unifiedAIService.optimizeGCode(
                fullContext.gcode.content,
                params.machineType || "default_machine",
                optimizeContextString,
                optimizeStructuredContext,
                params.material || "default_material",
                systemPrompt
              );
            }
            // Fallback for design optimization (if not G-code)
            return unifiedAIService.analyzeDesign(
              fullContext.elements.total,
              optimizeContextString,
              optimizeStructuredContext,
              systemPrompt
            );

          case "export":
            return unifiedAIService.generateSuggestions(`Export guidance for: ${userPrompt}`, "export", systemPrompt);
          default:
            return unifiedAIService.processRequest({
              prompt: userPrompt,
              systemPrompt: systemPrompt,
              model: fullContext.user.preferences.preferredModel,
              metadata: { intent: intentAnalysis.primaryIntent }
            });
        }

      case "openAI":
        let forceToolChoicePayload: ForceToolChoice | undefined;
        if (tools && tools.length === 1 && params.forceTool === true) {
          forceToolChoicePayload = { type: "function", function: { name: tools[0] } };
        }
        // openAIService.sendMessage expects AIMessage[] which has a different structure
        // We need to adapt or assume systemPrompt is handled within its logic if context string is rich enough
        const openAIMessages: AIMessage[] = [];
        if (systemPrompt) {
          openAIMessages.push({ id: "system-prompt", role: "system", content: systemPrompt, timestamp: Date.now() });
        }
        openAIMessages.push({ id: Date.now().toString(), role: "user", content: userPrompt, timestamp: Date.now() });

        return openAIService.sendMessage(
          openAIMessages,
          this.buildContextStringForOpenAI(fullContext, intentAnalysis),
          tools,
          fullContext.user.preferences.responseStyle,
          fullContext.user.preferences.complexityLevel,
          params.assistantRole || "CADAssistant",
          forceToolChoicePayload,
          JSON.stringify(this.buildStructuredContextForOpenAI(fullContext))
        );

      case "contextAware":
        return contextAwareGenerationService.generateContextualComponent(
          userPrompt,

          fullContext.elements.selected.length > 0 ? fullContext.elements.selected : fullContext.elements.visible,
          params.constraints || {},
          params.options || {}
        );

      case "gcodeService":
        // Assuming openAiGCodeService methods can accept an optional systemPrompt or similar
        switch (intentAnalysis.primaryIntent) {
          case "create":
          case "generate":
            return openAiGCodeService.generateGCode(userPrompt, params.gcodeOptions || {});
          case "analyze":
            return openAiGCodeService.analyzeGCode(fullContext.gcode?.content || userPrompt, params.gcodeOptions || {});
          case "optimize":
            return openAiGCodeService.optimizeGCode(
              fullContext.gcode?.content || userPrompt,
              params.gcodeOptions || {}
            );
          default:
            throw new Error(`Unsupported intent '${intentAnalysis.primaryIntent}' for gcodeService.`);
        }

      case "actionService":
        if (tools.length === 1) {
          const actionType = tools[0];
          const payload = params.actionPayload || {};
          const actionToExecute: AIAction = {
            type: actionType,
            payload: payload,
            description: `Executing action: ${actionType}`
          };
          const actionResult = await aiActionService.executeAction(actionToExecute);
          return {
            content: `Action ${actionType} executed successfully. Result: ${typeof actionResult === "string" ? actionResult : JSON.stringify(actionResult)}`,
            actions: [],
            artifacts: [],
            confidenceScore: 0.95
          };
        } else {
          throw new Error("ActionService requires a single, specific tool/action to be selected.");
        }

      case "progressive":
        if (intentAnalysis.primaryIntent === "create" || intentAnalysis.primaryIntent === "generate") {
          const progressiveRequest: TextToCADRequest = {
            description: userPrompt,
            constraints: params.constraints,
            context: params.contextualPromptString
              ? [params.contextualPromptString]
              : [systemPrompt, this.buildContextStringForUnifiedAI(fullContext)].filter(Boolean),
            style: params.style || "default",
            complexity: intentAnalysis.estimatedComplexity || "moderate"
          };
          const taskId = await continuousCADAgent.generateProgressively(progressiveRequest);
          return { content: `Progressive generation task started. Task ID: ${taskId}`, taskId, confidenceScore: 0.9 };
        }
        throw new Error(
          `Progressive service does not currently support intent: ${intentAnalysis.primaryIntent} via this generic call.`
        );

      case "unifiedCAM":
        if (intentAnalysis.primaryIntent === "optimize" && fullContext.page.section === "cam" && fullContext.gcode) {
          const camOptimizeContextString = this.buildContextStringForUnifiedAI(fullContext);
          const camOptimizeStructuredContext = {
            optimizationGoal: userPrompt,
            machineType: params.machineType || "default_cam_machine",
            material: params.material || "default_material",
            goals: params.optimizationGoals || ["time", "quality"]
          };
          return camService.optimizeGCode(
            fullContext.gcode?.content || userPrompt,
            params.machineType || "default_cam_machine",
            camOptimizeContextString,
            params.tool,
            params.material || "default_material",
            params.optimizationGoals || ["time", "quality"]
          );
        }
        throw new Error(
          `UnifiedCAM service requires a more specific CAM task for intent: ${intentAnalysis.primaryIntent}`
        );

      default:
        console.error(`Unknown or unsupported service type for direct call: ${serviceType}`);
        throw new Error(`Unknown service type: ${serviceType}`);
    }
  }

  /**
   * Calculate context relevance score
   */
  private calculateContextRelevance(intent: IntentAnalysis, context: ApplicationContext): number {
    let relevance = 0.5; // Base relevance

    // Page context relevance
    if (intent.primaryIntent === "create" && context.page.section === "cad") relevance += 0.2;
    if (intent.primaryIntent === "optimize" && context.page.section === "cam") relevance += 0.2;

    // Element context relevance
    if (intent.targetElements && context.elements.selected.length > 0) relevance += 0.15;

    // User context relevance
    if (context.user.recentActions.length > 0) relevance += 0.1;

    return Math.min(1, relevance);
  }

  /**
   * Handle errors gracefully
   */
  private handleError(error: any, userInput: string, startTime: number): OrchestratorResponse {
    return {
      success: false,
      content: `Mi dispiace, ho riscontrato un errore nell'elaborare la tua richiesta: "${userInput}". ${error.message || "Errore sconosciuto"}`,
      error: error.message || "Unknown error",
      metadata: {
        servicesUsed: [],
        processingTimeMs: performance.now() - startTime,
        confidenceScore: 0,
        contextRelevance: 0,
        fallbackUsed: true
      }
    };
  }

  /**
   * Update context with results
   */
  private async updateContextWithResults(response: OrchestratorResponse): Promise<void> {
    if (response.actions) {
      this.userContext.recordActions(response.actions);
    }

    if (response.artifacts) {
      this.elementsContext.processArtifacts(response.artifacts);
    }
  }

  // Helper methods to build context strings for different services
  private buildContextStringForUnifiedAI(context: ApplicationContext): string {
    return `Current page: ${context.page.route}, Section: ${context.page.section}, Mode: ${context.page.mode}. Elements on canvas: ${context.elements.total.length}. Selected: ${context.elements.selected.length}. User skill: ${context.user.skillLevel}.`;
  }

  private buildContextStringForOpenAI(context: ApplicationContext, intent: IntentAnalysis): string {
    let ctxString = `App Context: Page=${context.page.route}, Section=${context.page.section}, Mode=${context.page.mode}. Total Elements: ${context.elements.total.length}. Selected Elements: ${context.elements.selected.map(el => el.type + (el.id ? `(${el.id.substring(0, 4)})` : "")).join(", ")}. User Skill: ${context.user.skillLevel}. Current Intent: ${intent.primaryIntent}.`;
    if (context.gcode) {
      ctxString += ` G-Code Lines: ${context.gcode.lines}, Errors: ${context.gcode.errors.length}, Warnings: ${context.gcode.warnings.length}.`;
    }
    return ctxString;
  }

  private buildStructuredContextForOpenAI(context: ApplicationContext): Record<string, any> {
    return {
      page_context: context.page,
      elements_summary: {
        total: context.elements.total.length,
        selected_count: context.elements.selected.length,
        types: context.elements.types,
        boundingBox: context.elements.boundingBox
      },
      user_preferences: context.user.preferences,
      user_skill: context.user.skillLevel,
      gcode_summary: context.gcode
        ? {
            lines: context.gcode.lines,
            errors: context.gcode.errors,
            warnings: context.gcode.warnings,
            selected_lines: context.gcode.selectedLines
          }
        : null,
      session_info: context.session,
      viewport: context.viewport
    };
  }

  // Public methods for integration
  public getCurrentContext(): ApplicationContext | null {
    return this.currentContext;
  }

  public getAvailableServices(): ServiceCapabilities[] {
    return Array.from(this.serviceRegistry.values());
  }

  public async forceContextUpdate(): Promise<ApplicationContext> {
    return this.updateApplicationContext();
  }
}

// Export singleton
export const unifiedAIOrchestrator = new UnifiedAIOrchestrator();

export type { AIAction };
