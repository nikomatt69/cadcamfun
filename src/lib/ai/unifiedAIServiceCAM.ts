// src/lib/ai/unifiedAIServiceCAM.ts
// Estende UnifiedAIService con metodi CAM specifici

import {
  Toolpath,
  Tool,
  Material,
  MachiningOperation,
  ToolpathAnalysis,
  GCodeAnalysis,
  CostEstimation
} from "../../types/CAMTypes";
import { AIResponse } from "../../types/AITypes";

import { camAnalyzer } from "./cam-new/camAnalyzer";
import { toolpathOptimizer } from "./cam-new/toolpathOptimizer";
import { materialAnalyzer } from "./cam-new/materialAnalyzer";
import { costEstimator } from "./cam-new/costEstimator";
import { gcodeOptimizer } from "./cam-new/gcodeOptimizer";
import { aiConfigManager } from "./ai-new/aiConfigManager";
import { promptTemplates } from "./promptTemplates";
import { v4 as uuidv4 } from "uuid";
import { openAIService } from "./openaiService";
import { camPromptTemplates } from "./cam-new/camPromptTemplates";
import { aiAnalytics } from "./ai-new/aiAnalytics";
import { ToolpathOptimizer } from "./cam-new/toolpathOptimizer";
import { CostEstimator } from "./cam-new/costEstimator";
import openai from "openai";

/**
 * Estensione di UnifiedAIService con metodi specifici CAM
 */

/**
 * Analizza un percorso utensile per identificare problemi e suggerire miglioramenti
 */
export const analyzeToolpath = async function (
  toolpath: Toolpath,
  tool?: Tool,
  material?: Material
): Promise<AIResponse<ToolpathAnalysis>> {
  try {
    // Utilizza il camAnalyzer per eseguire l'analisi
    const analysis = await camAnalyzer.analyzeToolpath(toolpath, tool, material);

    return {
      rawResponse: null, // Non è una risposta di testo grezza
      data: analysis,
      success: true,
      usage: {
        // Stima del consumo di token
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0
      },
      metadata: {
        type: "toolpath_analysis",
        toolpathId: toolpath.id,
        toolId: tool?.id,
        materialId: material?.id
      }
    };
  } catch (error) {
    return {
      rawResponse: null,
      data: null,
      error: error instanceof Error ? error.message : "Unknown error",
      success: false,
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0
      },
      metadata: {
        type: "toolpath_analysis",
        toolpathId: toolpath.id
      }
    };
  }
};

/**
 * Ottimizza un percorso utensile in base a obiettivi specifici
 */
export const optimizeToolpath = async function (
  toolpath: Toolpath,
  goals: ("time" | "quality" | "tool_life" | "cost")[],
  tool?: Tool,
  material?: Material
): Promise<AIResponse<Toolpath>> {
  try {
    // Utilizza il toolpathOptimizer per eseguire l'ottimizzazione
    const optimizedToolpath = await toolpathOptimizer.optimizeToolpath(toolpath, goals, tool, material);

    return {
      rawResponse: null, // Non è una risposta di testo grezza
      data: optimizedToolpath,
      success: true,
      usage: {
        // Stima del consumo di token
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0
      },
      metadata: {
        type: "toolpath_optimization",
        toolpathId: toolpath.id,
        goals: goals.join(","),
        toolId: tool?.id,
        materialId: material?.id
      }
    };
  } catch (error) {
    return {
      rawResponse: null,
      data: null,
      error: error instanceof Error ? error.message : "Unknown error",
      success: false,
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0
      },
      metadata: {
        type: "toolpath_optimization",
        toolpathId: toolpath.id
      }
    };
  }
};

/**
 * Analizza un utensile per verificarne l'adeguatezza per un materiale/operazione
 */
export const analyzeTool = async function (
  tool: Tool,
  material?: Material,
  operation?: MachiningOperation
): Promise<AIResponse<any>> {
  try {
    // Create a custom tool analysis using available materialAnalyzer methods
    let analysis = {
      id: crypto.randomUUID(),
      toolId: tool.id,
      toolName: tool.name,
      toolType: tool.type,
      compatibility: {}
    };

    // If material is provided, get recommendations for it
    if (material) {
      const materialAnalysis = await materialAnalyzer.analyzeMaterial(material, [tool], operation);
      // Extract tool-specific recommendations from material analysis
      analysis.compatibility = {
        materialId: material.id,
        materialName: material.name,
        suitable: true, // Default to true unless determined otherwise
        recommendations: materialAnalysis.toolRecommendations || []
      };
    }

    return {
      rawResponse: null, // Non è una risposta di testo grezza
      data: analysis,
      success: true,
      usage: {
        // Stima del consumo di token
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0
      },
      metadata: {
        type: "tool_analysis",
        toolId: tool.id,
        materialId: material?.id,
        operationType: operation?.type
      }
    };
  } catch (error) {
    return {
      rawResponse: null,
      data: null,
      error: error instanceof Error ? error.message : "Unknown error",
      success: false,
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0
      },
      metadata: {
        type: "tool_analysis",
        toolId: tool.id
      }
    };
  }
};

