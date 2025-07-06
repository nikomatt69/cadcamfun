import { ApplicationContext, IntentAnalysis, ServiceType, ServiceCapabilities } from "../UnifiedAIOrchestrator";

export interface ServiceStrategy {
  primaryService: ServiceType;
  fallbackServices: ServiceType[];
  parameters: Record<string, any>;
  confidence: number;
}

export class ServiceRouter {
  private serviceCapabilities: Map<ServiceType, ServiceCapabilities>;

  constructor() {
    this.serviceCapabilities = new Map();
    this.initializeServiceCapabilities();
  }

  /**
   * Determine the best service strategy for a given intent and context
   */
  async determineStrategy(
    intent: IntentAnalysis,
    context: ApplicationContext,
    forceService?: ServiceType
  ): Promise<ServiceStrategy> {
    try {
      // If a specific service is forced, use it
      if (forceService) {
        return this.createForcedStrategy(forceService, intent, context);
      }

      // Analyze intent and context to determine optimal service
      const strategy = this.analyzeServiceRequirements(intent, context);

      return strategy;
    } catch (error) {
      console.error("Service routing error:", error);
      return this.getFallbackStrategy(intent);
    }
  }

  /**
   * Analyze intent and context to determine optimal service strategy
   */
  private analyzeServiceRequirements(intent: IntentAnalysis, context: ApplicationContext): ServiceStrategy {
    let primaryService: ServiceType = "unifiedAI";
    let fallbackServices: ServiceType[] = [];
    let confidence = 0.8;
    const parameters: Record<string, any> = {};

    // Route based on primary intent
    switch (intent.primaryIntent) {
      case "create":
        primaryService = this.selectCreationService(intent, context);
        fallbackServices = ["contextAware", "unifiedAI"];
        parameters.generationMode = "progressive";
        break;

      case "modify":
        primaryService = "unifiedAI";
        fallbackServices = ["contextAware"];
        parameters.operationType = "modification";
        break;

      case "analyze":
        primaryService = this.selectAnalysisService(intent, context);
        fallbackServices = ["unifiedAI"];
        parameters.analysisDepth = "comprehensive";
        break;

      case "optimize":
        primaryService = this.selectOptimizationService(intent, context);
        fallbackServices = ["unifiedAI"];
        parameters.optimizationGoals = ["performance", "quality"];
        break;

      case "export":
        primaryService = "unifiedAI";
        fallbackServices = ["actionService"];
        parameters.exportFormat = "auto";
        break;

      default:
        primaryService = "unifiedAI";
        fallbackServices = [];
        confidence = 0.6;
    }

    // Adjust based on context dependency
    if (intent.contextDependency === "high" && context.elements.total.length > 0) {
      if (primaryService === "unifiedAI") {
        primaryService = "contextAware";
        fallbackServices = ["unifiedAI", ...fallbackServices];
      }
      confidence += 0.1;
    }

    // Consider performance and reliability
    const serviceReliability = this.getServiceReliability(primaryService);
    confidence *= serviceReliability;

    return {
      primaryService,
      fallbackServices: this.deduplicateServices(fallbackServices),
      parameters,
      confidence
    };
  }

  /**
   * Select appropriate service for creation tasks
   */
  private selectCreationService(intent: IntentAnalysis, context: ApplicationContext): ServiceType {
    // If no existing elements, use text-to-CAD stream for progressive generation
    if (context.elements.total.length === 0) {
      return "textToCADStream";
    }

    // If existing elements and high context dependency, use contextual generation
    if (intent.contextDependency === "high") {
      return "contextAware";
    }

    // Default to unified service for balanced approach
    return "unifiedAI";
  }

  /**
   * Select appropriate service for analysis tasks
   */
  private selectAnalysisService(intent: IntentAnalysis, context: ApplicationContext): ServiceType {
    // If CAM context with G-code, prefer G-code service
    if (context.page.section === "cam" && context.gcode) {
      return "gcodeService";
    }

    // If complex CAD design, use unified service with advanced analysis
    if (context.elements.total.length > 20) {
      return "unifiedAI";
    }

    // Default to unified for general analysis
    return "unifiedAI";
  }

