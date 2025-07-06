import { ApplicationContext, IntentAnalysis, ServiceType } from "../UnifiedAIOrchestrator";
import { AIAction } from "@/src/types/AITypes";

export class IntentDetector {
  /**
   * Analyze user intent from input and context
   */
  async analyzeIntent(
    userInput: string,
    context: ApplicationContext,
    options?: {
      forceService?: ServiceType;
      streaming?: boolean;
      includeContext?: boolean;
    }
  ): Promise<IntentAnalysis> {
    try {
      // 1. Basic intent detection from keywords
      const basicIntent = this.detectBasicIntent(userInput);

      // 2. Context-aware intent refinement
      const contextualIntent = this.refineIntentWithContext(basicIntent, context, userInput);

      // 3. Determine required services
      const requiredServices = this.determineRequiredServices(contextualIntent, context);

      // 4. Generate suggested actions
      const suggestedActions = this.generateSuggestedActions(contextualIntent, context, userInput);

      // 5. Calculate context dependency
      const contextDependency = this.calculateContextDependency(contextualIntent, context, userInput);

      // 6. Estimate complexity and time
      const complexity = this.estimateComplexity(contextualIntent, context, userInput);
      const timeToComplete = this.estimateTimeToComplete(contextualIntent, complexity);

      return {
        primaryIntent: contextualIntent.intent,
        confidence: contextualIntent.confidence,
        targetElements: contextualIntent.targetElements,
        requiredServices,
        contextDependency,
        suggestedActions,
        estimatedComplexity: complexity,
        timeToComplete
      };
    } catch (error) {
      console.error("Intent analysis error:", error);
      return this.getFallbackIntent(userInput);
    }
  }

  /**
   * Detect basic intent from user input keywords
   */
  private detectBasicIntent(userInput: string): {
    intent: IntentAnalysis["primaryIntent"];
    confidence: number;
    targetElements?: string[];
  } {
    const input = userInput.toLowerCase().trim();

    // Intent keywords mapping
    const intentKeywords = {
      create: [
        "create",
        "make",
        "add",
        "generate",
        "build",
        "draw",
        "design",
        "new",
        "crea",
        "aggiungi",
        "genera",
        "costruisci",
        "disegna",
        "nuovo"
      ],
      modify: [
        "edit",
        "change",
        "update",
        "modify",
        "adjust",
        "move",
        "rotate",
        "scale",
        "transform",
        "modifica",
        "cambia",
        "aggiorna",
        "muovi",
        "ruota",
        "ridimensiona"
      ],
      analyze: [
        "analyze",
        "check",
        "inspect",
        "review",
        "examine",
        "evaluate",
        "study",
        "assess",
        "analizza",
        "controlla",
        "ispeziona",
        "esamina",
        "valuta",
        "studia"
      ],
      optimize: [
        "optimize",
        "improve",
        "enhance",
        "refine",
        "streamline",
        "better",
        "faster",
        "efficient",
        "ottimizza",
        "migliora",
        "perfeziona",
        "velocizza",
        "efficiente"
      ],
      export: [
        "export",
        "save",
        "download",
        "output",
        "generate code",
        "export to",
        "convert",
        "esporta",
        "salva",
        "scarica",
        "converti",
        "genera codice"
      ],
      learn: [
        "how",
        "what",
        "why",
        "explain",
        "help",
        "guide",
        "tutorial",
        "learn",
        "come",
        "cosa",
        "perché",
        "spiega",
        "aiuto",
        "guida",
        "impara"
      ]
    };

    let bestMatch: { intent: IntentAnalysis["primaryIntent"]; score: number } = {
      intent: "chat",
      score: 0
    };

    // Score each intent based on keyword matches
    for (const [intent, keywords] of Object.entries(intentKeywords)) {
      let score = 0;

      for (const keyword of keywords) {
        if (input.includes(keyword)) {
          // Give higher score for exact matches at word boundaries
          const regex = new RegExp(`\\b${keyword}\\b`, "i");
          if (regex.test(input)) {
            score += 2;
          } else {
            score += 1;
          }
        }
      }

      if (score > bestMatch.score) {
        bestMatch = {
          intent: intent as IntentAnalysis["primaryIntent"],
          score
        };
      }
    }

    // Calculate confidence based on score and input length
    const confidence = Math.min(0.9, Math.max(0.3, bestMatch.score / Math.max(3, userInput.split(" ").length * 0.5)));

    // Extract potential target elements from input
    const targetElements = this.extractTargetElements(userInput);

    return {
      intent: bestMatch.intent,
      confidence,
      targetElements: targetElements.length > 0 ? targetElements : undefined
    };
  }