/**
 * Suggerisce l'utensile migliore per un percorso utensile tra quelli disponibili
 */
export const optimizeTool = async function (
  toolpath: Toolpath,
  currentTool: Tool,
  availableTools?: Tool[]
): Promise<AIResponse<any>> {
  // Se non ci sono utensili disponibili, usa solo l'analisi dell'utensile corrente
  if (!availableTools || availableTools.length === 0) {
    return (unifiedAIService as any).analyzeTool(currentTool);
  }

  try {
    // Per ogni utensile disponibile, genera un prompt di analisi
    const systemPrompt = `You are a CAM tool selection expert. Analyze the provided toolpath and tools to recommend the most suitable tool.`;

    const prompt = `
    Analyze this toolpath operation and recommend the best tool for it from the available options.
    
    Toolpath Information:
    ${JSON.stringify(
      {
        name: toolpath.name,
        operationType: toolpath.operation.type,
        feedRate: toolpath.operation.feedRate,
        spindleSpeed: toolpath.operation.spindleSpeed,
        coolant: toolpath.operation.coolant,
        stepover: toolpath.operation.stepover,
        stepdown: toolpath.operation.stepdown
      },
      null,
      2
    )}
    
    Currently Selected Tool:
    ${JSON.stringify(currentTool, null, 2)}
    
    Available Alternative Tools:
    ${JSON.stringify(availableTools, null, 2)}
    
    Provide your recommendation as a JSON object with these fields:
    - recommendedToolId: ID of the recommended tool
    - confidence: Number between 0-1 indicating confidence in recommendation
    - reasoning: Explanation for the recommendation
    - performanceComparison: Expected improvements over current tool
    `;

    // Esegue la richiesta AI
    const response = await (unifiedAIService as any).processRequest({
      prompt,
      systemPrompt,
      model: aiConfigManager.getOptimalParameters("design_analysis").model,
      temperature: 0.3,
      maxTokens: 4000,
      parseResponse: async (text: string) => {
        try {
          // Estrai JSON dalla risposta
          const jsonMatch =
            text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```\n([\s\S]*?)\n```/) || text.match(/\{[\s\S]*\}/);

          if (!jsonMatch) {
            throw new Error("No valid JSON found in response");
          }

          const json = jsonMatch[1] || jsonMatch[0];
          return JSON.parse(json);
        } catch (error) {
          console.error("Failed to parse tool optimization response:", error);
          throw error;
        }
      },
      metadata: {
        type: "tool_optimization",
        toolpathId: toolpath.id,
        currentToolId: currentTool.id,
        availableToolsCount: availableTools.length
      }
    });

    return response;
  } catch (error) {
    return {
      rawResponse: null,
      data: null,
      error: error instanceof Error ? error.message : "Unknown error",
      success: false,
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0
      },
      metadata: {
        type: "tool_optimization",
        toolpathId: toolpath.id,
        currentToolId: currentTool.id
      }
    };
  }
};

/**
 * Analizza un materiale per verificarne le caratteristiche di lavorazione
 */
export const analyzeMaterial = async function (
  material: Material,
  tools?: Tool[],
  operation?: MachiningOperation
): Promise<AIResponse<any>> {
  try {
    // Utilizza materialAnalyzer per eseguire l'analisi
    const analysis = await materialAnalyzer.analyzeMaterial(material, tools, operation);

    return {
      rawResponse: null, // Non è una risposta di testo grezza
      data: analysis,
      success: true,
      usage: {
        // Stima del consumo di token
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0
      },
      metadata: {
        type: "material_analysis",
        materialId: material.id,
        toolsCount: tools?.length || 0,
        operationType: operation?.type
      }
    };
  } catch (error) {
    return {
      rawResponse: null,
      data: null,
      error: error instanceof Error ? error.message : "Unknown error",
      success: false,
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0
      },
      metadata: {
        type: "material_analysis",
        materialId: material.id
      }
    };
  }
};

/**
 * Calcola i costi di lavorazione per un percorso utensile
 */
