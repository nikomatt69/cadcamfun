// src/lib/ai/camActionHandler.ts
import { v4 as uuidv4 } from "uuid";
import {
  Toolpath,
  Tool,
  Material,
  MachiningOperation,
  ToolpathAnalysis,
  GCodeAnalysis,
  CostEstimation
} from "../../types/CAMTypes";
import { unifiedAIService } from "./unifiedAIServiceCAM";
import { aiAnalytics } from "./ai-new/aiAnalytics";
import { aiConfigManager } from "./ai-new/aiConfigManager";

/**
 * Costanti per le azioni CAM
 */
export const CAM_ACTIONS = {
  ANALYZE_TOOLPATH: "ANALYZE_TOOLPATH",
  OPTIMIZE_TOOLPATH: "OPTIMIZE_TOOLPATH",
  ANALYZE_TOOL: "ANALYZE_TOOL",
  OPTIMIZE_TOOL: "OPTIMIZE_TOOL",
  ANALYZE_MATERIAL: "ANALYZE_MATERIAL",
  CALCULATE_COST: "CALCULATE_COST",
  ANALYZE_GCODE: "ANALYZE_GCODE",
  OPTIMIZE_GCODE: "OPTIMIZE_GCODE",
  SIMULATE_MACHINING: "SIMULATE_MACHINING",
  GENERATE_REPORT: "GENERATE_REPORT",
  GENERATE_GCODE_FROM_TEXT: "GENERATE_GCODE_FROM_TEXT",
  ENHANCE_GCODE: "ENHANCE_GCODE",
  CONVERT_GCODE: "CONVERT_GCODE"
} as const;

/**
 * Type for CAM action types
 */
export type CAMActionType = (typeof CAM_ACTIONS)[keyof typeof CAM_ACTIONS];

/**
 * Properly typed CAM actions with discriminated union pattern
 */
export type CAMAction =
  | { type: typeof CAM_ACTIONS.ANALYZE_TOOLPATH; payload: Toolpath }
  | {
      type: typeof CAM_ACTIONS.OPTIMIZE_TOOLPATH;
      payload: { toolpath: Toolpath; goals?: ("time" | "quality" | "tool_life" | "cost")[] };
    }
  | {
      type: typeof CAM_ACTIONS.ANALYZE_TOOL;
      payload: { tool: Tool; material?: Material; operation?: MachiningOperation };
    }
  | {
      type: typeof CAM_ACTIONS.OPTIMIZE_TOOL;
      payload: { toolpath: Toolpath; currentTool: Tool; availableTools?: Tool[] };
    }
  | {
      type: typeof CAM_ACTIONS.ANALYZE_MATERIAL;
      payload: { material: Material; tools?: Tool[]; operation?: MachiningOperation };
    }
  | {
      type: typeof CAM_ACTIONS.CALCULATE_COST;
      payload: { toolpath: Toolpath; tool: Tool; material?: Material; rates?: { machine: number; labor: number } };
    }
  | { type: typeof CAM_ACTIONS.ANALYZE_GCODE; payload: { gcode: string; tool?: Tool; material?: Material } }
  | {
      type: typeof CAM_ACTIONS.OPTIMIZE_GCODE;
      payload: {
        gcode: string;
        tool?: Tool;
        material?: Material;
        goals?: ("time" | "quality" | "tool_life" | "cost")[];
      };
    }
  | { type: typeof CAM_ACTIONS.SIMULATE_MACHINING; payload: { toolpath: Toolpath; tool: Tool; material?: Material } }
  | {
      type: typeof CAM_ACTIONS.GENERATE_REPORT;
      payload: { analyses: (ToolpathAnalysis | GCodeAnalysis | CostEstimation)[] };
    }
  | {
      type: typeof CAM_ACTIONS.GENERATE_GCODE_FROM_TEXT;
      payload: { description: string; tool?: Tool; material?: Material; machineConfig?: any };
    }
  | {
      type: typeof CAM_ACTIONS.ENHANCE_GCODE;
      payload: {
        gcode: string;
        enhancementGoal: "safety" | "efficiency" | "quality" | "all";
        tool?: Tool;
        material?: Material;
      };
    }
  | {
      type: typeof CAM_ACTIONS.CONVERT_GCODE;
      payload: { gcode: string; sourceController: string; targetController: string };
    };

