import { ApplicationContext, IntentAnalysis } from "../UnifiedAIOrchestrator";

export interface ToolSelection {
  tools: string[];
  reasoning: string;
  priority: "high" | "medium" | "low";
}

export class ToolSelector {
  /**
   * Select appropriate tools based on intent and context
   */
  async selectTools(intent: IntentAnalysis, context: ApplicationContext): Promise<string[]> {
    try {
      const selection = this.analyzeToolRequirements(intent, context);
      return selection.tools;
    } catch (error) {
      console.error("Error selecting tools:", error);
      return this.getDefaultTools(intent);
    }
  }

  /**
   * Get detailed tool selection with reasoning
   */
  async selectToolsWithReasoning(intent: IntentAnalysis, context: ApplicationContext): Promise<ToolSelection> {
    try {
      return this.analyzeToolRequirements(intent, context);
    } catch (error) {
      console.error("Error selecting tools with reasoning:", error);
      return {
        tools: this.getDefaultTools(intent),
        reasoning: "Using default tools due to analysis error",
        priority: "medium"
      };
    }
  }

  /**
   * Analyze tool requirements based on intent and context
   */
  private analyzeToolRequirements(intent: IntentAnalysis, context: ApplicationContext): ToolSelection {
    const tools: string[] = [];
    let reasoning = "";
    let priority: "high" | "medium" | "low" = "medium";

    // Intent-based tool selection
    switch (intent.primaryIntent) {
      case "create":
        const createTools = this.getCreationTools(intent, context);
        tools.push(...createTools.tools);
        reasoning += createTools.reasoning;
        priority = createTools.priority;
        break;

      case "modify":
        const modifyTools = this.getModificationTools(intent, context);
        tools.push(...modifyTools.tools);
        reasoning += modifyTools.reasoning;
        priority = modifyTools.priority;
        break;

      case "analyze":
        const analyzeTools = this.getAnalysisTools(intent, context);
        tools.push(...analyzeTools.tools);
        reasoning += analyzeTools.reasoning;
        priority = analyzeTools.priority;
        break;

      case "optimize":
        const optimizeTools = this.getOptimizationTools(intent, context);
        tools.push(...optimizeTools.tools);
        reasoning += optimizeTools.reasoning;
        priority = optimizeTools.priority;
        break;

      case "export":
        const exportTools = this.getExportTools(intent, context);
        tools.push(...exportTools.tools);
        reasoning += exportTools.reasoning;
        priority = exportTools.priority;
        break;

      case "learn":
      case "chat":
        const chatTools = this.getChatTools(intent, context);
        tools.push(...chatTools.tools);
        reasoning += chatTools.reasoning;
        priority = chatTools.priority;
        break;
    }

    // Context-based tool additions
    const contextTools = this.getContextBasedTools(context);
    tools.push(...contextTools.tools);
    reasoning += contextTools.reasoning;

    // Remove duplicates and sort by priority
    const uniqueTools = Array.from(new Set(tools));
    const prioritizedTools = this.prioritizeTools(uniqueTools, intent, context);

    return {
      tools: prioritizedTools,
      reasoning,
      priority
    };
  }

  /**
   * Get tools for creation tasks
   */
  private getCreationTools(
    intent: IntentAnalysis,
    context: ApplicationContext
  ): { tools: string[]; reasoning: string; priority: "high" | "medium" | "low" } {
    const tools: string[] = [];
    let reasoning = "Creation task detected. ";
    let priority: "high" | "medium" | "low" = "high";

    // Basic creation tools
    tools.push("generateCADElement", "validateGeometry", "positionElement");

    if (context.elements.total.length === 0) {
      // First element creation
      tools.push("initializeCanvas", "setDefaultUnits");
      reasoning += "Starting with empty canvas, adding initialization tools. ";
    } else {
      // Adding to existing design
      tools.push("analyzeExistingElements", "checkInterferences", "maintainDesignConsistency");
      reasoning += "Adding to existing design, including relationship analysis tools. ";
    }

    // Target element specific tools
    if (intent.targetElements && intent.targetElements.length > 0) {
      for (const elementType of intent.targetElements) {
        switch (elementType) {
          case "cube":
          case "sphere":
          case "cylinder":
            tools.push("createPrimitive");
            break;
          case "spline":
          case "curve":
            tools.push("createCurve", "interpolatePoints");
            break;
          case "assembly":
            tools.push("createAssembly", "defineConstraints");
            priority = "high";
            break;
        }
      }
      reasoning += `Specific element types detected: ${intent.targetElements.join(", ")}. `;
    }

    // Complexity-based tools
    if (intent.estimatedComplexity === "complex") {
      tools.push("progressiveGeneration", "iterativeRefinement", "qualityValidation");
      priority = "high";
      reasoning += "Complex task requires progressive generation tools. ";
    }

    return { tools, reasoning, priority };
  }

