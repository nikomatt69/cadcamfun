// src/lib/ai/aiDesignService.ts - Improved version
import { aiCore } from './aiCore';
import { 
  AIDesignSuggestion, 
  AIResponse,
  DesignAnalysisRequest,
 
} from '../../types/ai';
import { designPromptTemplates } from './promptTemplates';
import { aiCache } from './aiCache';
import { aiAnalytics } from './aiAnalytics';

export class AIDesignService {
  /**
   * Analyze a design and provide suggestions
   */
  async analyzeDesign(request: DesignAnalysisRequest): Promise<AIResponse<AIDesignSuggestion[]>> {
    const { elements, analysisType, specificConcerns: constraints } = request;
    
    // Generate a cache key based on the request
    const cacheKey = aiCache.getKeyForRequest({ 
      elements, 
      analysisType, 
      constraints 
    });
    
    // Check cache first
    const cachedResponse = aiCache.get<AIResponse<AIDesignSuggestion[]>>(cacheKey);
    if (cachedResponse) {
      return {
        ...cachedResponse,
        
      };
    }
    
    // Build prompt
    const prompt = this.buildAnalysisPrompt(elements, analysisType, constraints || []);
    
    // Track analytics
    const requestId = aiAnalytics.trackRequestStart(
      'design_analysis',
      'claude-3-5-sonnet-20240229',
      { analysisType, elementCount: elements.length }
    );
    
    try {
      const startTime = Date.now();
      
      // Process request
      const response = await aiCore.processRequest<AIDesignSuggestion[]>({
        prompt,
        systemPrompt: designPromptTemplates.analyzeSystem,
        parseResponse: this.parseDesignResponse
      });
      
      const processingTime = Date.now() - startTime;
      
      // Track completion
      aiAnalytics.trackRequestComplete(
        requestId,
        processingTime,
        response.success,
        prompt.length / 4,
        response.rawResponse?.length ? response.rawResponse.length / 4 : 0
      );
      
      // Cache the response
      if (response.success && response.data) {
        aiCache.set(cacheKey, response);
      }
      
      return response;
    } catch (error) {
      // Track error
      aiAnalytics.trackEvent({
        eventType: 'error',
        eventName: 'design_analysis_error',
        errorType: error instanceof Error ? error.name : 'unknown',
        success: false,
        metadata: { requestId, message: error instanceof Error ? error.message : 'Unknown error' }
      });
      
      return {
        rawResponse: null,
        data: null,
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false,
        suggestions: undefined
      };
    }
  }
  
  /**
   * Generate a new component based on description
   */
  async generateComponent(description: string, constraints: any): Promise<AIResponse<Element[]>> {
    const prompt = this.buildGenerationPrompt(description, constraints);
    
    return aiCore.processRequest<Element[]>({
      prompt,
      systemPrompt: designPromptTemplates.generateSystem,
      parseResponse: this.parseComponentResponse
    });
  }
  
  /**
   * Build prompt for design analysis
   */
  private buildAnalysisPrompt(
    elements: Element[], 
    analysisType: string, 
    constraints: string[]
  ): string {
    let prompt = designPromptTemplates.analyze
      .replace('{{elements}}', JSON.stringify(elements, null, 2));
    
    // Add analysis type
    prompt += `\nFocus on ${analysisType} analysis in particular.`;
    
    // Add constraints if any
    if (constraints.length > 0) {
      prompt += `\nAdditional constraints to consider:\n`;
      constraints.forEach((constraint, index) => {
        prompt += `${index + 1}. ${constraint}\n`;
      });
    }
    
    return prompt;
  }
  
  /**
   * Build prompt for component generation
   */
  private buildGenerationPrompt(description: string, constraints: any): string {
    return designPromptTemplates.generate
      .replace('{{description}}', description)
      .replace('{{constraints}}', JSON.stringify(constraints, null, 2));
  }
  
  /**
   * Parse design analysis response
   */
  private parseDesignResponse(text: string): AIDesignSuggestion[] {
    try {
      // Try different JSON extraction methods
      
      // First, try to find a code block with JSON
      const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || 
                        text.match(/```\n([\s\S]*?)\n```/);
      
      if (jsonMatch && jsonMatch[1]) {
        return JSON.parse(jsonMatch[1]);
      }
      
      // Next, try to find any JSON object
      const objectMatch = text.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        const parsed = JSON.parse(objectMatch[0]);
        
        // Handle both direct array and nested object formats
        if (Array.isArray(parsed)) {
          return parsed;
        } else if (parsed.suggestions) {
          return parsed.suggestions;
        } else if (parsed.results) {
          return parsed.results;
        }
      }
      
      // Finally look for a JSON array
      const arrayMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (arrayMatch) {
        return JSON.parse(arrayMatch[0]);
      }
      
      throw new Error('No valid JSON found in response');
    } catch (error) {
      console.error('Failed to parse design response:', error);
      throw error;
    }
  }
  
  /**
   * Parse component generation response
   */
  private parseComponentResponse(text: string): Element[] {
    try {
      // Similar extraction logic as above
      const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || 
                        text.match(/```\n([\s\S]*?)\n```/) ||
                        text.match(/\[\s*\{[\s\S]*\}\s*\]/);
                        
      if (!jsonMatch) {
        throw new Error('No valid JSON found in response');
      }
      
      const content = jsonMatch[1] || jsonMatch[0];
      return JSON.parse(content);
    } catch (error) {
      console.error('Failed to parse component response:', error);
      throw error;
    }
  }
}

// Export a singleton instance
export const aiDesignService = new AIDesignService();