  /**
   * Refine intent based on application context
   */
  private refineIntentWithContext(
    basicIntent: ReturnType<typeof this.detectBasicIntent>,
    context: ApplicationContext,
    userInput: string
  ): {
    intent: IntentAnalysis["primaryIntent"];
    confidence: number;
    targetElements?: string[];
  } {
    let refinedIntent = { ...basicIntent };

    // Context-based intent adjustments
    const contextualFactors: Array<{
      condition: boolean;
      intentAdjustment: Partial<typeof refinedIntent>;
      confidenceBoost: number;
    }> = [
      // If user has selected elements, likely wants to modify them
      {
        condition: context.elements.selected.length > 0 && userInput.includes("selected"),
        intentAdjustment: { intent: "modify" },
        confidenceBoost: 0.2
      },

      // If in CAM mode with G-code, likely wants optimization
      {
        condition: context.page.section === "cam" && !!context.gcode && userInput.includes("optimize"),
        intentAdjustment: { intent: "optimize" },
        confidenceBoost: 0.3
      },

      // If no elements exist and asking for creation
      {
        condition: context.elements.total.length === 0 && basicIntent.intent === "create",
        intentAdjustment: {},
        confidenceBoost: 0.2
      },

      // If many elements exist and asking for analysis
      {
        condition: context.elements.total.length > 10 && basicIntent.intent === "analyze",
        intentAdjustment: {},
        confidenceBoost: 0.15
      },

      // If in design mode, prefer create/modify over chat
      {
        condition: context.page.mode === "design" && basicIntent.intent === "chat",
        intentAdjustment: { intent: "create" },
        confidenceBoost: 0.1
      }
    ];

    // Apply contextual refinements
    for (const factor of contextualFactors) {
      if (factor.condition) {
        Object.assign(refinedIntent, factor.intentAdjustment);
        refinedIntent.confidence = Math.min(0.95, refinedIntent.confidence + factor.confidenceBoost);
      }
    }

    return refinedIntent;
  }

  /**
   * Determine which services are required for the intent
   */
  private determineRequiredServices(
    intent: ReturnType<typeof this.refineIntentWithContext>,
    context: ApplicationContext
  ): ServiceType[] {
    const services: ServiceType[] = [];

    switch (intent.intent) {
      case "create":
        if (context.elements.total.length === 0) {
          services.push("textToCADStream");
        } else {
          services.push("contextAware");
        }
        services.push("unifiedAI");
        break;

      case "modify":
        services.push("unifiedAI", "contextAware");
        break;

      case "analyze":
        if (context.page.section === "cam" && context.gcode) {
          services.push("gcodeService");
        }
        services.push("unifiedAI");
        break;

      case "optimize":
        if (context.page.section === "cam" || context.gcode) {
          services.push("gcodeService");
        }
        services.push("unifiedAI");
        break;

      case "export":
        services.push("unifiedAI", "actionService");
        break;

      case "learn":
      case "chat":
      default:
        services.push("unifiedAI");
        break;
    }

    // Ensure service types are unique
    return Array.from(new Set(services));
  }

  /**
   * Generate suggested actions based on intent and context
   */
  private generateSuggestedActions(
    intent: ReturnType<typeof this.refineIntentWithContext>,
    context: ApplicationContext,
    userInput: string
  ): AIAction[] {
    const actions: AIAction[] = [];

    switch (intent.intent) {
      case "create":
        actions.push({
          type: "generateCADElement",
          payload: {
            description: userInput,
            context: context.elements.total.slice(-5) // Last 5 elements for context
          },
          description: "Generate new CAD elements based on description"
        });
        break;

      case "modify":
        if (context.elements.selected.length > 0) {
          actions.push({
            type: "updateCADElement",
            payload: {
              elements: context.elements.selected,
              modification: userInput
            },
            description: "Modify selected elements"
          });
        }
        break;

      case "analyze":
        actions.push({
          type: "analyzeDesign",
          payload: {
            elements: context.elements.total,
            analysisType: "comprehensive"
          },
          description: "Analyze current design"
        });
        break;

      case "optimize":
        if (context.gcode) {
          actions.push({
            type: "optimizeGCode",
            payload: {
              gcode: context.gcode.content,
              goals: ["performance", "quality"]
            },
            description: "Optimize G-code for better performance"
          });
        } else {
          actions.push({
            type: "optimizeDesign",
            payload: {
              elements: context.elements.total
            },
            description: "Optimize design structure"
          });
        }
        break;

      case "export":
        actions.push({
          type: "exportDesign",
          payload: {
            format: "auto",
            elements: context.elements.total
          },
          description: "Export current design"
        });
        break;
    }

    return actions;
  }

