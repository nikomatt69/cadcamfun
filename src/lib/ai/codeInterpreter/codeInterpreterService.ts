// src/lib/ai/codeInterpreter/codeInterpreterService.ts
import {
  CodeInterpreterRequest,
  CodeInterpreterResponse,
  CADCodeRequest,
  CADAnalysisResult,
  GCodeCodeRequest,
  GCodeAnalysisResult,
  CodeExecutionResult,
  CodeTemplate
} from "@/src/types/codeInterpreterTypes";
import { AIResponse } from "@/src/types/AITypes";
import { containerManager } from "./containerManager";
import { aiCache } from "../aiCache";
import { aiAnalytics } from "../aiAnalytics";
import { codeTemplates } from "./codeTemplates";
import { v4 as uuidv4 } from "uuid";
import { Element } from "@/src/store/elementsStore";
/**
 * OpenAI Code Interpreter Service
 * Provides Python code execution for CAD/CAM applications
 */
export class CodeInterpreterService {
  private readonly defaultModel = "gpt-4.1";
  private readonly apiEndpoint = "/api/ai/code-interpreter";

  /**
   * Execute Python code with OpenAI Code Interpreter
   */
  async executeCode(request: CodeInterpreterRequest): Promise<CodeInterpreterResponse> {
    const startTime = Date.now();
    const requestId = uuidv4();

    // Track request start
    aiAnalytics.trackRequestStart("code_interpreter_execution", this.defaultModel, {
      requestId,
      codeType: request.codeType,
      hasFiles: (request.files?.length || 0) > 0,
      codeLength: request.code?.length || 0
    });

    try {
      // Check cache for similar requests
      const cacheKey = this.getCacheKey(request);
      const cachedResponse = aiCache.get<CodeInterpreterResponse>(cacheKey);

      if (cachedResponse) {
        console.log(`[CodeInterpreter] Using cached response for ${requestId}`);
        return { ...cachedResponse, fromCache: true };
      }

      // Prepare container
      let containerId = request.containerId;

      if (request.containerMode === "auto" || !containerId) {
        const container = await containerManager.createContainer({
          name: `ai-execution-${requestId}`,
          files: request.files,
          metadata: { requestId, codeType: request.codeType }
        });
        containerId = container.id;
      }

      // Execute code
      const executionResult = await this.executeWithContainer(request, containerId, requestId);

      // Get updated container info
      const containerInfo = await containerManager.getContainer(containerId);

      const response: CodeInterpreterResponse = {
        rawResponse: JSON.stringify(executionResult),
        data: executionResult,
        success: !executionResult.error,
        error: executionResult.error,
        processingTime: Date.now() - startTime,
        model: this.defaultModel,
        usage: {
          promptTokens: Math.round((request.prompt?.length || 0) / 4),
          completionTokens: Math.round((executionResult.output?.length || 0) / 4),
          totalTokens: 0
        },
        containerInfo: containerInfo || undefined,
        executionResults: executionResult,
        generatedFiles: executionResult.generatedFiles,
        pythonOutput: executionResult.output,
        errors: executionResult.error ? [executionResult.error] : undefined,
        metadata: {
          requestId,
          containerId,
          codeType: request.codeType
        }
      };

      // Update usage calculation
      response.usage!.totalTokens = response.usage!.promptTokens + response.usage!.completionTokens;

      // Cache successful responses
      if (response.success) {
        aiCache.set(cacheKey, response);
      }

      // Track completion
      aiAnalytics.trackRequestComplete(
        requestId,
        response.processingTime!,
        response.success,
        response.usage!.promptTokens,
        response.usage!.completionTokens
      );

      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const processingTime = Date.now() - startTime;

      // Track error
      aiAnalytics.trackRequestComplete(requestId, processingTime, false, 0, 0);

      return {
        rawResponse: null,
        data: null,
        success: false,
        error: errorMessage,
        processingTime,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        metadata: { requestId, error: errorMessage }
      };
    }
  }

  /**
   * Process CAD elements with Python analysis
   */
  async processCADData(request: CADCodeRequest): Promise<AIResponse<CADAnalysisResult>> {
    const template = codeTemplates.getTemplate("cad_analysis");
    if (!template) {
      throw new Error("CAD analysis template not found");
    }

    // Generate analysis code based on request
    const analysisCode = this.generateCADAnalysisCode(request, template);

    const codeRequest: CodeInterpreterRequest = {
      ...request,
      code: analysisCode,
      codeType: "cad_processing",
      prompt: `Analyze CAD elements: ${JSON.stringify(request.cadElements, null, 2)}`,
      model: this.defaultModel
    };

    const response = await this.executeCode(codeRequest);

    return {
      ...response,
      data: response.data as CADAnalysisResult
    };
  }

