import { Element } from "@/src/store/elementsStore";
import { unifiedAIService } from "../unifiedAIService";
import { contextAwareGenerationService } from "../ContextAwareGenerationService";
import { ContinuousCADAgent } from "../generation/progressiveGeneratorService";
import { CAMActionHandler } from "../camActionHandler";
import { createCadActionHandler } from "../cadActionHandler";
import { aiAnalytics } from "../ai-new/aiAnalytics";
import { aiCache } from "../ai-new/aiCache";
import { mcpService } from "../ai-new/mcpService";
import { openAIService } from "../openaiService";
import { AIAction, AIMessage, ResponseStyle, ComplexityLevel, AssistantRole } from "@/src/types/AITypes";

// Context Analysis Types
interface CanvasContext {
  elements: Element[];
  elementTypes: Record<string, number>;
  geometryComplexity: number;
  spatialRelationships: SpatialRelation[];
  designPhase: "concept" | "modeling" | "detailing" | "production";
  lastActions: UserAction[];
  workingMode: "cad" | "cam" | "hybrid";
  currentTool?: string;
  selectedElements: string[];
  viewportState: ViewportState;
}

interface SpatialRelation {
  type: "adjacent" | "intersecting" | "contained" | "aligned" | "symmetric";
  elements: [string, string];
  confidence: number;
  parameters?: Record<string, any>;
}

interface UserAction {
  timestamp: Date;
  type: "create" | "modify" | "delete" | "analyze" | "optimize" | "export" | "chat";
  target: string;
  parameters: Record<string, any>;
  success: boolean;
}

interface ViewportState {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  zoom: number;
  perspective: "iso" | "front" | "top" | "side";
}

interface IntentAnalysis {
  primaryIntent: "create" | "modify" | "analyze" | "optimize" | "export" | "chat";
  confidence: number;
  targetElements?: string[];
  requiredServices: AIServiceType[];
  contextDependency: "high" | "medium" | "low";
  suggestedActions: AIAction[];
}

type AIServiceType = "unified" | "cad" | "cam" | "analysis" | "generation" | "optimization" | "mcp" | "fallback";

interface UnifiedResponse {
  success: boolean;
  content: string;
  actions?: AIAction[];
  artifacts?: ResponseArtifact[];
  contextUpdates?: CanvasContext;
  suggestions?: string[];
  error?: string;
  metadata: {
    servicesUsed: AIServiceType[];
    processingTime: number;
    confidenceScore: number;
    contextRelevance: number;
    primaryService: "unified" | "fallback";
  };
}

interface ResponseArtifact {
  id: string;
  type: "elements" | "gcode" | "analysis" | "preview" | "documentation";
  content: any;
  title: string;
  description: string;
  previewUrl?: string;
}

export class UnifiedAIOrchestrator {
  private currentContext: CanvasContext | null = null;
  private userActionHistory: UserAction[] = [];
  private continuousAgent: ContinuousCADAgent;
  private cadActionHandler: any;
  private camActionHandler: CAMActionHandler;
  private sessionMemory: Map<string, any> = new Map();

  constructor() {
    this.continuousAgent = new ContinuousCADAgent();
    this.camActionHandler = new CAMActionHandler();
    this.initializeSession();
  }

  /**
   * Initialize session and setup context monitoring
   */
  private initializeSession(): void {
    // Setup automatic context monitoring
    setInterval(() => this.updateContextIfNeeded(), 5000);

    // Initialize analytics tracking
    aiAnalytics.trackEvent({
      eventType: "request",
      eventName: "unified_orchestrator_initialized",
      metadata: { timestamp: Date.now() }
    });
  }