/**
 * Handler per le azioni CAM
 */
export class CAMActionHandler {
  /**
   * Gestisce un'azione CAM in base al tipo
   */
  async handleAction(action: CAMAction): Promise<any> {
    try {
      console.log("Handling CAM action:", action.type);

      // Traccia l'azione per analytics
      aiAnalytics.trackEvent({
        eventType: "cam_action",
        eventName: action.type,
        metadata: { actionType: action.type }
      });

      switch (action.type) {
        case CAM_ACTIONS.ANALYZE_TOOLPATH:
          return await this.analyzeToolpath(action.payload);

        case CAM_ACTIONS.OPTIMIZE_TOOLPATH:
          return await this.optimizeToolpath(action.payload.toolpath, action.payload.goals);

        case CAM_ACTIONS.ANALYZE_TOOL:
          return await this.analyzeTool(action.payload.tool, action.payload.material, action.payload.operation);

        case CAM_ACTIONS.OPTIMIZE_TOOL:
          return await this.optimizeTool(
            action.payload.toolpath,
            action.payload.currentTool,
            action.payload.availableTools
          );

        case CAM_ACTIONS.ANALYZE_MATERIAL:
          return await this.analyzeMaterial(action.payload.material, action.payload.tools, action.payload.operation);

        case CAM_ACTIONS.CALCULATE_COST:
          return await this.calculateCost(
            action.payload.toolpath,
            action.payload.tool,
            action.payload.material,
            action.payload.rates
          );

        case CAM_ACTIONS.ANALYZE_GCODE:
          return await this.analyzeGCode(action.payload.gcode, action.payload.tool, action.payload.material);

        case CAM_ACTIONS.OPTIMIZE_GCODE:
          return await this.optimizeGCode(
            action.payload.gcode,
            action.payload.tool,
            action.payload.material,
            action.payload.goals
          );

        case CAM_ACTIONS.SIMULATE_MACHINING:
          return await this.simulateMachining(action.payload.toolpath, action.payload.tool, action.payload.material);

        case CAM_ACTIONS.GENERATE_REPORT:
          return await this.generateReport(action.payload.analyses);

        case CAM_ACTIONS.GENERATE_GCODE_FROM_TEXT:
          return await this.generateGCodeFromText(
            action.payload.description,
            action.payload.tool,
            action.payload.material,
            action.payload.machineConfig
          );

        case CAM_ACTIONS.ENHANCE_GCODE:
          return await this.enhanceGCode(
            action.payload.gcode,
            action.payload.enhancementGoal,
            action.payload.tool,
            action.payload.material
          );

        case CAM_ACTIONS.CONVERT_GCODE:
          return await this.convertGCode(
            action.payload.gcode,
            action.payload.sourceController,
            action.payload.targetController
          );

        default:
          throw new Error(`Unknown action type: ${action as CAMActionType}`);
      }
    } catch (error) {
      console.error("Error handling CAM action:", error);
      throw error;
    }
  }

  /**
   * Analizza un percorso utensile per identificare problemi e suggerire miglioramenti
   */
  async analyzeToolpath(toolpath: Toolpath): Promise<ToolpathAnalysis> {
    // Delegare l'analisi al servizio AI unificato
    const response = await (unifiedAIService as any).analyzeToolpath(toolpath);

    if (!response.success || !response.data) {
      throw new Error(`Errore nell'analisi del percorso utensile: ${response.error || "Errore sconosciuto"}`);
    }

    // Restituisci i dati dell'analisi
    return {
      id: uuidv4(),
      toolpathId: toolpath.id,
      ...response.data
    };
  }