  /**
   * Generate visualization from data
   */
  async generateVisualization(
    data: any[],
    chartType: string,
    title: string = "Data Visualization"
  ): Promise<CodeInterpreterResponse> {
    const template = codeTemplates.getTemplate("data_visualization");
    if (!template) {
      throw new Error("Visualization template not found");
    }

    const visualizationCode = this.generateVisualizationCode(data, chartType, title, template);

    return this.executeCode({
      prompt: `Generate ${chartType} visualization for data`,
      code: visualizationCode,
      codeType: "visualization",
      model: this.defaultModel,
      containerMode: "auto"
    });
  }

  /**
   * Optimize G-code with Python
   */
  async optimizeGCodeWithPython(request: GCodeCodeRequest): Promise<AIResponse<GCodeAnalysisResult>> {
    const template = codeTemplates.getTemplate("gcode_optimization");
    if (!template) {
      throw new Error("G-code optimization template not found");
    }

    const optimizationCode = this.generateGCodeOptimizationCode(request, template);

    const codeRequest: CodeInterpreterRequest = {
      ...request,
      code: optimizationCode,
      codeType: "analysis",
      prompt: `Optimize G-code for machining efficiency`,
      model: this.defaultModel
    };

    const response = await this.executeCode(codeRequest);

    return {
      ...response,
      data: response.data as GCodeAnalysisResult
    };
  }

  /**
   * Execute statistical analysis on CAD elements
   */
  async analyzeCADStatistics(elements: Element[]): Promise<CodeInterpreterResponse> {
    const analysisCode = `
import json
import numpy as np
import matplotlib.pyplot as plt
from collections import Counter

# Load CAD elements
elements = ${JSON.stringify(elements, null, 2)}

# Basic statistics
total_elements = len(elements)
element_types = Counter([el.get('type', 'unknown') for el in elements])

# Position analysis
positions = [(el.get('x', 0), el.get('y', 0), el.get('z', 0)) for el in elements]
if positions:
    x_coords = [pos[0] for pos in positions]
    y_coords = [pos[1] for pos in positions]
    z_coords = [pos[2] for pos in positions]
    
    centroid = (np.mean(x_coords), np.mean(y_coords), np.mean(z_coords))
    bounding_box = {
        'min': (min(x_coords), min(y_coords), min(z_coords)),
        'max': (max(x_coords), max(y_coords), max(z_coords))
    }
else:
    centroid = (0, 0, 0)
    bounding_box = {'min': (0, 0, 0), 'max': (0, 0, 0)}

# Volume analysis (approximate)
total_volume = 0
for el in elements:
    if el.get('type') == 'cube':
        volume = el.get('width', 0) * el.get('height', 0) * el.get('depth', 0)
    elif el.get('type') == 'sphere':
        radius = el.get('radius', 0)
        volume = (4/3) * np.pi * radius**3
    elif el.get('type') == 'cylinder':
        radius = el.get('radius', 0)
        height = el.get('height', 0)
        volume = np.pi * radius**2 * height
    else:
        volume = 0
    total_volume += volume

# Create visualization
plt.figure(figsize=(12, 8))

# Element type distribution
plt.subplot(2, 2, 1)
types = list(element_types.keys())
counts = list(element_types.values())
plt.pie(counts, labels=types, autopct='%1.1f%%')
plt.title('Element Type Distribution')

# Position scatter plot
plt.subplot(2, 2, 2)
plt.scatter(x_coords, y_coords, alpha=0.6)
plt.xlabel('X Position')
plt.ylabel('Y Position')
plt.title('Element Positions (XY Plane)')
plt.grid(True)

# Size distribution
plt.subplot(2, 2, 3)
sizes = []
for el in elements:
    if 'radius' in el:
        sizes.append(el['radius'] * 2)  # diameter
    elif 'width' in el:
        sizes.append(el['width'])
    else:
        sizes.append(1)  # default

plt.hist(sizes, bins=20, alpha=0.7)
plt.xlabel('Size')
plt.ylabel('Frequency')
plt.title('Size Distribution')

# Summary statistics
plt.subplot(2, 2, 4)
plt.text(0.1, 0.8, f'Total Elements: {total_elements}', fontsize=12)
plt.text(0.1, 0.7, f'Total Volume: {total_volume:.2f}', fontsize=12)
plt.text(0.1, 0.6, f'Centroid: ({centroid[0]:.1f}, {centroid[1]:.1f}, {centroid[2]:.1f})', fontsize=12)
plt.text(0.1, 0.5, f'Unique Types: {len(element_types)}', fontsize=12)
plt.axis('off')
plt.title('Summary Statistics')

plt.tight_layout()
plt.savefig('cad_analysis.png', dpi=150, bbox_inches='tight')
plt.show()

# Return analysis results
analysis_result = {
    'total_elements': total_elements,
    'element_types': dict(element_types),
    'total_volume': total_volume,
    'centroid': centroid,
    'bounding_box': bounding_box,
    'summary': f'Analyzed {total_elements} CAD elements with {len(element_types)} different types. Total estimated volume: {total_volume:.2f} cubic units.'
}

print(json.dumps(analysis_result, indent=2))
`;

    return this.executeCode({
      prompt: "Analyze CAD elements statistics and generate visualization",
      code: analysisCode,
      codeType: "analysis",
      model: this.defaultModel,
      containerMode: "auto"
    });
  }