  /**
   * Calculate how much the intent depends on current context
   */
  private calculateContextDependency(
    intent: ReturnType<typeof this.refineIntentWithContext>,
    context: ApplicationContext,
    userInput: string
  ): IntentAnalysis["contextDependency"] {
    let dependency: IntentAnalysis["contextDependency"] = "medium";

    // High dependency factors
    const highDependencyFactors = [
      userInput.includes("selected"),
      userInput.includes("current"),
      userInput.includes("existing"),
      intent.targetElements && intent.targetElements.length > 0,
      context.elements.selected.length > 0 && intent.intent === "modify"
    ];

    // Critical dependency factors
    const criticalDependencyFactors = [
      intent.intent === "modify" && context.elements.selected.length > 0,
      intent.intent === "optimize" && context.gcode?.content,
      intent.intent === "analyze" && context.elements.total.length > 0
    ];

    // Low dependency factors
    const lowDependencyFactors = [
      intent.intent === "create" && context.elements.total.length === 0,
      intent.intent === "learn",
      intent.intent === "chat"
    ];

    if (criticalDependencyFactors.some(factor => factor)) {
      dependency = "critical";
    } else if (highDependencyFactors.some(factor => factor)) {
      dependency = "high";
    } else if (lowDependencyFactors.some(factor => factor)) {
      dependency = "low";
    }

    return dependency;
  }

  /**
   * Estimate task complexity
   */
  private estimateComplexity(
    intent: ReturnType<typeof this.refineIntentWithContext>,
    context: ApplicationContext,
    userInput: string
  ): IntentAnalysis["estimatedComplexity"] {
    const inputLength = userInput.length;
    const wordCount = userInput.split(/\s+/).length;
    const elementCount = context.elements.total.length;

    // Simple complexity indicators
    if (intent.intent === "chat" || intent.intent === "learn" || (intent.intent === "create" && wordCount < 5)) {
      return "simple";
    }

    // Complex complexity indicators
    if (
      wordCount > 20 ||
      elementCount > 50 ||
      userInput.includes("complex") ||
      userInput.includes("detailed") ||
      userInput.includes("advanced") ||
      (intent.intent === "optimize" && context.gcode?.lines && context.gcode.lines > 1000)
    ) {
      return "complex";
    }

    // Default to moderate
    return "moderate";
  }

  /**
   * Estimate time to complete the task
   */
  private estimateTimeToComplete(
    intent: ReturnType<typeof this.refineIntentWithContext>,
    complexity: IntentAnalysis["estimatedComplexity"]
  ): number {
    const baseTime = 5; // Base time in seconds

    const intentComplexityScores = {
      chat: 50,
      learn: 100,
      create: 300,
      modify: 200,
      analyze: 400,
      optimize: 600,
      export: 150,
      generate: 300 // Added generate intent
    };

    const complexityMultipliers = {
      simple: 0.5,
      moderate: 1.0,
      complex: 2.5
    };

    const multiplier = complexityMultipliers[complexity];

    return Math.round(baseTime * multiplier);
  }

  /**
   * Extract potential target elements from user input
   */
  private extractTargetElements(userInput: string): string[] {
    const elementTypes = [
      "cube",
      "sphere",
      "cylinder",
      "cone",
      "torus",
      "line",
      "circle",
      "rectangle",
      "polygon",
      "cubo",
      "sfera",
      "cilindro",
      "cono",
      "linea",
      "cerchio",
      "rettangolo",
      "poligono"
    ];

    const found: string[] = [];
    const input = userInput.toLowerCase();

    for (const type of elementTypes) {
      if (input.includes(type)) {
        found.push(type);
      }
    }

    return found;
  }

  /**
   * Get fallback intent when analysis fails
   */
  private getFallbackIntent(userInput: string): IntentAnalysis {
    return {
      primaryIntent: "chat",
      confidence: 0.3,
      requiredServices: ["unifiedAI"],
      contextDependency: "low",
      suggestedActions: [],
      estimatedComplexity: "simple",
      timeToComplete: 5
    };
  }
}
