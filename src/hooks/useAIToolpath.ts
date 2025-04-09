// src/hooks/useAIToolpath.ts
import { useState } from 'react';
import { Toolpath, ToolpathParameters, ToolpathModification } from '../types/ai';
import { useAI } from '../components/ai/ai-new/AIContextProvider';
import { promptTemplates } from '../lib/ai/promptTemplates';

interface UseAIToolpathOptions {
  onSuccess?: (toolpath: Toolpath) => void;
  onError?: (error: string) => void;
}

export const useAIToolpath = (options?: UseAIToolpathOptions) => {
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizedToolpath, setOptimizedToolpath] = useState<Toolpath | null>(null);
  const [optimizationError, setOptimizationError] = useState<string | null>(null);
  const { analyzeDesign, state   } = useAI();

  /**
   * Optimize a toolpath using AI
   */
  const optimizeToolpath = async (
    toolpath: Toolpath, 
    parameters: ToolpathParameters,
    material?: string
  ) => {
    setIsOptimizing(true);
    setOptimizationError(null);
    
    try {
      // Costruire un prompt specializzato utilizzando i parametri del percorso utensile
      const systemPrompt = promptTemplates.gcodeOptimization.system;
      
      // Sostituire i placeholder nel modello di prompt
      const prompt = systemPrompt
        .replace('{{material}}', material || 'materiale sconosciuto')
        .replace('{{tool}}', `${parameters.tool.type} with ${parameters.tool.diameter}mm diameter`)
        .replace('{{parameters}}', JSON.stringify(parameters, null, 2));
      
      // Add the toolpath data
      const fullPrompt = `${prompt}\n\nToolpath data:\n${JSON.stringify(toolpath, null, 2)}`;
      
      // Process request
      const result = await <Toolpath>({
        prompt: fullPrompt,
        systemPrompt,
        temperature: 0.7,
        maxTokens: 4000,
        metadata: { toolpathId: toolpath.id, material }
      });
      
      if (!result || !result) {
        const errorMessage = result || 'Failed to optimize toolpath';
        setOptimizationError(errorMessage);
        
        if (options?.onError) {
          options.onError(errorMessage);
        }
        
        return null;
      }
      
      // Extract optimized toolpath
      const optimized = result;
      
      // Ensure proper structure with original data
      const enhancedToolpath: Toolpath = {
        ...toolpath,
        ...optimized,
        aiOptimizations: optimized.aiOptimizations || {
          description: 'Toolpath has been optimized for better performance.',
          optimizationScore: 0.75,
          suggestedModifications: []
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
  };

  /**
   * Parse optimization suggestions from AI text
   */
  const parseOptimizationSuggestions = (text: string): ToolpathModification[] => {
    try {
      // Try to find suggestions in different formats
      const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || 
                         text.match(/\[\s*\{[\s\S]*\}\s*\]/);
                         
      if (jsonMatch) {
        const json = jsonMatch[1] || jsonMatch[0];
        return JSON.parse(json);
      }
      
      // If no structured suggestions found, create a default one
      return [{
        id: `suggestion-${Date.now()}`,
        type: 'path',
        description: 'Optimize toolpath for better efficiency',
        priority: 1,
        impact: {
          timeReduction: 10,
          toolWearReduction: 15
        }
      }];
    } catch (error) {
      console.error('Failed to parse optimization suggestions:', error);
      return [];
    }
  };

  return {
    isOptimizing,
    optimizedToolpath,
    optimizationError,
    optimizeToolpath,
    parseOptimizationSuggestions
  };
};