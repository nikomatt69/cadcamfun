// src/lib/ai/openaiService.ts
import { AIRequest, AIResponse, AIModelType } from '@/src/types/AITypes';
import { aiAnalytics } from './ai-new/aiAnalytics';
import { aiCache } from './ai-new/aiCache';

/**
 * Classe di servizio per l'integrazione con l'API OpenAI
 * Mantiene la stessa interfaccia di aiCore per una facile intercambiabilità
 */
export class OpenAIService {
  private apiKey: string | undefined;
  private allowBrowser: boolean = true;
  private organizationId: string | undefined;
  
  constructor(options: { 
    apiKey?: string; 
    allowBrowser?: boolean;
    organizationId?: string;
  } = {}) {
    this.apiKey = options.apiKey || process.env.NEXT_PUBLIC_OPENAI_API_KEY;
    this.allowBrowser = options.allowBrowser ?? true;
    this.organizationId = options.organizationId || process.env.NEXT_PUBLIC_OPENAI_ORG_ID;
    
    if (!this.apiKey && typeof window !== 'undefined') {
      console.warn('No OpenAI API key provided. OpenAI features may not work correctly.');
    }
  }
  
  /**
   * Processa una richiesta OpenAI con supporto per streaming e caching
   */
  async processRequest<T>({
    prompt,
    model = 'gpt-4',
    systemPrompt,
    temperature = 0.7,
    maxTokens = 4000,
    parseResponse,
    onProgress,
    retryCount = 0
  }: AIRequest): Promise<AIResponse<T>> {
    // Check if API key is valid
    if (!this.apiKey) {
      return {
        rawResponse: null,
        data: null,
        error: 'No valid OpenAI API key available',
        success: false
      };
    }
    
    try {
      // Add monitoring/logging
      const startTime = Date.now();
      const requestId = aiAnalytics.trackRequestStart(
        'openai_request', 
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
      
      // Use proxy endpoint per common practice with browser access
      const apiEndpoint = '/api/ai/openai-proxy';
      
      // Prepare request
      const requestBody = {
        model,
        messages: [
          ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
          { role: 'user', content: prompt }
        ],
        max_tokens: maxTokens,
        temperature,
        stream: !!onProgress
      };
      
      let fullResponse = '';
      
      if (onProgress) {
        // Streaming implementation
        const response = await fetch(apiEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });
        
        if (!response.body) {
          throw new Error('Response body is null');
        }
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value);
          // Parse each line that starts with "data: " and isn't just "[DONE]"
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ') && !line.includes('[DONE]')) {
              try {
                const jsonStr = line.slice(6);
                const json = JSON.parse(jsonStr);
                if (json.choices?.[0]?.delta?.content) {
                  const content = json.choices[0].delta.content;
                  fullResponse += content;
                  onProgress(content);
                }
              } catch (e) {
                // Skip malformed JSON
              }
            }
          }
        }
      } else {
        // Non-streaming implementation
        const response = await fetch(apiEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to get response from OpenAI');
        }
        
        const responseData = await response.json();
        fullResponse = responseData.choices?.[0]?.message?.content || '';
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
        success: true
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
      
      // Implement retries for transient errors
      if (retryCount < 2) {
        console.log(`Retry attempt ${retryCount + 1} for OpenAI request`);
        
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
        success: false
      };
    }
  }

  /**
   * Imposta una nuova API key
   */
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }
  
  /**
   * Imposta l'ID dell'organizzazione (per account con più organizzazioni)
   */
  setOrganizationId(organizationId: string): void {
    this.organizationId = organizationId;
  }
}

// Export a singleton instance
export const openaiService = new OpenAIService();