export const calculateMachiningCost = async function (
  toolpath: Toolpath,
  tool: Tool,
  material?: Material,
  rates?: { machine: number; labor: number }
): Promise<AIResponse<CostEstimation>> {
  try {
    // Utilizza costEstimator per eseguire la stima dei costi
    const costEstimation = await costEstimator.estimateCost(toolpath, tool, material, rates);

    return {
      rawResponse: null, // Non è una risposta di testo grezza
      data: costEstimation,
      success: true,
      usage: {
        // Stima del consumo di token
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0
      },
      metadata: {
        type: "cost_estimation",
        toolpathId: toolpath.id,
        toolId: tool.id,
        materialId: material?.id
      }
    };
  } catch (error) {
    return {
      rawResponse: null,
      data: null,
      error: error instanceof Error ? error.message : "Unknown error",
      success: false,
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0
      },
      metadata: {
        type: "cost_estimation",
        toolpathId: toolpath.id
      }
    };
  }
};

/**
 * Analizza un file G-code per verificarne la correttezza e l'efficienza
 */
export const analyzeGCode = async function (
  gcode: string,
  tool?: Tool,
  material?: Material
): Promise<AIResponse<GCodeAnalysis>> {
  try {
    // Utilizza gcodeOptimizer per eseguire l'analisi
    const analysis = await gcodeOptimizer.analyzeGCode(gcode, tool, material);

    return {
      rawResponse: null, // Non è una risposta di testo grezza
      data: analysis,
      success: true,
      usage: {
        // Stima del consumo di token
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0
      },
      metadata: {
        type: "gcode_analysis",
        gcodeLength: gcode.length,
        toolId: tool?.id,
        materialId: material?.id
      }
    };
  } catch (error) {
    return {
      rawResponse: null,
      data: null,
      error: error instanceof Error ? error.message : "Unknown error",
      success: false,
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0
      },
      metadata: {
        type: "gcode_analysis",
        gcodeLength: gcode.length
      }
    };
  }
};

/**
 * Esegue una simulazione di lavorazione
 */
export const simulateMachining = async function (
  toolpath: Toolpath,
  tool: Tool,
  material?: Material
): Promise<AIResponse<any>> {
  try {
    // Chiamare camActionHandler per la simulazione
    const simulationResults = await camAnalyzer.analyzeToolpath(toolpath, tool, material);

    // Aggiungi informazioni di simulazione specifiche
    const simulation = {
      ...simulationResults,
      simulationDetails: {
        collisions: [], // Un simulatore reale dovrebbe rilevare collisioni
        forces: [], // Un simulatore reale calcolerebbe le forze
        temperatures: [], // Un simulatore reale stimerebbe le temperature
        finishQuality: 85, // 0-100%, stima della qualità superficiale
        success: true
      }
    };

    return {
      rawResponse: null, // Non è una risposta di testo grezza
      data: simulation,
      success: true,
      usage: {
        // Stima del consumo di token
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0
      },
      metadata: {
        type: "machining_simulation",
        toolpathId: toolpath.id,
        toolId: tool.id,
        materialId: material?.id
      }
    };
  } catch (error) {
    return {
      rawResponse: null,
      data: null,
      error: error instanceof Error ? error.message : "Unknown error",
      success: false,
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0
      },
      metadata: {
        type: "machining_simulation",
        toolpathId: toolpath.id
      }
    };
  }
};

/**
 * Genera un rapporto basato su diverse analisi
 */