  /**
   * Main entry point - processes any user input intelligently using unifiedAIService as primary
   */
  async processUnifiedRequest(
    userInput: string,
    currentElements: Element[],
    canvasState: any,
    userPreferences?: Record<string, any>
  ): Promise<UnifiedResponse> {
    const startTime = Date.now();

    try {
      // 1. Update current context
      await this.updateCanvasContext(currentElements, canvasState);

      // 2. Analyze user intent
      const intentAnalysis = await this.analyzeUserIntent(userInput);

      // 3. Route to unifiedAIService as primary service
      const response = await this.routeToUnifiedService(userInput, intentAnalysis);

      // 4. Post-process and enhance response
      const finalResponse = await this.enhanceResponse(response, intentAnalysis);

      // 5. Update user action history
      this.recordUserAction({
        timestamp: new Date(),
        type: intentAnalysis.primaryIntent,
        target: userInput,
        parameters: { intent: intentAnalysis },
        success: finalResponse.success
      });

      // 6. Analytics tracking
      aiAnalytics.trackEvent({
        eventType: "response",
        eventName: "unified_request_completed",
        success: finalResponse.success,
        duration: Date.now() - startTime,
        metadata: {
          intent: intentAnalysis.primaryIntent,
          servicesUsed: finalResponse.metadata.servicesUsed,
          contextRelevance: finalResponse.metadata.contextRelevance,
          primaryService: finalResponse.metadata.primaryService
        }
      });

      return finalResponse;
    } catch (error) {
      console.error("Unified AI Orchestrator Error:", error);

      return {
        success: false,
        content: `❌ **Errore del sistema AI**: ${error instanceof Error ? error.message : "Errore sconosciuto"}`,
        error: error instanceof Error ? error.message : "Unknown error",
        metadata: {
          servicesUsed: [],
          processingTime: Date.now() - startTime,
          confidenceScore: 0,
          contextRelevance: 0,
          primaryService: "fallback"
        }
      };
    }
  }