  /**
   * Get tools for modification tasks
   */
  private getModificationTools(
    intent: IntentAnalysis,
    context: ApplicationContext
  ): { tools: string[]; reasoning: string; priority: "high" | "medium" | "low" } {
    const tools: string[] = [];
    let reasoning = "Modification task detected. ";
    let priority: "high" | "medium" | "low" = "medium";

    // Basic modification tools
    tools.push("updateElement", "validateChanges", "preserveRelationships");

    if (context.elements.selected.length > 0) {
      tools.push("modifySelected", "updateProperties");
      reasoning += `Modifying ${context.elements.selected.length} selected elements. `;
      priority = "high";

      if (context.elements.selected.length > 1) {
        tools.push("batchModification", "maintainSymmetry");
        reasoning += "Batch modification tools for multiple elements. ";
      }
    } else {
      tools.push("selectTarget", "identifyModificationTarget");
      reasoning += "No elements selected, adding target identification tools. ";
    }

    // Relationship preservation
    if (context.elements.total.length > 5) {
      tools.push("analyzeImpact", "updateDependents", "validateDesignIntegrity");
      reasoning += "Complex design requires relationship analysis tools. ";
    }

    return { tools, reasoning, priority };
  }

  /**
   * Get tools for analysis tasks
   */
  private getAnalysisTools(
    intent: IntentAnalysis,
    context: ApplicationContext
  ): { tools: string[]; reasoning: string; priority: "high" | "medium" | "low" } {
    const tools: string[] = [];
    let reasoning = "Analysis task detected. ";
    let priority: "high" | "medium" | "low" = "medium";

    // Basic analysis tools
    tools.push("analyzeGeometry", "generateReport", "identifyIssues");

    // Design-specific analysis
    if (context.elements.total.length > 0) {
      tools.push("structuralAnalysis", "interferenceCheck", "dimensionalAnalysis");
      reasoning += "Design analysis tools for existing elements. ";

      if (context.elements.total.length > 10) {
        tools.push("performanceAnalysis", "complexityMetrics");
        reasoning += "Complex design requires advanced analysis. ";
        priority = "high";
      }
    }

    // Manufacturing analysis
    if (context.page.section === "cam" || context.page.mode === "manufacturing") {
      tools.push("manufacturabilityAnalysis", "toolpathValidation", "machiningSimulation");
      reasoning += "Manufacturing context requires CAM analysis tools. ";
      priority = "high";
    }

    // G-code analysis
    if (context.gcode) {
      tools.push("gcodeAnalysis", "syntaxCheck", "motionAnalysis");
      reasoning += "G-code present, adding code analysis tools. ";

      if (context.gcode.errors.length > 0) {
        tools.push("errorDiagnosis", "fixRecommendations");
        reasoning += `${context.gcode.errors.length} errors detected, adding diagnostic tools. `;
        priority = "high";
      }
    }

    return { tools, reasoning, priority };
  }