  /**
   * Select appropriate service for optimization tasks
   */
  private selectOptimizationService(intent: IntentAnalysis, context: ApplicationContext): ServiceType {
    // CAM optimization
    if (context.page.section === "cam" || context.gcode) {
      return "gcodeService";
    }

    // Progressive optimization for complex designs
    if (context.elements.total.length > 15) {
      return "progressive";
    }

    // Default to unified
    return "unifiedAI";
  }

  /**
   * Create strategy for forced service
   */
  private createForcedStrategy(
    service: ServiceType,
    intent: IntentAnalysis,
    context: ApplicationContext
  ): ServiceStrategy {
    const capabilities = this.serviceCapabilities.get(service);
    const fallbackServices = this.getCompatibleFallbacks(service, intent);

    return {
      primaryService: service,
      fallbackServices,
      parameters: {
        forcedService: true,
        originalIntent: intent.primaryIntent
      },
      confidence: capabilities?.reliability || 0.8
    };
  }

  /**
   * Get compatible fallback services for a primary service
   */
  private getCompatibleFallbacks(service: ServiceType, intent: IntentAnalysis): ServiceType[] {
    const fallbacks: ServiceType[] = [];

    // Always include unified as ultimate fallback if not primary
    if (service !== "unifiedAI") {
      fallbacks.push("unifiedAI");
    }

    // Add intent-specific fallbacks
    switch (intent.primaryIntent) {
      case "create":
        if (service !== "contextAware") fallbacks.unshift("contextAware");
        if (service !== "textToCADStream") fallbacks.unshift("textToCADStream");
        break;

      case "analyze":
      case "optimize":
        if (service !== "actionService") fallbacks.push("actionService");
        break;
    }

    return this.deduplicateServices(fallbacks);
  }

  /**
   * Get fallback strategy when primary routing fails
   */
  private getFallbackStrategy(intent: IntentAnalysis): ServiceStrategy {
    return {
      primaryService: "unifiedAI",
      fallbackServices: ["actionService"],
      parameters: {
        fallbackMode: true,
        originalIntent: intent.primaryIntent
      },
      confidence: 0.5
    };
  }

  /**
   * Get service reliability score
   */
  private getServiceReliability(service: ServiceType): number {
    const capabilities = this.serviceCapabilities.get(service);
    return capabilities?.reliability || 0.8;
  }

  /**
   * Remove duplicate services from array
   */
  private deduplicateServices(services: ServiceType[]): ServiceType[] {
    return Array.from(new Set(services));
  }

  /**
   * Initialize service capabilities registry
   */
  private initializeServiceCapabilities(): void {
    this.serviceCapabilities.set("textToCADStream", {
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
      optimalFor: ["progressive_generation", "streaming_creation"],
      averageResponseTime: 15000,
      reliability: 0.85
    });

    this.serviceCapabilities.set("unifiedAI", {
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
      optimalFor: ["general_purpose", "balanced_approach"],
      averageResponseTime: 8000,
      reliability: 0.92
    });

    this.serviceCapabilities.set("contextAware", {
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
      optimalFor: ["contextual_generation", "existing_design_extension"],
      averageResponseTime: 12000,
      reliability: 0.9
    });

    this.serviceCapabilities.set("gcodeService", {
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
      optimalFor: ["gcode_operations", "cam_optimization"],
      averageResponseTime: 10000,
      reliability: 0.87
    });

    this.serviceCapabilities.set("actionService", {
      type: "actionService",
      supports: {
        streaming: false,
        images: false,
        cad: true,
        cam: false,
        gcode: false,
        analysis: false,
        generation: false,
        optimization: false
      },
      optimalFor: ["direct_actions", "element_manipulation"],
      averageResponseTime: 5000,
      reliability: 0.95
    });

    this.serviceCapabilities.set("progressive", {
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
      optimalFor: ["complex_tasks", "multi_step_operations"],
      averageResponseTime: 25000,
      reliability: 0.88
    });
  }

  /**
   * Get available services for specific capabilities
   */
  getServicesForCapability(capability: keyof ServiceCapabilities["supports"]): ServiceType[] {
    const services: ServiceType[] = [];

    this.serviceCapabilities.forEach((caps, serviceType) => {
      if (caps.supports[capability]) {
        services.push(serviceType);
      }
    });

    return services;
  }

  /**
   * Get service performance metrics
   */
  getServiceMetrics(serviceType: ServiceType): ServiceCapabilities | null {
    return this.serviceCapabilities.get(serviceType) || null;
  }
}