  /**
   * Execute code with container
   */
  private async executeWithContainer(
    request: CodeInterpreterRequest,
    containerId: string,
    requestId: string
  ): Promise<CodeExecutionResult> {
    try {
      const response = await fetch(this.apiEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "execute",
          model: request.model || this.defaultModel,
          containerId,
          instructions: request.prompt || "Execute the provided Python code",
          code: request.code,
          timeout: request.executionTimeout || 300000 // 5 minutes default
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Code execution failed");
      }

      const result = await response.json();

      // Update container activity
      await containerManager.updateActivity(containerId);

      // Parse execution result
      const executionResult: CodeExecutionResult = {
        output: result.output || "",
        error: result.error,
        executionTime: result.execution_time || 0,
        memoryUsage: result.memory_usage,
        generatedFiles: result.generated_files || [],
        visualizations: result.visualizations || [],
        dataAnalysis: result.data_analysis
      };

      return executionResult;
    } catch (error) {
      console.error(`[CodeInterpreter] Execution failed for ${requestId}:`, error);
      throw error;
    }
  }

  /**
   * Generate CAD analysis code
   */
  private generateCADAnalysisCode(request: CADCodeRequest, template: CodeTemplate): string {
    let code = template.code;

    // Replace placeholders
    code = code.replace("{{CAD_ELEMENTS}}", JSON.stringify(request.cadElements, null, 2));
    code = code.replace("{{ANALYSIS_TYPE}}", request.analysisType);

    if (request.materialProperties) {
      code = code.replace("{{MATERIAL_PROPERTIES}}", JSON.stringify(request.materialProperties, null, 2));
    }

    if (request.constraints) {
      code = code.replace("{{CONSTRAINTS}}", JSON.stringify(request.constraints, null, 2));
    }

    return code;
  }

  /**
   * Generate visualization code
   */
  private generateVisualizationCode(data: any[], chartType: string, title: string, template: CodeTemplate): string {
    let code = template.code;

    code = code.replace("{{DATA}}", JSON.stringify(data, null, 2));
    code = code.replace("{{CHART_TYPE}}", chartType);
    code = code.replace("{{TITLE}}", title);

    return code;
  }

  /**
   * Generate G-code optimization code
   */
  private generateGCodeOptimizationCode(request: GCodeCodeRequest, template: CodeTemplate): string {
    let code = template.code;

    code = code.replace("{{GCODE}}", request.gcode);
    code = code.replace("{{MACHINE_SPECS}}", JSON.stringify(request.machineSpecs, null, 2));
    code = code.replace("{{TOOL}}", JSON.stringify(request.tool, null, 2));
    code = code.replace("{{MATERIAL}}", JSON.stringify(request.material, null, 2));

    return code;
  }

  /**
   * Generate cache key for request
   */
  private getCacheKey(request: CodeInterpreterRequest): string {
    const key = {
      code: request.code,
      codeType: request.codeType,
      files: request.files,
      model: request.model
    };

    return aiCache.getKeyForRequest(key);
  }
}

// Export singleton instance
export const codeInterpreterService = new CodeInterpreterService();