  /**
   * Get tools for optimization tasks
   */
  private getOptimizationTools(
    intent: IntentAnalysis,
    context: ApplicationContext
  ): { tools: string[]; reasoning: string; priority: "high" | "medium" | "low" } {
    const tools: string[] = [];
    let reasoning = "Optimization task detected. ";
    let priority: "high" | "medium" | "low" = "high";

    // Basic optimization tools
    tools.push("optimizeGeometry", "performanceMetrics", "compareAlternatives");

    // Design optimization
    if (context.page.section === "cad") {
      tools.push("topologyOptimization", "weightReduction", "strengthAnalysis");
      reasoning += "CAD optimization tools for design refinement. ";
    }

    // Manufacturing optimization
    if (context.page.section === "cam" || context.gcode) {
      tools.push("toolpathOptimization", "speedFeedOptimization", "toolLifeOptimization");
      reasoning += "CAM optimization tools for manufacturing efficiency. ";

      if (context.gcode) {
        tools.push("gcodeOptimization", "motionSmoothing", "cycleTimeReduction");
        reasoning += "G-code optimization for better machining performance. ";
      }
    }

    // Material optimization
    tools.push("materialSelection", "costOptimization");

    return { tools, reasoning, priority };
  }

  /**
   * Get tools for export tasks
   */
  private getExportTools(
    intent: IntentAnalysis,
    context: ApplicationContext
  ): { tools: string[]; reasoning: string; priority: "high" | "medium" | "low" } {
    const tools: string[] = [];
    let reasoning = "Export task detected. ";
    let priority: "high" | "medium" | "low" = "medium";

    // Basic export tools
    tools.push("formatSelection", "exportValidation", "fileGeneration");

    if (context.elements.total.length > 0) {
      tools.push("geometryExport", "metadataPreservation");
      reasoning += "Design elements available for export. ";
    }

    if (context.gcode) {
      tools.push("gcodeExport", "postProcessing");
      reasoning += "G-code available for export. ";
    }

    // Quality checks for export
    tools.push("qualityCheck", "compatibilityValidation");

    return { tools, reasoning, priority };
  }

  /**
   * Get tools for chat/learning tasks
   */
  private getChatTools(
    intent: IntentAnalysis,
    context: ApplicationContext
  ): { tools: string[]; reasoning: string; priority: "high" | "medium" | "low" } {
    const tools: string[] = [];
    let reasoning = "Chat/learning task detected. ";
    let priority: "high" | "medium" | "low" = "low";

    // Basic communication tools
    tools.push("contextualResponse", "educationalContent", "suggestionGeneration");

    // Skill level adaptation
    if (context.user.skillLevel === "beginner") {
      tools.push("simplifiedExplanation", "stepByStepGuidance", "basicConcepts");
      reasoning += "Beginner level requires educational tools. ";
    } else if (context.user.skillLevel === "expert") {
      tools.push("advancedTechniques", "optimizationTips", "bestPractices");
      reasoning += "Expert level requires advanced guidance. ";
    }

    // Context-aware help
    if (context.elements.total.length > 0) {
      tools.push("designSpecificHelp", "currentStateAnalysis");
      reasoning += "Design context available for specific help. ";
    }

    return { tools, reasoning, priority };
  }

  /**
   * Get context-based additional tools
   */
  private getContextBasedTools(context: ApplicationContext): { tools: string[]; reasoning: string } {
    const tools: string[] = [];
    let reasoning = "Context-based additions: ";

    // User preference tools
    if (context.user.preferences.autoSuggestions) {
      tools.push("autoSuggestions");
      reasoning += "Auto-suggestions enabled. ";
    }

    // Viewport tools
    if (context.viewport.view !== "iso") {
      tools.push("viewportAlignment");
      reasoning += `Custom view (${context.viewport.view}) requires alignment. `;
    }

    // Session continuity tools
    if (context.session.totalActions > 10) {
      tools.push("sessionContext", "workflowContinuity");
      reasoning += "Extended session requires continuity tools. ";
    }

    // Error recovery tools
    const failureRate =
      context.session.totalActions > 0
        ? (context.session.totalActions - context.session.successfulOperations) / context.session.totalActions
        : 0;

    if (failureRate > 0.2) {
      tools.push("errorRecovery", "guidanceIntensification");
      reasoning += "High failure rate requires recovery tools. ";
    }

    return { tools, reasoning };
  }