export const generateCAMReport = async function (
  analyses: (ToolpathAnalysis | GCodeAnalysis | CostEstimation)[],
  format: "json" | "markdown" | "html" = "json"
): Promise<AIResponse<any>> {
  try {
    // Crea un rapporto con un sommario delle analisi
    const reportData = {
      id: crypto.randomUUID(),
      generatedAt: new Date().toISOString(),
      analyses: analyses.map(analysis => {
        // Determina il tipo di analisi
        if ("toolpathId" in analysis && "efficiency" in analysis) {
          return {
            type: "toolpathAnalysis",
            id: analysis.id,
            toolpathId: analysis.toolpathId,
            efficiency: analysis.efficiency,
            quality: analysis.quality,
            issuesCount: analysis.issues.length,
            recommendationsCount: analysis.recommendations.length
          };
        } else if ("lineCount" in analysis) {
          return {
            type: "gcodeAnalysis",
            id: analysis.id,
            lineCount: analysis.lineCount,
            errorsCount: analysis.errors.length,
            warningsCount: analysis.warnings.length,
            timeSavings: analysis.optimization.timeSavings
          };
        } else if ("totalCost" in analysis) {
          return {
            type: "costEstimation",
            id: analysis.id,
            toolpathId: analysis.toolpathId,
            totalCost: analysis.totalCost,
            machiningTime: analysis.machiningTime,
            setupTime: analysis.setupTime
          };
        } else {
          return {
            type: "unknown",
            id: (analysis as any).id
          };
        }
      }),
      summary: (unifiedAIService as any).generateReportSummary(analyses) // Cast for this call if generateReportSummary is also dynamic
    };

    // Se il formato non è JSON, converte il rapporto
    if (format !== "json") {
      const systemPrompt = `You are a CAM reporting assistant. Convert the JSON report into a well-formatted, professional ${format} report.`;

      const prompt = `
      Convert this CAM analysis report from JSON to a well-formatted ${format} report.
      Make it professional, well-structured, and easy to read.
      
      JSON report data:
      ${JSON.stringify(reportData, null, 2)}
      
      ${format === "markdown" ? "Output Markdown format." : "Output HTML format that can be rendered in a web browser."}
      `;

      const response = await (unifiedAIService as any).processRequest({
        prompt,
        systemPrompt,
        model: aiConfigManager.getOptimalParameters("report").model,
        temperature: 0.3,
        maxTokens: 6000,
        parseResponse: (text: string) => Promise.resolve(text), // Restituisci il testo così com'è
        metadata: {
          type: "cam_report_conversion",
          format,
          analysesCount: analyses.length
        }
      });

      if (response.success && response.rawResponse) {
        return {
          ...response,
          data: {
            content: response.rawResponse,
            format,
            jsonData: reportData
          }
        };
      } else {
        // Fallback a JSON se la conversione fallisce
        return {
          rawResponse: JSON.stringify(reportData, null, 2),
          data: {
            content: JSON.stringify(reportData, null, 2),
            format: "json",
            jsonData: reportData
          },
          success: true,
          usage: {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0
          },
          metadata: {
            type: "cam_report",
            format: "json",
            analysesCount: analyses.length
          }
        };
      }
    } else {
      // Restituisci direttamente il JSON
      return {
        rawResponse: JSON.stringify(reportData, null, 2),
        data: {
          content: JSON.stringify(reportData, null, 2),
          format: "json",
          jsonData: reportData
        },
        success: true,
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0
        },
        metadata: {
          type: "cam_report",
          format: "json",
          analysesCount: analyses.length
        }
      };
    }
  } catch (error) {
    return {
      rawResponse: null,
      data: null,
      error: error instanceof Error ? error.message : "Unknown error",
      success: false,
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0
      },
      metadata: {
        type: "cam_report",
        analysesCount: analyses.length
      }
    };
  }
};

/**
 * Genera un sommario per il report CAM
 */
export const generateReportSummary = function (analyses: (ToolpathAnalysis | GCodeAnalysis | CostEstimation)[]): any {
  // Calcola statistiche complessive
  let totalMachiningTime = 0;
  let totalCost = 0;
  let avgEfficiency = 0;
  let avgQuality = 0;
  let totalIssuesCount = 0;
  let totalRecommendationsCount = 0;

  let toolpathAnalysesCount = 0;
  let gcodeAnalysesCount = 0;
  let costEstimationsCount = 0;

  // Esamina ogni analisi per raccogliere statistiche
  for (const analysis of analyses) {
    if ("toolpathId" in analysis && "efficiency" in analysis) {
      // È un'analisi del percorso utensile
      toolpathAnalysesCount++;
      avgEfficiency += analysis.efficiency;
      avgQuality += analysis.quality;
      totalIssuesCount += analysis.issues.length;
      totalRecommendationsCount += analysis.recommendations.length;
    } else if ("lineCount" in analysis) {
      // È un'analisi del G-code
      gcodeAnalysesCount++;
      totalIssuesCount += analysis.errors.length + analysis.warnings.length;
      totalRecommendationsCount += analysis.optimization.recommendations.length;
    } else if ("totalCost" in analysis) {
      // È una stima dei costi
      costEstimationsCount++;
      totalMachiningTime += analysis.machiningTime;
      totalCost += analysis.totalCost;
    }
  }

  // Calcola le medie
  if (toolpathAnalysesCount > 0) {
    avgEfficiency /= toolpathAnalysesCount;
    avgQuality /= toolpathAnalysesCount;
  }

  // Crea il sommario
  return {
    analysesCount: analyses.length,
    toolpathAnalysesCount,
    gcodeAnalysesCount,
    costEstimationsCount,
    totalMachiningTime,
    totalCost,
    avgEfficiency: Math.round(avgEfficiency * 100) / 100,
    avgQuality: Math.round(avgQuality * 100) / 100,
    totalIssuesCount,
    totalRecommendationsCount,
    overallStatus: totalIssuesCount > 5 ? "needs_attention" : "good"
  };
};