  /**
   * Analyze canvas context and extract meaningful information
   */
  private async updateCanvasContext(elements: Element[], canvasState: any): Promise<void> {
    try {
      // Analyze element types and quantities
      const elementTypes = elements.reduce(
        (acc, el) => {
          acc[el.type] = (acc[el.type] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      // Calculate geometry complexity
      const geometryComplexity = this.calculateGeometryComplexity(elements);

      // Detect spatial relationships
      const spatialRelationships = await this.analyzeSpatialRelationships(elements);

      // Determine design phase
      const designPhase = this.determineDesignPhase(elements, this.userActionHistory);

      // Determine working mode
      const workingMode = this.determineWorkingMode(elements, this.userActionHistory);

      this.currentContext = {
        elements,
        elementTypes,
        geometryComplexity,
        spatialRelationships,
        designPhase,
        lastActions: this.userActionHistory.slice(-5),
        workingMode,
        currentTool: canvasState?.activeTool,
        selectedElements: canvasState?.selectedElements || [],
        viewportState: {
          position: canvasState?.camera?.position || { x: 0, y: 0, z: 0 },
          rotation: canvasState?.camera?.rotation || { x: 0, y: 0, z: 0 },
          zoom: canvasState?.camera?.zoom || 1,
          perspective: canvasState?.view || "iso"
        }
      };

      // Update session memory
      this.sessionMemory.set("lastContextUpdate", Date.now());
      this.sessionMemory.set("contextHistory", [
        ...(this.sessionMemory.get("contextHistory") || []).slice(-10),
        { ...this.currentContext, timestamp: Date.now() }
      ]);
    } catch (error) {
      console.error("Error updating canvas context:", error);
    }
  }

  /**
   * Advanced intent analysis using multiple AI services
   */
  private async analyzeUserIntent(userInput: string): Promise<IntentAnalysis> {
    try {
      // Use multiple approaches for intent detection
      const [basicIntent, contextualIntent, semanticIntent] = await Promise.allSettled([
        this.basicIntentDetection(userInput),
        this.contextualIntentDetection(userInput),
        this.semanticIntentDetection(userInput)
      ]);

      // Combine results with weighted confidence
      const combinedIntent = this.combineIntentAnalysis([
        basicIntent.status === "fulfilled" ? basicIntent.value : null,
        contextualIntent.status === "fulfilled" ? contextualIntent.value : null,
        semanticIntent.status === "fulfilled" ? semanticIntent.value : null
      ]);

      return combinedIntent;
    } catch (error) {
      console.error("Intent analysis error:", error);

      // Fallback to basic detection
      return {
        primaryIntent: "chat",
        confidence: 0.3,
        requiredServices: ["unified"],
        contextDependency: "low",
        suggestedActions: []
      };
    }
  }

  /**
   * Route request to unifiedAIService as primary, with fallback to specialized services
   */
  private async routeToUnifiedService(userInput: string, intent: IntentAnalysis): Promise<UnifiedResponse> {
    const servicesUsed: AIServiceType[] = ["unified"];
    let primaryResponse: any = null;
    let primaryService: "unified" | "fallback" = "unified";
    const artifacts: ResponseArtifact[] = [];

    try {
      // Always try unifiedAIService first based on intent
      switch (intent.primaryIntent) {
        case "create":
          console.log("🚀 Using unifiedAIService for CAD element creation");
          primaryResponse = await unifiedAIService.textToCADElements({
            description: userInput,
            constraints: {},
            context: this.currentContext ? [this.buildContextString(this.currentContext)] : []
          });

          // Convert response to expected format
          if (primaryResponse.success && primaryResponse.data) {
            artifacts.push({
              id: `elements-${Date.now()}`,
              type: "elements",
              content: primaryResponse.data,
              title: "Generated CAD Elements",
              description: `${primaryResponse.data.length} elementi generati da: "${userInput}"`
            });
          }
          break;

        case "modify":
          console.log("🔧 Using unifiedAIService for element modification");
          primaryResponse = await unifiedAIService.analyzeDesign(
            this.currentContext?.elements || [],
            `Modifica richiesta: ${userInput}`,
            { action: "modify", input: userInput }
          );
          break;

        case "analyze":
          console.log("🔍 Using unifiedAIService for design analysis");
          primaryResponse = await unifiedAIService.analyzeDesign(this.currentContext?.elements || [], userInput, {
            includeOptimizations: true,
            includeManufacturability: true
          });

          if (primaryResponse.success && primaryResponse.data) {
            artifacts.push({
              id: `analysis-${Date.now()}`,
              type: "analysis",
              content: primaryResponse.data,
              title: "Design Analysis",
              description: "Analisi approfondita del design corrente"
            });
          }
          break;

        case "optimize":
          console.log("⚡ Using unifiedAIService for optimization");
          if (this.currentContext?.workingMode === "cam") {
            primaryResponse = await unifiedAIService.optimizeGCode(
              "", // TODO: get actual gcode
              "cnc",
              userInput,
              {},
              "aluminum"
            );
          } else {
            primaryResponse = await unifiedAIService.analyzeDesign(
              this.currentContext?.elements || [],
              `Ottimizzazione richiesta: ${userInput}`,
              { focusOnOptimization: true }
            );
          }
          break;

        case "export":
          console.log("💾 Using unifiedAIService for export guidance");
          primaryResponse = await unifiedAIService.generateSuggestions(
            `Export guidance needed: ${userInput}. Current elements: ${this.currentContext?.elements.length || 0}`,
            "export"
          );
          break;

        default:
          console.log("💬 Using unifiedAIService for general chat");
          primaryResponse = await unifiedAIService.processMessage(userInput, "general");
      }

      // Check if unifiedAIService response is valid
      if (!primaryResponse || !primaryResponse.success) {
        console.warn("⚠️ UnifiedAIService failed, falling back to specialized services");
        primaryService = "fallback";
        servicesUsed.push("generation"); // Add fallback service

        // Fallback to specialized services
        primaryResponse = await this.fallbackToSpecializedServices(userInput, intent);
      }

      // Add contextual enhancements if high context dependency
      if (intent.contextDependency === "high" && this.currentContext) {
        const contextualEnhancement = await this.addContextualEnhancements(primaryResponse, this.currentContext);
        artifacts.push(...contextualEnhancement.artifacts);
      }

      return {
        success: true,
        content:
          primaryResponse.content || primaryResponse.rawResponse || primaryResponse.data || "Operazione completata",
        actions: intent.suggestedActions,
        artifacts,
        contextUpdates: this.currentContext || undefined,
        suggestions: await this.generateContextualSuggestions(),
        metadata: {
          servicesUsed,
          processingTime: Date.now() - Date.now(),
          confidenceScore: intent.confidence,
          contextRelevance: this.calculateContextRelevance(intent),
          primaryService
        }
      };
    } catch (error) {
      console.error("Service routing error:", error);

      // Final fallback
      console.log("🆘 All services failed, using emergency fallback");
      primaryService = "fallback";
      servicesUsed.push("fallback");

      const fallbackResponse = await this.emergencyFallback(userInput, intent);

      return {
        success: false,
        content: fallbackResponse.content,
        error: error instanceof Error ? error.message : "Unknown error",
        metadata: {
          servicesUsed,
          processingTime: Date.now() - Date.now(),
          confidenceScore: 0.3,
          contextRelevance: 0.5,
          primaryService
        }
      };
    }
  }

  /**
   * Fallback to specialized services when unifiedAIService fails
   */
  private async fallbackToSpecializedServices(userInput: string, intent: IntentAnalysis): Promise<any> {
    console.log("🔄 Using specialized services as fallback");

    try {
      switch (intent.primaryIntent) {
        case "create":
          return await contextAwareGenerationService.generateContextualComponent(
            userInput,
            this.currentContext?.elements || [],
            {},
            { useCache: true, fallbackOnError: true }
          );

        case "modify":
        case "analyze":
          return await this.handleAnalyzeIntent(userInput, intent);

        case "optimize":
          return await this.handleOptimizeIntent(userInput, intent);

        case "export":
          return await this.handleExportIntent(userInput, intent);

        default:
          return await this.handleChatIntent(userInput, intent);
      }
    } catch (error) {
      console.error("Specialized services also failed:", error);
      return await this.emergencyFallback(userInput, intent);
    }
  }

  /**
   * Emergency fallback for when all services fail
   */
  private async emergencyFallback(userInput: string, intent: IntentAnalysis): Promise<any> {
    return {
      content: `Mi dispiace, ho riscontrato delle difficoltà nell'elaborare la tua richiesta: "${userInput}". 

🔧 **Cosa puoi fare:**
• Prova a riformulare la richiesta in modo più specifico
• Verifica che gli elementi nel canvas siano validi
• Controlla la connessione di rete

💡 **Suggerimenti:**
• Per creare elementi: "Crea un cubo rosso 50x50x50mm"
• Per analisi: "Analizza la complessità del design"
• Per ottimizzazioni: "Ottimizza per la stampa 3D"`,
      success: false
    };
  }

  /**
   * Build context string for unifiedAIService
   */
  private buildContextString(context: CanvasContext): string {
    return `Canvas corrente: ${context.elements.length} elementi (${Object.entries(context.elementTypes)
      .map(([type, count]) => `${count} ${type}`)
      .join(", ")}). Modalità: ${context.workingMode}. Fase: ${context.designPhase}.`;
  }

  /**
   * Enhanced response post-processing
   */
  private async enhanceResponse(response: UnifiedResponse, intent: IntentAnalysis): Promise<UnifiedResponse> {
    try {
      // Add proactive suggestions based on context
      const proactiveSuggestions = await this.generateProactiveSuggestions(intent);

      // Add related actions that user might want to do next
      const relatedActions = await this.generateRelatedActions(intent);

      // Format content with rich formatting
      const enhancedContent = await this.formatResponseContent(response.content, intent, this.currentContext);

      return {
        ...response,
        content: enhancedContent,
        suggestions: [...(response.suggestions || []), ...proactiveSuggestions],
        actions: [...(response.actions || []), ...relatedActions]
      };
    } catch (error) {
      console.error("Response enhancement error:", error);
      return response;
    }
  }

  // Helper methods for intent detection
  private async basicIntentDetection(input: string): Promise<Partial<IntentAnalysis>> {
    const lowerInput = input.toLowerCase();

    const intentKeywords = {
      create: ["create", "add", "make", "generate", "build", "draw", "design"],
      modify: ["edit", "change", "update", "modify", "adjust", "move", "rotate"],
      analyze: ["analyze", "check", "inspect", "review", "examine", "evaluate"],
      optimize: ["optimize", "improve", "enhance", "refine", "streamline"],
      export: ["export", "save", "download", "output", "generate code"]
    };

    let maxScore = 0;
    let detectedIntent: keyof typeof intentKeywords | "chat" = "chat";

    for (const [intent, keywords] of Object.entries(intentKeywords)) {
      const score = keywords.filter(keyword => lowerInput.includes(keyword)).length;
      if (score > maxScore) {
        maxScore = score;
        detectedIntent = intent as keyof typeof intentKeywords;
      }
    }

    return {
      primaryIntent: detectedIntent,
      confidence: Math.min(maxScore / 3, 1),
      contextDependency: maxScore > 0 ? "medium" : "low"
    };
  }

  private async contextualIntentDetection(input: string): Promise<Partial<IntentAnalysis>> {
    if (!this.currentContext) {
      return { confidence: 0 };
    }

    // Analyze intent based on current context
    const contextClues = {
      hasElements: this.currentContext.elements.length > 0,
      hasSelection: this.currentContext.selectedElements.length > 0,
      workingMode: this.currentContext.workingMode,
      designPhase: this.currentContext.designPhase,
      recentActions: this.currentContext.lastActions
    };

    // Context-based intent scoring
    let contextualIntent: IntentAnalysis["primaryIntent"] = "chat";
    let confidence = 0.5;

    if (contextClues.hasSelection && input.includes("modify")) {
      contextualIntent = "modify";
      confidence = 0.9;
    } else if (contextClues.workingMode === "cam") {
      contextualIntent = "optimize";
      confidence = 0.7;
    } else if (contextClues.designPhase === "concept") {
      contextualIntent = "create";
      confidence = 0.8;
    }

    return {
      primaryIntent: contextualIntent,
      confidence,
      contextDependency: "high"
    };
  }

  private async semanticIntentDetection(input: string): Promise<Partial<IntentAnalysis>> {
    try {
      // Use AI service for semantic understanding
      const response = await openAIService.sendMessage(
        [{ id: Date.now().toString(), role: "user", content: input, timestamp: Date.now() }],
        `Analyze the user's intent for CAD/CAM operations. Respond with JSON: {
          "intent": "create|modify|analyze|optimize|export|chat",
          "confidence": 0-1,
          "targetElements": ["id1", "id2"],
          "requiredServices": ["cad", "cam", "analysis"],
          "contextDependency": "high|medium|low"
        }`,
        [],
        "concise",
        "moderate"
      );

      if (response.content) {
        const parsed = JSON.parse(response.content);
        return {
          primaryIntent: parsed.intent,
          confidence: parsed.confidence,
          targetElements: parsed.targetElements,
          requiredServices: parsed.requiredServices,
          contextDependency: parsed.contextDependency
        };
      }
    } catch (error) {
      console.error("Semantic intent detection error:", error);
    }

    return { confidence: 0 };
  }

  // Implement other helper methods...
  private combineIntentAnalysis(analyses: (Partial<IntentAnalysis> | null)[]): IntentAnalysis {
    // Combine multiple intent analyses with weighted confidence
    const validAnalyses = analyses.filter(a => a && a.confidence && a.confidence > 0);

    if (validAnalyses.length === 0) {
      return {
        primaryIntent: "chat",
        confidence: 0.3,
        requiredServices: ["unified"],
        contextDependency: "low",
        suggestedActions: []
      };
    }

    // Find highest confidence analysis
    const bestAnalysis = validAnalyses.reduce((best, current) =>
      (current?.confidence || 0) > (best?.confidence || 0) ? current : best
    );

    return {
      primaryIntent: bestAnalysis?.primaryIntent || "chat",
      confidence: bestAnalysis?.confidence || 0.3,
      targetElements: bestAnalysis?.targetElements,
      requiredServices: bestAnalysis?.requiredServices || ["unified"],
      contextDependency: bestAnalysis?.contextDependency || "low",
      suggestedActions: bestAnalysis?.suggestedActions || []
    };
  }

  // Implement intent handlers for fallback...
  private async handleCreateIntent(input: string, intent: IntentAnalysis) {
    return await contextAwareGenerationService.generateContextualComponent(
      input,
      this.currentContext?.elements || [],
      {},
      { useCache: true }
    );
  }

  private async handleModifyIntent(input: string, intent: IntentAnalysis) {
    // Implementation for modify operations
    return { content: `Modifying elements based on: ${input}` };
  }

  private async handleAnalyzeIntent(input: string, intent: IntentAnalysis) {
    // Implementation for analysis operations
    return { content: `Analyzing: ${input}` };
  }

  private async handleOptimizeIntent(input: string, intent: IntentAnalysis) {
    // Implementation for optimization operations
    return { content: `Optimizing: ${input}` };
  }

  private async handleExportIntent(input: string, intent: IntentAnalysis) {
    // Implementation for export operations
    return { content: `Exporting: ${input}` };
  }

  private async handleChatIntent(input: string, intent: IntentAnalysis) {
    // Implementation for general chat
    return { content: `Chat response for: ${input}` };
  }

  // Utility methods
  private calculateGeometryComplexity(elements: Element[]): number {
    // Calculate complexity based on element types and relationships
    return Math.min(elements.length / 10, 1);
  }

  private async analyzeSpatialRelationships(elements: Element[]): Promise<SpatialRelation[]> {
    // Analyze spatial relationships between elements
    return [];
  }

  private determineDesignPhase(elements: Element[], actions: UserAction[]): CanvasContext["designPhase"] {
    // Determine current design phase based on elements and actions
    if (elements.length < 5) return "concept";
    if (actions.some(a => a.type === "optimize")) return "production";
    return "modeling";
  }

  private determineWorkingMode(elements: Element[], actions: UserAction[]): CanvasContext["workingMode"] {
    // Determine working mode based on recent actions and elements
    const recentCAMActions = actions.filter(
      a => a.type === "optimize" || a.target.includes("toolpath") || a.target.includes("gcode")
    );

    if (recentCAMActions.length > 0) return "cam";
    return "cad";
  }

  private async addContextualEnhancements(response: any, context: CanvasContext) {
    return { artifacts: [] };
  }

  private async generateContextualSuggestions(): Promise<string[]> {
    return [];
  }

  private calculateContextRelevance(intent: IntentAnalysis): number {
    return intent.confidence;
  }

  private async generateProactiveSuggestions(intent: IntentAnalysis): Promise<string[]> {
    return [];
  }

  private async generateRelatedActions(intent: IntentAnalysis): Promise<AIAction[]> {
    return [];
  }

  private async formatResponseContent(
    content: string,
    intent: IntentAnalysis,
    context: CanvasContext | null
  ): Promise<string> {
    return content;
  }

  private recordUserAction(action: UserAction): void {
    this.userActionHistory.push(action);
    // Keep only last 50 actions
    if (this.userActionHistory.length > 50) {
      this.userActionHistory = this.userActionHistory.slice(-50);
    }
  }

  private updateContextIfNeeded(): void {
    // Check if context needs updating based on time or changes
    const lastUpdate = this.sessionMemory.get("lastContextUpdate") || 0;
    const timeSinceUpdate = Date.now() - lastUpdate;

    if (timeSinceUpdate > 30000) {
      // 30 seconds
      // Trigger context update if needed
      console.log("Context update needed");
    }
  }

  // Public methods for integration
  public async initializeCanvasIntegration(canvasCallbacks: {
    addElements: (elements: Element[]) => void;
    updateElement: (id: string, properties: Partial<Element>) => void;
    removeElement: (id: string) => void;
    getElements: () => Element[];
    getCanvasState: () => any;
  }): Promise<void> {
    this.cadActionHandler = createCadActionHandler({
      addElementsToCanvas: canvasCallbacks.addElements,
      updateElementInCanvas: canvasCallbacks.updateElement,
      removeElementFromCanvas: canvasCallbacks.removeElement,
      getCanvasElements: canvasCallbacks.getElements
    });

    // Initialize continuous agent with canvas integration
    this.continuousAgent.initialize({
      addElements: canvasCallbacks.addElements,
      updateElement: canvasCallbacks.updateElement,
      removeElement: canvasCallbacks.removeElement,
      getElements: canvasCallbacks.getElements
    });
  }

  public getContextSummary(): string {
    if (!this.currentContext) return "No context available";

    return `Context: ${this.currentContext.elements.length} elements, ${this.currentContext.workingMode} mode, ${this.currentContext.designPhase} phase`;
  }

  public async generateContextualPrompt(userInput: string): Promise<string> {
    if (!this.currentContext) return userInput;

    const contextInfo = `
Current Context:
- Elements: ${this.currentContext.elements.length} (${Object.entries(this.currentContext.elementTypes)
      .map(([type, count]) => `${count} ${type}`)
      .join(", ")})
- Mode: ${this.currentContext.workingMode}
- Phase: ${this.currentContext.designPhase}
- Selected: ${this.currentContext.selectedElements.length} elements
- Recent actions: ${this.currentContext.lastActions.map(a => a.type).join(", ")}

User Request: ${userInput}
`;

    return contextInfo;
  }
}

// Export singleton instance
export const unifiedAIOrchestrator = new UnifiedAIOrchestrator();
