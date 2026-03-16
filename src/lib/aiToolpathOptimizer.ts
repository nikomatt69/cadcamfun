import { unifiedAIService } from './ai/unifiedAIService';
import { Toolpath, ToolpathParameters, ToolpathModification } from '../types/ai';

interface ToolpathOptimizationResult {
  success: boolean;
  optimizedToolpath?: Toolpath;
  error?: string;
  improvements?: {
    timeReduction: number;
    toolWearReduction: number;
    surfaceQuality: string;
  };
}

export class AIToolpathOptimizer {
  async optimize(
    toolpath: Toolpath,
    parameters: ToolpathParameters,
    material?: string
  ): Promise<ToolpathOptimizationResult> {
    const prompt = this.constructOptimizationPrompt(toolpath, parameters, material);

    try {
      const result = await unifiedAIService.processRequest<any>({
        prompt,
        systemPrompt: this.getSystemPrompt(parameters),
        model: 'claude-3-5-sonnet-20240229',
        temperature: 0.3,
        maxTokens: 4000,
        parseResponse: async (text) => text,
        metadata: {
          type: 'toolpath_optimization',
          toolpathId: toolpath.id,
          material
        }
      });

      if (!result.success || !result.rawResponse) {
        return {
          success: false,
          error: result.error || 'Failed to optimize toolpath'
        };
      }

      const optimizedToolpath = this.parseOptimizedToolpath(result.rawResponse, toolpath);
      const improvements = this.extractImprovements(result.rawResponse);

      return {
        success: true,
        optimizedToolpath,
        improvements
      };
    } catch (error) {
      console.error('Toolpath Optimization Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during optimization'
      };
    }
  }

  private getSystemPrompt(parameters: ToolpathParameters): string {
    return `You are an expert CNC toolpath optimization AI assistant.

Your task is to analyze toolpath data and provide optimization suggestions that:
1. Minimize machining time through efficient tool paths
2. Reduce tool wear by optimizing cutting strategies
3. Improve surface quality
4. Optimize approach/retract motions
5. Consider machine kinematic constraints

Provide detailed, actionable optimization recommendations in JSON format.`;
  }

  private constructOptimizationPrompt(
    toolpath: Toolpath,
    parameters: ToolpathParameters,
    material?: string
  ): string {
    const toolInfo = parameters.tool;
    const cuttingInfo = parameters.cutting;

    return `**Toolpath Optimization Request**

**Current Parameters:**
- Operation: ${parameters.operation}
- Tool: ${toolInfo.type}
- Tool Diameter: ${toolInfo.diameter}mm
- Cutting Speed: ${cuttingInfo.speed} RPM
- Feed Rate: ${cuttingInfo.feedRate} mm/min
- Material: ${material || 'Not specified'}

**Current Toolpath:**
${JSON.stringify({
  name: toolpath.name,
  points: toolpath.points?.slice(0, 50),
  segments: toolpath.segments?.slice(0, 20),
  totalPoints: toolpath.points?.length || 0
}, null, 2)}

${toolpath.points && toolpath.points.length > 50 ? `... (${toolpath.points.length - 50} more points)` : ''}

Please analyze this toolpath and provide optimization recommendations in this JSON format:
\`\`\`json
{
  "description": "Summary of main optimizations",
  "optimizationScore": 0.0-1.0,
  "timeReduction": 0-50,
  "toolWearReduction": 0-30,
  "surfaceQuality": "improved/maintained/degraded",
  "suggestedModifications": [
    {
      "type": "path|parameter|strategy",
      "description": "Specific optimization",
      "priority": 1-5,
      "impact": {
        "timeReduction": 0-30,
        "toolWearReduction": 0-20
      }
    }
  ]
}
\`\`\``;
  }

  private parseOptimizedToolpath(
    responseText: string,
    originalToolpath: Toolpath
  ): Toolpath {
    try {
      const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/) ||
        responseText.match(/\{[\s\S]*"description"[\s\S]*\}/);

      if (!jsonMatch) {
        return this.createDefaultOptimizedToolpath(originalToolpath, responseText);
      }

      const json = jsonMatch[1] || jsonMatch[0];
      const parsed = JSON.parse(json);

      const modifications: ToolpathModification[] = (parsed.suggestedModifications || []).map(
        (mod: any, idx: number) => ({
          id: mod.id || `opt-${Date.now()}-${idx}`,
          type: mod.type || 'path',
          description: mod.description || 'Optimization suggestion',
          priority: mod.priority || 3,
          impact: {
            timeReduction: mod.impact?.timeReduction || mod.impact?.time_reduction || 10,
            toolWearReduction: mod.impact?.toolWearReduction || mod.impact?.tool_wear_reduction || 5
          }
        })
      );

      return {
        ...originalToolpath,
        aiOptimizations: {
          description: parsed.description || 'Toolpath optimized',
          optimizationScore: parsed.optimizationScore || parsed.optimization_score || 0.7,
          suggestedModifications: modifications
        }
      };
    } catch (error) {
      console.error('Failed to parse optimization response:', error);
      return this.createDefaultOptimizedToolpath(originalToolpath, responseText);
    }
  }

  private createDefaultOptimizedToolpath(
    originalToolpath: Toolpath,
    description: string
  ): Toolpath {
    return {
      ...originalToolpath,
      aiOptimizations: {
        description: description.substring(0, 500),
        optimizationScore: 0.6,
        suggestedModifications: []
      }
    };
  }

  private extractImprovements(responseText: string): {
    timeReduction: number;
    toolWearReduction: number;
    surfaceQuality: string;
  } {
    try {
      const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/) ||
        responseText.match(/\{[\s\S]*\}/);

      if (!jsonMatch) {
        const timeMatch = responseText.match(/time.*?reduction[:\s]*(\d+)/i);
        const wearMatch = responseText.match(/wear.*?reduction[:\s]*(\d+)/i);
        const qualityMatch = responseText.match(/surface.*?quality[:\s]*(\w+)/i);

        return {
          timeReduction: timeMatch ? parseInt(timeMatch[1]) : 15,
          toolWearReduction: wearMatch ? parseInt(wearMatch[1]) : 10,
          surfaceQuality: qualityMatch ? qualityMatch[1] : 'improved'
        };
      }

      const json = jsonMatch[1] || jsonMatch[0];
      const parsed = JSON.parse(json);

      return {
        timeReduction: parsed.timeReduction || parsed.time_reduction || 15,
        toolWearReduction: parsed.toolWearReduction || parsed.tool_wear_reduction || 10,
        surfaceQuality: parsed.surfaceQuality || parsed.surface_quality || 'improved'
      };
    } catch {
      return {
        timeReduction: 15,
        toolWearReduction: 10,
        surfaceQuality: 'improved'
      };
    }
  }
}

export const aiToolpathOptimizer = new AIToolpathOptimizer();