/**
 * Servizio unificato per le funzionalità di AI relative al CAM
 */
class UnifiedAIServiceCAM {
  private toolpathOptimizer: ToolpathOptimizer;
  private costEstimator: CostEstimator;

  constructor() {
    this.toolpathOptimizer = new ToolpathOptimizer();
    this.costEstimator = new CostEstimator();
  }

  /**
   * Genera G-code direttamente da una descrizione testuale
   */
  async generateGCodeFromText(
    description: string,
    tool?: Tool,
    material?: Material,
    machineConfig?: any,
    additionalContext?: any
  ): Promise<any> {
    try {
      aiAnalytics.trackEvent({
        eventType: "cam_text_to_gcode",
        eventName: "generate_gcode_from_text",
        metadata: {
          descriptionLength: description.length,
          toolType: tool?.type,
          materialType: material?.type
        }
      });

      const startTime = Date.now();

      // Crea il prompt per la generazione
      let prompt = `Generate G-code for the following machining operation description:

${description}

`;

      if (tool) {
        prompt += `Tool Information:
- Type: ${tool.type}
- Diameter: ${tool.diameter}mm
- Number of Flutes: ${tool.flutes || "Not specified"}
- Material: ${tool.material || "Not specified"}
- Max Feed Rate: ${tool.maxFeedRate || "Not specified"}
- Max Spindle Speed: ${tool.maxSpindleSpeed || "Not specified"}
- Max Cutting Depth: ${tool.maxCuttingDepth || "Not specified"}

`;
      }

      if (material) {
        prompt += `Material Information:
- Type: ${material.type}
- Name: ${material.name}
- Hardness: ${material.hardness || "Not specified"}
- Machinability: ${material.machinability || "Not specified"}%

`;
      }

      if (machineConfig) {
        prompt += `Machine Configuration:
- Machine Type: ${machineConfig.type || "CNC Mill"}
- Work Coordinate System: ${machineConfig.wcs || "G54"}
- Max Rapid Speed: ${machineConfig.maxRapidSpeed || "5000"} mm/min
- Default Feed Rate: ${machineConfig.defaultFeedRate || "1000"} mm/min
- Units: ${machineConfig.units || "mm"}
- Controller: ${machineConfig.controller || "Generic"}

`;
      }

      prompt += `
Please generate complete, safe, and efficient G-code following these guidelines:
1. Include proper initialization (machine setup, tool selection, etc.)
2. Use appropriate feed rates and spindle speeds for the material and tool
3. Include safe approach and retract movements
4. Optimize the toolpath for efficiency and quality
5. Include proper shutdown sequence
6. Add comments to explain major sections

Return only the G-code without explanations, formatted with proper line breaks and indentation.`;

      // Chiama l'API per generare il G-code
      const response = await (unifiedAIService as any).processRequest({
        model: "claude-sonnet-4-20250514",
        messages: [
          {
            role: "system",
            content:
              "You are a CAM expert specialized in generating G-code for CNC machines. Generate precise, optimized, and safe G-code based on natural language descriptions."
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.2,
        max_tokens: 4000
      });

      const generatedGCode = response.choices[0].message.content || "";

      // Analizza il G-code generato per verificare errori e possibili ottimizzazioni
      const analysis = await this.analyzeGCode(generatedGCode, tool, material);

      // Registra il tempo e ritorna risultato
      aiAnalytics.trackEvent({
        eventType: "cam_text_to_gcode",
        eventName: "generate_gcode_from_text_complete",
        duration: Date.now() - startTime,
        success: true,
        metadata: {
          gcodeLength: generatedGCode.length,
          errors: analysis.errors?.length || 0,
          warnings: analysis.warnings?.length || 0
        }
      });

      return {
        success: true,
        data: {
          gcode: generatedGCode,
          id: uuidv4(),
          name: `Generated from text (${new Date().toLocaleString()})`,
          analysis,
          sourceDescription: description
        }
      };
    } catch (error) {
      console.error("Error generating G-code from text:", error);
      aiAnalytics.trackEvent({
        eventType: "cam_text_to_gcode",
        eventName: "generate_gcode_from_text_error",
        success: false,
        metadata: {
          error: error instanceof Error ? error.message : "Unknown error"
        }
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error generating G-code"
      };
    }
  }

  /**
   * Analizza un percorso utensile utilizzando il camAnalyzer
   */
  async analyzeToolpath(toolpath: Toolpath, tool?: Tool, material?: Material): Promise<any> {
    try {
      const result = await camAnalyzer.analyzeToolpath(toolpath, tool, material);
      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error("Error analyzing toolpath:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error analyzing toolpath"
      };
    }
  }

  /**
   * Ottimizza un percorso utensile utilizzando il toolpathOptimizer
   */
  async optimizeToolpath(
    toolpath: Toolpath,
    goals: ("time" | "quality" | "tool_life" | "cost")[],
    tool?: Tool,
    material?: Material
  ): Promise<any> {
    try {
      const result = await this.toolpathOptimizer.optimizeToolpath(toolpath, goals, tool, material);
      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error("Error optimizing toolpath:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error optimizing toolpath"
      };
    }
  }

  /**
   * Analizza un utensile
   */
  async analyzeTool(tool: Tool, material?: Material, operation?: MachiningOperation): Promise<any> {
    try {
      // Implementazione semplificata
      return {
        success: true,
        data: {
          id: uuidv4(),
          toolId: tool.id,
          analysis: {
            suitability: 0.8,
            recommendations: [
              "Consider using a tool with more flutes for this material",
              "Reduce feed rate to improve tool life"
            ]
          }
        }
      };
    } catch (error) {
      console.error("Error analyzing tool:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error analyzing tool"
      };
    }
  }

  /**
   * Suggerisce l'utensile migliore
   */
  async optimizeTool(toolpath: Toolpath, currentTool: Tool, availableTools?: Tool[]): Promise<any> {
    try {
      // Implementazione semplificata
      return {
        success: true,
        data: {
          recommendedToolId: availableTools && availableTools.length > 0 ? availableTools[0].id : currentTool.id,
          improvement: {
            time: 15,
            quality: 10,
            toolLife: 20
          }
        }
      };
    } catch (error) {
      console.error("Error optimizing tool:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error optimizing tool"
      };
    }
  }

  /**
   * Analizza un materiale utilizzando il materialAnalyzer
   */
  async analyzeMaterial(material: Material, tools?: Tool[], operation?: MachiningOperation): Promise<any> {
    try {
      const result = await materialAnalyzer.analyzeMaterial(material, tools, operation);
      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error("Error analyzing material:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error analyzing material"
      };
    }
  }

  /**
   * Calcola il costo di lavorazione utilizzando costEstimator
   */
  async calculateMachiningCost(
    toolpath: Toolpath,
    tool: Tool,
    material?: Material,
    rates?: { machine: number; labor: number }
  ): Promise<any> {
    try {
      const result = await this.costEstimator.estimateCost(toolpath, tool, material, rates);
      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error("Error calculating cost:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error calculating cost"
      };
    }
  }

  /**
   * Analizza un G-code utilizzando gcodeOptimizer
   */
  async analyzeGCode(gcode: string, tool?: Tool, material?: Material): Promise<any> {
    try {
      const result = await gcodeOptimizer.analyzeGCode(gcode, tool, material);
      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error("Error analyzing G-code:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error analyzing G-code"
      };
    }
  }

  /**
   * Ottimizza un G-code utilizzando gcodeOptimizer
   */
  async optimizeGCode(
    gcode: string,
    machineType?: string,
    enhancedContext?: string,
    tool?: Tool,
    material?: Material,
    goals?: ("time" | "quality" | "tool_life" | "cost")[]
  ): Promise<any> {
    try {
      const finalGoals = goals || ["time"];
      const result = await gcodeOptimizer.optimizeGCode(gcode, tool, material, finalGoals);
      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error("Error optimizing G-code:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error optimizing G-code"
      };
    }
  }

  /**
   * Genera CAM report basato sulle analisi
   */
  async generateCAMReport(analyses: any[], format: "json" | "markdown" | "html" = "json"): Promise<any> {
    try {
      // Implementazione semplificata
      return {
        success: true,
        data: {
          id: uuidv4(),
          timestamp: Date.now(),
          format,
          content: "CAM Report Content",
          analyses
        }
      };
    } catch (error) {
      console.error("Error generating report:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error generating report"
      };
    }
  }

  /**
   * Migliora il G-code con l'assistenza AI
   */
  async enhanceGCodeWithAI(
    gcode: string,
    enhancementGoal: "safety" | "efficiency" | "quality" | "all",
    tool?: Tool,
    material?: Material
  ): Promise<any> {
    try {
      // Prepara il contesto per il modello
      let context = "Enhance the following G-code";

      if (enhancementGoal === "safety") {
        context +=
          " to improve safety by adding proper safety checks, safe approach and retract moves, and better error handling";
      } else if (enhancementGoal === "efficiency") {
        context += " to improve efficiency by optimizing rapid moves, reducing air cuts, and reorganizing operations";
      } else if (enhancementGoal === "quality") {
        context +=
          " to improve quality by adjusting feed rates, adding finishing passes, and optimizing cutting parameters";
      } else {
        context += " to improve safety, efficiency, and quality";
      }

      if (tool) {
        context += `\n\nTool Information:
- Type: ${tool.type}
- Diameter: ${tool.diameter}mm
- Flutes: ${tool.flutes || "Not specified"}`;
      }

      if (material) {
        context += `\n\nMaterial Information:
- Type: ${material.type}
- Hardness: ${material.hardness || "Not specified"}
- Machinability: ${material.machinability || "Not specified"}%`;
      }

      // Invia la richiesta all'API
      const response = await (unifiedAIService as any).processRequest({
        model: "claude-sonnet-4-20250514",
        messages: [
          {
            role: "system",
            content:
              "You are a CAM expert specialized in optimizing G-code for CNC machines. Enhance and improve the provided G-code based on the specified goals."
          },
          { role: "user", content: `${context}\n\n${gcode}` }
        ],
        temperature: 0.3,
        max_tokens: 4000
      });

      const enhancedGCode = response.choices[0].message.content || "";

      // Analizza il G-code migliorato
      const analysis = await this.analyzeGCode(enhancedGCode, tool, material);

      return {
        success: true,
        data: {
          gcode: enhancedGCode,
          analysis,
          enhancementGoal
        }
      };
    } catch (error) {
      console.error("Error enhancing G-code with AI:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error enhancing G-code"
      };
    }
  }

  /**
   * Converte il G-code per una macchina diversa
   */
  async convertGCodeForMachine(gcode: string, sourceMachine: string, targetMachine: string): Promise<any> {
    try {
      // Prepara il contesto per il modello
      const context = `Convert the following G-code from ${sourceMachine} format to ${targetMachine} format. 
Adapt machine-specific commands, coordinate systems, and syntax while preserving the toolpath and machining operations.`;

      // Invia la richiesta all'API
      const response = await (unifiedAIService as any).processRequest({
        model: "claude-sonnet-4-20250514",
        messages: [
          {
            role: "system",
            content:
              "You are a CAM expert specialized in G-code conversions between different CNC controllers. Convert the provided G-code to work with the target machine controller while preserving all machining operations."
          },
          { role: "user", content: `${context}\n\nSource G-code (${sourceMachine}):\n\n${gcode}` }
        ],
        temperature: 0.3,
        max_tokens: 4000
      });

      const convertedGCode = response.choices[0].message.content || "";

      return {
        success: true,
        data: {
          gcode: convertedGCode,
          sourceMachine,
          targetMachine
        }
      };
    } catch (error) {
      console.error("Error converting G-code for machine:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error converting G-code"
      };
    }
  }

  /**
   * Ottiene un completamento dall'assistente utilizzando l'API
   */
  async getAssistantCompletion(
    messages: any[],
    context: string,
    availableActions?: string[],
    responseStyle?: string,
    complexityLevel?: string,
    role?: string,
    userPreferences?: any,
    model: string = "claude-sonnet-4-20250514",
    structuredContext?: any
  ): Promise<any> {
    try {
      // Costruisci il prompt di sistema
      let systemPrompt = `You are a CAM (Computer-Aided Manufacturing) assistant specializing in CNC machining and G-code generation. 
Your primary goal is to help users convert text descriptions into G-code for CNC machines.

Use your knowledge of:
- CNC machining principles
- G-code programming
- Machining strategies
- Tool selection
- Material considerations
- Cutting parameters optimization

If the user asks for a G-code generation, focus on creating efficient, safe, and optimized G-code that follows industry best practices.
If they ask for help with an existing G-code, provide analysis and optimization suggestions.

${context || ""}`;

      if (availableActions && availableActions.length > 0) {
        systemPrompt += `\n\nYou can also perform the following actions:
${availableActions.join("\n")}`;
      }

      // Formatta i messaggi per l'API
      const formattedMessages = [
        { role: "system", content: systemPrompt },
        ...messages.map(msg => ({
          role: msg.role === "user" ? "user" : "assistant",
          content: msg.content
        }))
      ];

      // Invia la richiesta all'API
      const response = await (unifiedAIService as any).processRequest({
        model,
        messages: formattedMessages,
        temperature: 0.7,
        max_tokens: 4000
      });

      const assistantResponse = response.choices[0].message.content || "";

      // Cerca possibili azioni nel testo della risposta
      const actions = this.extractActions(assistantResponse);

      return {
        success: true,
        data: {
          content: assistantResponse,
          actions
        }
      };
    } catch (error) {
      console.error("Error getting assistant completion:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error getting completion"
      };
    }
  }

  /**
   * Estrae le azioni dalla risposta dell'assistente
   */
  private extractActions(text: string): any[] {
    const actions: any[] = [];

    // Cerca pattern che indicano azioni
    const actionMatches = text.match(/\[Action:(.*?)\]/g);

    if (actionMatches) {
      for (const match of actionMatches) {
        const actionText = match.replace(/\[Action:|]|\[|\]/g, "").trim();
        const actionParts = actionText.split(":");

        if (actionParts.length >= 2) {
          const type = actionParts[0].trim();
          const payload = actionParts.slice(1).join(":").trim();

          actions.push({
            type,
            payload: this.parseActionPayload(payload)
          });
        }
      }
    }

    return actions;
  }

  /**
   * Interpreta il payload dell'azione
   */
  private parseActionPayload(payload: string): any {
    // Prova a interpretare il payload come JSON
    try {
      return JSON.parse(payload);
    } catch (e) {
      // Se non è JSON, restituisci il testo originale
      return payload;
    }
  }

  /**
   * Simula lavorazione basata su un percorso utensile
   */
  async simulateMachining(toolpath: Toolpath, tool: Tool, material?: Material): Promise<any> {
    try {
      // Implementazione semplificata della simulazione
      const machiningTime = toolpath.estimatedTime || this.estimateMachiningTime(toolpath);

      return {
        success: true,
        data: {
          toolpathId: toolpath.id,
          toolId: tool.id,
          materialId: material?.id,
          machiningTime,
          totalDistance: this.calculateTotalDistance(toolpath),
          cuttingDistance: this.calculateCuttingDistance(toolpath),
          rapidDistance: this.calculateRapidDistance(toolpath),
          efficiency: Math.random() * 40 + 60, // Valore casuale tra 60-100
          quality: Math.random() * 40 + 60, // Valore casuale tra 60-100
          simulationResults: {
            totalTime: machiningTime,
            toolLoad: Math.random() * 30 + 70, // Valore casuale tra 70-100
            maxVibration: Math.random() * 2, // Valore casuale tra 0-2
            surfaceFinish: Math.random() * 40 + 60 // Valore casuale tra 60-100
          }
        }
      };
    } catch (error) {
      console.error("Error simulating machining:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error simulating machining"
      };
    }
  }

  /**
   * Metodi helper per la simulazione
   */
  private estimateMachiningTime(toolpath: Toolpath): number {
    // Stima il tempo di lavorazione in secondi
    let totalTime = 0;
    const points = toolpath.points;

    for (let i = 1; i < points.length; i++) {
      const p1 = points[i - 1];
      const p2 = points[i];

      // Calcola la distanza
      const distance = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2) + Math.pow(p2.z - p1.z, 2));

      // Utilizza il feed rate appropriato
      let feedRate = 1000; // mm/min di default

      if (p2.type === "rapid" || p1.type === "rapid") {
        feedRate = 5000; // mm/min per i rapidi
      } else if (p2.feedRate) {
        feedRate = p2.feedRate;
      } else if (p1.feedRate) {
        feedRate = p1.feedRate;
      } else if (toolpath.operation.feedRate) {
        feedRate = toolpath.operation.feedRate;
      }

      // Calcola il tempo in secondi
      const timeMinutes = distance / feedRate;
      totalTime += timeMinutes * 60;
    }

    return totalTime;
  }

  private calculateTotalDistance(toolpath: Toolpath): number {
    let totalDistance = 0;
    const points = toolpath.points;

    for (let i = 1; i < points.length; i++) {
      const p1 = points[i - 1];
      const p2 = points[i];

      totalDistance += Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2) + Math.pow(p2.z - p1.z, 2));
    }

    return totalDistance;
  }

  private calculateCuttingDistance(toolpath: Toolpath): number {
    let cuttingDistance = 0;
    const points = toolpath.points;

    for (let i = 1; i < points.length; i++) {
      const p1 = points[i - 1];
      const p2 = points[i];

      if (p2.type !== "rapid" && p1.type !== "rapid") {
        cuttingDistance += Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2) + Math.pow(p2.z - p1.z, 2));
      }
    }

    return cuttingDistance;
  }

  private calculateRapidDistance(toolpath: Toolpath): number {
    let rapidDistance = 0;
    const points = toolpath.points;

    for (let i = 1; i < points.length; i++) {
      const p1 = points[i - 1];
      const p2 = points[i];

      if (p2.type === "rapid" || p1.type === "rapid") {
        rapidDistance += Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2) + Math.pow(p2.z - p1.z, 2));
      }
    }

    return rapidDistance;
  }
}

// Crea e esporta un'istanza singleton del servizio
export const unifiedAIService = new UnifiedAIServiceCAM();
