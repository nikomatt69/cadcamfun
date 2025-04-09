// src/lib/ai/aiCore.ts - Improved version
import Anthropic from '@anthropic-ai/sdk';
import { AIServiceConfig, AIRequest, AIResponse, AIModelType } from '../../types/ai';
import { aiCache } from './aiCache';
import { aiAnalytics } from './aiAnalytics';
import { z } from 'zod';

const AIResponseSchema = z.object({
  suggestions: z.array(z.string()).optional(),
  rawResponse: z.string().nullable(),
  metadata: z.record(z.unknown()).optional(),
  timestamp: z.string().datetime(),
  model: z.enum(['claude-3-7-sonnet-20250219']),
  usage: z.object({
    promptTokens: z.number(),
    completionTokens: z.number(),
    totalTokens: z.number()
  })
});

export type ValidatedAIResponse = z.infer<typeof AIResponseSchema>;

export async function validateAIResponse(response: unknown): Promise<ValidatedAIResponse> {
  return AIResponseSchema.parse(response);
}

export class AICore {
  private client: Anthropic;
  private config: AIServiceConfig;
  private requestQueue: AIRequest[] = [];
  private processing = false;
  private apiKeyValid = false;
  
  constructor(config: AIServiceConfig) {
    this.config = {
      apiKey: process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY,
      // Default values will be overridden by config
      ...config
    };
    
    if (!this.config.apiKey) {
      console.warn('No Anthropic API key provided. AI features may not work correctly.');
    } else {
      this.apiKeyValid = true;
    }
    
    this.client = new Anthropic({
      apiKey: this.config.apiKey || process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY,
      dangerouslyAllowBrowser: this.config.allowBrowser
    });
  }
  
  /**
   * Process an AI request with error handling, retries, and caching
   */
  async processRequest<T>({
    prompt,
    model = this.config.defaultModel as AIModelType,
    systemPrompt,
    temperature = 0.7,
    maxTokens = 8000,
    parseResponse,
    onProgress,
    retryCount = 0
  }: AIRequest): Promise<AIResponse<T>> {
    // Check if API key is valid
    if (!this.apiKeyValid) {
      return {
        rawResponse: null,
        data: null,
        error: 'No valid API key available',
        success: false,
        suggestions: undefined
      };
    }
    
    try {
      // Add monitoring/logging
      const startTime = Date.now();
      const requestId = aiAnalytics.trackRequestStart(
        'ai_request', 
        model, 
        { promptLength: prompt.length, hasSystemPrompt: !!systemPrompt }
      );
      
      // Check cache first (use prompt as cache key)
      const cacheKey = aiCache.getKeyForRequest({ prompt, model, systemPrompt, temperature });
      const cachedResponse = aiCache.get<AIResponse<T>>(cacheKey);
      
      if (cachedResponse) {
        aiAnalytics.trackEvent({
          eventType: 'response',
          eventName: 'cache_hit',
          success: true,
          metadata: { requestId, cacheKey }
        });
        
        return {
          ...cachedResponse,
          
          success: true
        };
      }
      
      // Make API call with streaming support if onProgress callback is provided
      let fullResponse = '';
      
      if (onProgress) {
        // Streaming response
        const stream = await this.client.messages.create({
          model,
          max_tokens: maxTokens,
          temperature,
          system: systemPrompt,
          messages: [{ role: 'user', content: prompt }],
          stream: true,
        });
        for await (const chunk of stream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            const text = chunk.delta.text;
            fullResponse += text;
            onProgress(text);
          }
        }
      } else {
        // Non-streaming response
        const response = await this.client.messages.create({
          model,
          max_tokens: maxTokens,
          temperature,
          system: systemPrompt,
          messages: [{ role: 'user', content: prompt }]
        });
        
        fullResponse = response.content[0]?.type === 'text' 
          ? response.content[0].text 
          : '';
      }
      
      // Parse response if a parser is provided
      let parsedData: T | null = null;
      let parsingError: Error | null = null;
      
      if (parseResponse && fullResponse) {
        try {
          parsedData = await parseResponse(fullResponse);
        } catch (err) {
          parsingError = err instanceof Error ? err : new Error('Failed to parse response');
          
          // Log parsing error
          aiAnalytics.trackEvent({
            eventType: 'error',
            eventName: 'parsing_error',
            errorType: 'parsing',
            success: false,
            metadata: { requestId, error: parsingError.message }
          });
        }
      }
      
      // Calculate processing time
      const processingTime = Date.now() - startTime;
      
      // Track completion
      aiAnalytics.trackRequestComplete(
        requestId,
        processingTime,
        true,
        prompt.length / 4, // rough estimate of prompt tokens
        fullResponse.length / 4 // rough estimate of completion tokens
      );
      
      // Create response object
      const finalResponse: AIResponse<T> = {
          rawResponse: fullResponse,
          data: parsedData,
          parsingError,
          processingTime,
          model,
          success: true,
          warnings: undefined
      };
      
      // Cache the response
      aiCache.set(cacheKey, finalResponse);
      
      return finalResponse;
    } catch (error) {
      // Track error
      aiAnalytics.trackEvent({
        eventType: 'error',
        eventName: 'api_error',
        errorType: error instanceof Error ? error.name : 'unknown',
        success: false,
        metadata: { message: error instanceof Error ? error.message : 'Unknown error' }
      });
      
      // Implement retries if configured
      if (retryCount < (2 )) {
        console.log(`Retry attempt ${retryCount + 1} for AI request`);
        
        // Exponential backoff
        const backoffTime = Math.min(1000 * Math.pow(2, retryCount), 10000);
        await new Promise(resolve => setTimeout(resolve, backoffTime));
        
        // Retry with incremented retry count
        return this.processRequest<T>({
          prompt,
          model,
          systemPrompt,
          temperature,
          maxTokens,
          parseResponse,
          onProgress,
          retryCount: retryCount + 1
        });
      }
      
      // Return error response after max retries
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        rawResponse: null,
        data: null,
        error: errorMessage,
        success: false,
        suggestions:undefined
      };
    }
  }
  
  /**
   * Validate API key by making a minimal request
   */
  async validateApiKey(): Promise<boolean> {
    if (!this.config.apiKey) {
      this.apiKeyValid = false;
      return false;
    }
    
    try {
      await this.client.messages.create({
        model: 'claude-3-7-sonnet-20250219',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'API key validation test' }]
      });
      
      this.apiKeyValid = true;
      return true;
    } catch (error) {
      console.error('API key validation failed:', error);
      this.apiKeyValid = false;
      return false;
    }
  }
  
  /**
   * Set a new API key
   */
  setApiKey(apiKey: string): void {
    this.config.apiKey = apiKey;
    this.client = new Anthropic({
      apiKey,
      dangerouslyAllowBrowser: this.config.allowBrowser
    });
    
    // Validate the new key
    this.validateApiKey();
  }
}

// Export a singleton instance
export const aiCore = new AICore({
  allowBrowser: true,
  defaultModel: 'claude-3-7-sonnet-20250219',
  maxTokens: 6000,
  temperature: 0.7,
  cacheEnabled: true,
  analyticsEnabled: true
});