  /**
   * Ottimizza un percorso utensile in base a obiettivi specifici
   */
  async optimizeToolpath(toolpath: Toolpath, goals?: ("time" | "quality" | "tool_life" | "cost")[]): Promise<Toolpath> {
    // Imposta gli obiettivi predefiniti se non specificati
    const optimizationGoals = goals || ["time", "quality"];

    // Delegare l'ottimizzazione al servizio AI unificato
    const response = await (unifiedAIService as any).optimizeToolpath(toolpath, optimizationGoals);

    if (!response.success || !response.data) {
      throw new Error(`Errore nell'ottimizzazione del percorso utensile: ${response.error || "Errore sconosciuto"}`);
    }

    // Restituisci il percorso utensile ottimizzato
    return {
      ...toolpath,
      ...response.data,
      id: uuidv4(), // Genera un nuovo ID per il percorso ottimizzato
      name: `${toolpath.name} (Ottimizzato)`,
      metadata: {
        ...toolpath.metadata,
        originalToolpathId: toolpath.id,
        optimizationGoals,
        optimizedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Analizza un utensile per verificarne l'adeguatezza per un materiale/operazione
   */
  async analyzeTool(tool: Tool, material?: Material, operation?: MachiningOperation): Promise<any> {
    // Delegare l'analisi al servizio AI unificato
    const response = await (unifiedAIService as any).analyzeTool(tool, material, operation);

    if (!response.success || !response.data) {
      throw new Error(`Errore nell'analisi dell'utensile: ${response.error || "Errore sconosciuto"}`);
    }

    // Restituisci i dati dell'analisi
    return {
      id: uuidv4(),
      toolId: tool.id,
      ...response.data
    };
  }

  /**
   * Suggerisce l'utensile migliore tra quelli disponibili per un percorso utensile
   */
  async optimizeTool(toolpath: Toolpath, currentTool: Tool, availableTools?: Tool[]): Promise<any> {
    // Delegare l'ottimizzazione al servizio AI unificato
    const response = await (unifiedAIService as any).optimizeTool(toolpath, currentTool, availableTools);

    if (!response.success || !response.data) {
      throw new Error(`Errore nell'ottimizzazione dell'utensile: ${response.error || "Errore sconosciuto"}`);
    }

    // Restituisci i dati dell'ottimizzazione
    return {
      id: uuidv4(),
      toolpathId: toolpath.id,
      currentToolId: currentTool.id,
      ...response.data
    };
  }

  /**
   * Analizza un materiale per verificarne le caratteristiche di lavorazione
   */
  async analyzeMaterial(material: Material, tools?: Tool[], operation?: MachiningOperation): Promise<any> {
    // Delegare l'analisi al servizio AI unificato
    const response = await (unifiedAIService as any).analyzeMaterial(material, tools, operation);

    if (!response.success || !response.data) {
      throw new Error(`Errore nell'analisi del materiale: ${response.error || "Errore sconosciuto"}`);
    }

    // Restituisci i dati dell'analisi
    return {
      id: uuidv4(),
      materialId: material.id,
      ...response.data
    };
  }

  /**
   * Calcola i costi di lavorazione per un percorso utensile
   */
  async calculateCost(
    toolpath: Toolpath,
    tool: Tool,
    material?: Material,
    rates?: { machine: number; labor: number }
  ): Promise<CostEstimation> {
    // Ottieni le tariffe predefinite da aiConfigManager se non specificate
    const config = aiConfigManager.getConfig();
    const defaultRates = {
      machine: 50, // Esempio: 50€/ora per la macchina
      labor: 30 // Esempio: 30€/ora per la manodopera
    };

    const costRates = rates || defaultRates;

    // Delegare il calcolo al servizio AI unificato
    const response = await (unifiedAIService as any).calculateMachiningCost(toolpath, tool, material, costRates);

    if (!response.success || !response.data) {
      throw new Error(`Errore nel calcolo dei costi: ${response.error || "Errore sconosciuto"}`);
    }

    // Restituisci i dati dell'analisi dei costi
    return {
      id: uuidv4(),
      toolpathId: toolpath.id,
      ...response.data
    };
  }

  /**
   * Analizza un file G-code per verificarne la correttezza e l'efficienza
   */
  async analyzeGCode(gcode: string, tool?: Tool, material?: Material): Promise<GCodeAnalysis> {
    // Delegare l'analisi al servizio AI unificato
    const response = await (unifiedAIService as any).analyzeGCode(gcode, tool, material);

    if (!response.success || !response.data) {
      throw new Error(`Errore nell'analisi del G-code: ${response.error || "Errore sconosciuto"}`);
    }

    // Restituisci i dati dell'analisi
    return {
      id: uuidv4(),
      ...response.data
    };
  }

  /**
   * Ottimizza un file G-code in base a obiettivi specifici
   */
  async optimizeGCode(
    gcode: string,
    tool?: Tool,
    material?: Material,
    goals?: ("time" | "quality" | "tool_life" | "cost")[]
  ): Promise<string> {
    // Imposta gli obiettivi predefiniti se non specificati
    const optimizationGoals = goals || ["time"];

    // Utilizziamo il metodo esistente per ottimizzare il G-code
    const response = await (unifiedAIService as any).optimizeGCode(
      gcode,
      tool?.type || "generic",
      material?.name || "unknown",
      {
        optimizationGoals,
        toolData: tool || {},
        materialData: material || {}
      }
    );

    if (!response.success || !response.data) {
      throw new Error(`Errore nell'ottimizzazione del G-code: ${response.error || "Errore sconosciuto"}`);
    }

    // Restituisci il G-code ottimizzato
    return response.data;
  }

  /**
   * Simula l'esecuzione di un percorso utensile con un utensile specifico
   */
  async simulateMachining(toolpath: Toolpath, tool: Tool, material?: Material): Promise<any> {
    // Nota: questa funzione dipende da una simulazione reale che dovrebbe essere implementata altrove
    // Per ora, restituiamo una simulazione semplificata con dati di esempio

    // Calcola tempo stimato basato sui punti del percorso
    const rapidSpeed = 5000; // mm/min
    const cuttingSpeed = toolpath.operation.feedRate;

    let totalTime = 0;
    let totalDistance = 0;

    for (let i = 1; i < toolpath.points.length; i++) {
      const p1 = toolpath.points[i - 1];
      const p2 = toolpath.points[i];

      // Calcola la distanza tra i punti
      const distance = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2) + Math.pow(p2.z - p1.z, 2));

      totalDistance += distance;

      // Calcola il tempo in base al tipo di movimento
      const speed = p2.type === "rapid" ? rapidSpeed : p2.feedRate || cuttingSpeed;
      const timeMinutes = distance / speed;

      totalTime += timeMinutes * 60; // converti in secondi
    }

    return {
      id: uuidv4(),
      toolpathId: toolpath.id,
      simulationResults: {
        totalTime, // secondi
        totalDistance, // mm
        estimatedTotalCost: (totalTime / 3600) * 50, // Esempio: 50€/ora
        toolWear: Math.min(100, (totalDistance / 1000) * 5), // Percentuale di usura dell'utensile (esempio)
        collisions: [], // Un sistema reale dovrebbe rilevare le collisioni
        warnings: [], // Avvisi vari durante la simulazione
        success: true
      }
    };
  }

  /**
   * Genera un report basato su diverse analisi
   */
  async generateReport(analyses: (ToolpathAnalysis | GCodeAnalysis | CostEstimation)[]): Promise<any> {
    // Questo potrebbe generare un report in formato PDF, HTML, o JSON
    // Per ora, restituiamo un oggetto con un riassunto delle analisi

    // Ottiene un estratto dalle varie analisi
    const toolpathAnalyses = analyses.filter(a => "toolpathId" in a && "efficiency" in a) as ToolpathAnalysis[];
    const gcodeAnalyses = analyses.filter(a => "lineCount" in a) as GCodeAnalysis[];
    const costEstimations = analyses.filter(a => "totalCost" in a) as CostEstimation[];

    // Calcola statistiche complessive
    const totalMachiningTime =
      toolpathAnalyses.reduce((sum, a) => sum + a.machiningTime, 0) +
      gcodeAnalyses.reduce((sum, a) => sum + a.estimatedMachiningTime, 0);

    const totalCost = costEstimations.reduce((sum, a) => sum + a.totalCost, 0);

    const avgEfficiency =
      toolpathAnalyses.length > 0
        ? toolpathAnalyses.reduce((sum, a) => sum + a.efficiency, 0) / toolpathAnalyses.length
        : 0;

    const avgQuality =
      toolpathAnalyses.length > 0
        ? toolpathAnalyses.reduce((sum, a) => sum + a.quality, 0) / toolpathAnalyses.length
        : 0;

    // Raccoglie tutti gli avvisi e gli errori
    const issues = [
      ...toolpathAnalyses.flatMap(a => a.issues),
      ...gcodeAnalyses.flatMap(a => a.errors),
      ...gcodeAnalyses.flatMap(a => a.warnings)
    ];

    // Raccoglie tutti i suggerimenti di ottimizzazione
    const recommendations = [
      ...toolpathAnalyses.flatMap(a => a.recommendations),
      ...gcodeAnalyses.flatMap(a => a.optimization.recommendations)
    ];

    return {
      id: uuidv4(),
      generatedAt: new Date().toISOString(),
      summary: {
        totalMachiningTime,
        totalCost,
        avgEfficiency,
        avgQuality,
        issuesCount: issues.length,
        recommendationsCount: recommendations.length
      },
      toolpathAnalysesSummary: toolpathAnalyses.map(a => ({
        id: a.id,
        toolpathId: a.toolpathId,
        efficiency: a.efficiency,
        quality: a.quality,
        machiningTime: a.machiningTime,
        issuesCount: a.issues.length
      })),
      gcodeAnalysesSummary: gcodeAnalyses.map(a => ({
        id: a.id,
        fileSize: a.fileSize,
        lineCount: a.lineCount,
        estimatedMachiningTime: a.estimatedMachiningTime,
        errorsCount: a.errors.length,
        warningsCount: a.warnings.length
      })),
      costEstimationsSummary: costEstimations.map(a => ({
        id: a.id,
        toolpathId: a.toolpathId,
        totalCost: a.totalCost,
        machiningTime: a.machiningTime,
        setupTime: a.setupTime
      })),
      topIssues: issues
        .sort((a, b) => {
          const severityRank = { "low": 1, "medium": 2, "high": 3, "critical": 4, "warning": 1, "error": 3 };
          return (
            (severityRank[(b as any).severity as keyof typeof severityRank] || 0) -
            (severityRank[(a as any).severity as keyof typeof severityRank] || 0)
          );
        })
        .slice(0, 10),
      topRecommendations: recommendations
        .sort((a, b) => ("confidence" in b ? b.confidence : 0) - ("confidence" in a ? a.confidence : 0))
        .slice(0, 10)
    };
  }

  /**
   * Genera G-code da una descrizione testuale
   */
  async generateGCodeFromText(
    description: string,
    tool?: Tool,
    material?: Material,
    machineConfig?: any
  ): Promise<any> {
    try {
      console.log("Generating G-code from text description");

      const result = await unifiedAIService.generateGCodeFromText(description, tool, material, machineConfig);

      if (!result.success) {
        throw new Error(result.error || "Failed to generate G-code from text");
      }

      return result.data;
    } catch (error) {
      console.error("Error generating G-code from text:", error);
      throw error;
    }
  }

  /**
   * Migliora un G-code esistente con AI
   */
  async enhanceGCode(
    gcode: string,
    enhancementGoal: "safety" | "efficiency" | "quality" | "all",
    tool?: Tool,
    material?: Material
  ): Promise<any> {
    try {
      console.log("Enhancing G-code with AI");

      const result = await unifiedAIService.enhanceGCodeWithAI(gcode, enhancementGoal, tool, material);

      if (!result.success) {
        throw new Error(result.error || "Failed to enhance G-code");
      }

      return result.data;
    } catch (error) {
      console.error("Error enhancing G-code:", error);
      throw error;
    }
  }

  /**
   * Converte un G-code tra diversi controller
   */
  async convertGCode(gcode: string, sourceController: string, targetController: string): Promise<any> {
    try {
      console.log(`Converting G-code from ${sourceController} to ${targetController}`);

      const result = await unifiedAIService.convertGCodeForMachine(gcode, sourceController, targetController);

      if (!result.success) {
        throw new Error(result.error || "Failed to convert G-code");
      }

      return result.data;
    } catch (error) {
      console.error("Error converting G-code:", error);
      throw error;
    }
  }
}

// Esporta un'istanza singleton
export const camActionHandler = new CAMActionHandler();
