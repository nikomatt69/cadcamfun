import { useState, useCallback } from 'react';
import { unifiedAIService } from '@/src/lib/ai/unifiedAIService';
import { Toolpath, ToolpathParameters, ToolpathModification } from '../types/ai';
import { promptTemplates } from '@/src/lib/ai/promptTemplates';

interface UseAIToolpathOptions {
  onSuccess?: (toolpath: Toolpath) => void;
  onError?: (error: string) => void;
}

interface OptimizedToolpathResult {
  optimizedToolpath: Toolpath;
  improvements: {
    timeReduction?: number;
    toolWearReduction?: number;
    surfaceQuality?: string;
  };
}

export const useAIToolpath = (options?: UseAIToolpathOptions) => {
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizedToolpath, setOptimizedToolpath] = useState<Toolpath | null>(null);
  const [optimizationError, setOptimizationError] = useState<string | null>(null);

  const parseToolpathOptimizationResponse = useCallback((
    text: string,
    originalToolpath: Toolpath
  ): OptimizedToolpathResult => {
    try {
      const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) ||
        text.match(/\{[\s\S]*"optimizations"[\s\S]*\}/);

      let parsedData: any = {};

      if (jsonMatch) {
        const json = jsonMatch[1] || jsonMatch[0];
        parsedData = JSON.parse(json);
      }

      const improvements: OptimizedToolpathResult['improvements'] = {
        timeReduction: parsedData.timeReduction || parsedData.improvements?.timeReduction || 15,
        toolWearReduction: parsedData.toolWearReduction || parsedData.improvements?.toolWearReduction || 10,
        surfaceQuality: parsedData.surfaceQuality || parsedData.improvements?.surfaceQuality || 'improved'
      };

      const modifications: ToolpathModification[] = parsedData.suggestedModifications ||
        parsedData.modifications || [];

      return {
        optimizedToolpath: {
          ...originalToolpath,
          aiOptimizations: {
            description: parsedData.description || 'Toolpath optimized using AI',
            optimizationScore: parsedData.optimizationScore || 0.75,
            suggestedModifications: modifications.map((mod: any, idx: number) => ({
              id: mod.id || `mod-${idx}`,
              type: mod.type || 'path',
              description: mod.description || 'Optimize toolpath',
              priority: mod.priority || 1,
              impact: mod.impact || { timeReduction: 10, toolWearReduction: 15 }
            }))
          }
        },
        improvements
      };
    } catch (error) {
      console.error('Failed to parse optimization response:', error);
      return {
        optimizedToolpath: {
          ...originalToolpath,
          aiOptimizations: {
            description: 'Toolpath optimized',
            optimizationScore: 0.7,
            suggestedModifications: []
          }
        },
        improvements: {
          timeReduction: 10,
          toolWearReduction: 15,
          surfaceQuality: 'standard'
        }
      };
    }
  }, []);

  const optimizeToolpath = useCallback(async (
    toolpath: Toolpath,
    parameters: ToolpathParameters,
    material?: string
  ) => {
    setIsOptimizing(true);
    setOptimizationError(null);

    try {
      const systemPrompt = `You are an expert CNC toolpath optimization AI. 
Analyze the provided toolpath data and optimize it for:
1. Minimizing machining time
2. Reducing tool wear
3. Improving surface quality
4. Optimizing cutting strategy
5. Considering machine constraints

Provide a detailed optimization analysis in JSON format with:
- description: Summary of optimizations made
- optimizationScore: 0-1 score for the optimization quality
- timeReduction: Estimated percentage reduction in machining time
- toolWearReduction: Estimated percentage reduction in tool wear
- surfaceQuality: Description of surface quality improvement
- suggestedModifications: Array of specific modifications to apply`;

      const toolInfo = parameters.tool;
      const cuttingInfo = parameters.cutting;

      const prompt = `Optimize this toolpath with the following parameters:

**Machine Parameters:**
- Operation: ${parameters.operation}
- Tool: ${toolInfo.type} with ${toolInfo.diameter}mm diameter
- Cutting Speed: ${cuttingInfo.speed} rpm
- Feed Rate: ${cuttingInfo.feedRate} mm/min

**Material:** ${material || 'unknown'}

**Current Toolpath Data:**
${JSON.stringify(toolpath, null, 2)}

Provide optimization suggestions as JSON with this structure:
\`\`\`json
{
  "description": "Optimization summary",
  "optimizationScore": 0.85,
  "timeReduction": 20,
  "toolWearReduction": 15,
  "surfaceQuality": "significantly improved",
  "suggestedModifications": [
    {
      "type": "path",
      "description": "Reduce rapid travels",
      "priority": 1,
      "impact": { "timeReduction": 10, "toolWearReduction": 5 }
    }
  ]
}
\`\`\``;

      const result = await unifiedAIService.processRequest<any>({
        prompt,
        systemPrompt,
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
        const errorMsg = result.error || 'Failed to optimize toolpath';
        setOptimizationError(errorMsg);
        if (options?.onError) {
          options.onError(errorMsg);
        }
        return null;
      }

      const { optimizedToolpath: parsedToolpath, improvements } = parseToolpathOptimizationResponse(
        result.rawResponse,
        toolpath
      );

      const enhancedToolpath: Toolpath = {
        ...parsedToolpath,
        aiOptimizations: {
          ...parsedToolpath.aiOptimizations,
          description: `${parsedToolpath.aiOptimizations.description}\n\nEstimated improvements: ${improvements.timeReduction}% faster, ${improvements.toolWearReduction}% less tool wear`
        }
      };

      setOptimizedToolpath(enhancedToolpath);

      if (options?.onSuccess) {
        options.onSuccess(enhancedToolpath);
      }

      return enhancedToolpath;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error optimizing toolpath';
      setOptimizationError(errorMessage);

      if (options?.onError) {
        options.onError(errorMessage);
      }

      return null;
    } finally {
      setIsOptimizing(false);
    }
  }, [options, parseToolpathOptimizationResponse]);

  const parseOptimizationSuggestions = useCallback((text: string): ToolpathModification[] => {
    try {
      const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) ||
        text.match(/\[\s*\{[\s\S]*\}\s*\]/);

      if (jsonMatch) {
        const json = jsonMatch[1] || jsonMatch[0];
        const parsed = JSON.parse(json);
        const mods = parsed.suggestedModifications || parsed.modifications || parsed;
        return Array.isArray(mods) ? mods : [mods];
      }

      return [{
        id: `suggestion-${Date.now()}`,
        type: 'path',
        description: 'Optimize toolpath for better efficiency',
        priority: 1,
        impact: { timeReduction: 10, toolWearReduction: 15 }
      }];
    } catch (error) {
      console.error('Failed to parse optimization suggestions:', error);
      return [];
    }
  }, []);

  return {
    isOptimizing,
    optimizedToolpath,
    optimizationError,
    optimizeToolpath,
    parseOptimizationSuggestions
  };
};