  /**
   * Prioritize tools based on context
   */
  private prioritizeTools(tools: string[], intent: IntentAnalysis, context: ApplicationContext): string[] {
    const priorityMap: Record<string, number> = {};

    // Set base priorities
    tools.forEach(tool => {
      priorityMap[tool] = this.getToolBasePriority(tool);
    });

    // Adjust priorities based on intent
    this.adjustPrioritiesForIntent(priorityMap, intent);

    // Adjust priorities based on context
    this.adjustPrioritiesForContext(priorityMap, context);

    // Sort by priority (higher values first)
    return tools.sort((a, b) => (priorityMap[b] || 0) - (priorityMap[a] || 0));
  }

  /**
   * Get base priority for a tool
   */
  private getToolBasePriority(tool: string): number {
    const priorities: Record<string, number> = {
      // High priority tools
      "textToCAD": 100,
      "generateCADElement": 98,
      "validateGeometry": 95,
      "errorDiagnosis": 90,
      "qualityCheck": 85,

      // Medium priority tools
      "analyzeGeometry": 70,
      "optimizeGeometry": 75,
      "updateElement": 65,
      "exportValidation": 60,

      // Low priority tools
      "autoSuggestions": 30,
      "contextualResponse": 25,
      "educationalContent": 20
    };

    return priorities[tool] || 50; // Default medium priority
  }

  /**
   * Adjust tool priorities based on intent
   */
  private adjustPrioritiesForIntent(priorityMap: Record<string, number>, intent: IntentAnalysis): void {
    // Boost relevant tools for specific intents
    switch (intent.primaryIntent) {
      case "create":
        this.boostToolPriority(priorityMap, ["textToCAD", "validateGeometry", "positionElement"], 20);
        break;
      case "analyze":
        this.boostToolPriority(priorityMap, ["analyzeGeometry", "generateReport", "identifyIssues"], 25);
        break;
      case "optimize":
        this.boostToolPriority(priorityMap, ["optimizeGeometry", "performanceMetrics"], 30);
        break;
    }

    // Boost based on complexity
    if (intent.estimatedComplexity === "complex") {
      this.boostToolPriority(priorityMap, ["progressiveGeneration", "qualityValidation"], 15);
    }
  }

  /**
   * Adjust tool priorities based on context
   */
  private adjustPrioritiesForContext(priorityMap: Record<string, number>, context: ApplicationContext): void {
    // Boost based on user skill level
    if (context.user.skillLevel === "beginner") {
      this.boostToolPriority(priorityMap, ["stepByStepGuidance", "simplifiedExplanation"], 15);
    }

    // Boost based on errors
    if (context.gcode && context.gcode.errors.length > 0) {
      this.boostToolPriority(priorityMap, ["errorDiagnosis", "fixRecommendations"], 25);
    }

    // Boost based on selection
    if (context.elements.selected.length > 0) {
      this.boostToolPriority(priorityMap, ["modifySelected", "updateProperties"], 20);
    }
  }

  /**
   * Boost priority for specific tools
   */
  private boostToolPriority(priorityMap: Record<string, number>, tools: string[], boost: number): void {
    tools.forEach(tool => {
      if (tool in priorityMap) {
        priorityMap[tool] += boost;
      }
    });
  }

  /**
   * Get default tools for an intent
   */
  private getDefaultTools(intent: IntentAnalysis): string[] {
    const defaultTools = {
      create: ["textToCAD", "validateGeometry"],
      modify: ["updateElement", "validateChanges"],
      analyze: ["analyzeGeometry", "generateReport"],
      optimize: ["optimizeGeometry", "performanceMetrics"],
      export: ["formatSelection", "exportValidation"],
      learn: ["educationalContent", "contextualResponse"],
      chat: ["contextualResponse", "suggestionGeneration"],
      generate: ["textToCAD", "validateGeometry"]
    };

    return defaultTools[intent.primaryIntent] || defaultTools.chat;
  }
}
