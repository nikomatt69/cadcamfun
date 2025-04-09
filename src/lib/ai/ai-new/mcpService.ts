// src/lib/ai/mcpService.ts
import { AIRequest, AIResponse, AIModelType, MCPRequestParams, MCPResponse } from '@/src/types/AITypes';
import { aiAnalytics } from './aiAnalytics';
import { aiCache } from './aiCache';

interface MCPOptions {
  maxRetries: number;
  retryDelay: number;
  timeoutMs: number;
  priorityLevels: {
    high: number;
    normal: number;
    low: number;
  };
}

export class MCPService {
  private requestQueue: Map<string, {
    request: AIRequest;
    priority: number;
    timestamp: number;
    resolve: (value: any) => void;
    reject: (reason: any) => void;
  }> = new Map();
  
  private processingQueue: boolean = false;
  private options: MCPOptions;
  
  constructor(options?: Partial<MCPOptions>) {
    this.options = {
      maxRetries: 3,
      retryDelay: 1000,
      timeoutMs: 30000,
      priorityLevels: {
        high: 100,
        normal: 50,
        low: 10
      },
      ...options
    };
    
    // Start processing queue
    this.processQueue();
  }
  
  /**
   * Enqueue a request to be processed with the MCP protocol
   */
  async enqueue<T>(request: AIRequest, priority: 'high' | 'normal' | 'low' = 'normal'): Promise<MCPResponse<T>> {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    // Track analytics for the request start
    aiAnalytics.trackRequestStart(
      'mcp_request',
      request.model || 'unknown',
      { priority, requestType: request.metadata?.type || 'unknown' }
    );
    
    return new Promise((resolve, reject) => {
      // Add request to queue
      this.requestQueue.set(requestId, {
        request,
        priority: this.options.priorityLevels[priority],
        timestamp: Date.now(),
        resolve,
        reject
      });
      
      // Setup timeout
      setTimeout(() => {
        if (this.requestQueue.has(requestId)) {
          this.requestQueue.delete(requestId);
          reject(new Error('Request timeout'));
          
          aiAnalytics.trackEvent({
            eventType: 'error',
            eventName: 'request_timeout',
            success: false,
            metadata: { requestId }
          });
        }
      }, this.options.timeoutMs);
      
      // Trigger queue processing if not already running
      if (!this.processingQueue) {
        this.processQueue();
      }
    });
  }
  
  /**
   * Process the queue based on priority and timing
   */
  private async processQueue() {
    this.processingQueue = true;
    
    while (this.requestQueue.size > 0) {
      // Get highest priority request
      const nextRequest = this.getNextRequest();
      
      if (!nextRequest) {
        break;
      }
      
      const { request, resolve, reject } = nextRequest;
      
      try {
        // Execute the request
        const result = await this.executeRequest(request);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    }
    
    this.processingQueue = false;
  }
  
  /**
   * Get the next request to process based on priority
   */
  private getNextRequest() {
    let highestPriority = -1;
    let oldestTimestamp = Infinity;
    let selectedRequestId: string | null = null;
    // Find the highest priority request
    for (const [id, entry] of Array.from(this.requestQueue.entries())) {
      if (entry.priority > highestPriority) {
        highestPriority = entry.priority;
        oldestTimestamp = entry.timestamp;
        selectedRequestId = id;
      } else if (entry.priority === highestPriority && entry.timestamp < oldestTimestamp) {
        // If same priority, take the oldest
        oldestTimestamp = entry.timestamp;
        selectedRequestId = id;
      }
    }
    
    if (selectedRequestId) {
      const entry = this.requestQueue.get(selectedRequestId);
      this.requestQueue.delete(selectedRequestId);
      return entry;
    }
    
    return null;
  }
  
  /**
   * Execute a request to the AI API with retries
   */
  private async executeRequest(request: AIRequest, retryCount = 0): Promise<MCPResponse<any>> {
    const startTime = Date.now();
    const cacheParams = request.mcpParams || {
      cacheStrategy: 'exact',
      cacheTTL: 3600000, // 1 hour
      storeResult: true
    };
    
    // Genera la chiave di cache basata sui parametri della richiesta e la strategia
    const cacheKey = this.generateCacheKey(request, cacheParams.cacheStrategy);
    
    // Controlla se abbiamo un risultato in cache
    const cachedResult = await this.checkCache(cacheKey, cacheParams);
    if (cachedResult) {
      // Calcola i risparmi stimati
      const savingsEstimate = {
        tokens: cachedResult.usage?.totalTokens || 500, // Stima predefinita
        cost: this.estimateCost(cachedResult.usage?.totalTokens || 500, request.model),
        timeMs: Date.now() - startTime
      };
      
      // Formato di risposta per risultati in cache
      return {
        cacheHit: true,
        similarity: cachedResult.metadata?.similarity || 1.0,
        response: cachedResult,
        savingsEstimate
      };
    }
    
    try {
      // Prepara il corpo della richiesta
      const { model = 'claude-3-5-sonnet-20240229', systemPrompt, prompt, temperature = 0.3, maxTokens = 4000 } = request;
      
      // Chiamata al proxy API invece di chiamare direttamente Anthropic
      const response = await fetch('/api/ai/proxy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: maxTokens,
          temperature,
          system: systemPrompt
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'API request failed');
      }
      
      const data = await response.json();
      const content = data.content[0]?.type === 'text' ? data.content[0].text : '';
      
      // Elabora la risposta con il parser se fornito
      let parsedData = null;
      let parsingError = null;
      
      if (request.parseResponse && content) {
        try {
          parsedData = await request.parseResponse(content);
        } catch (error) {
          parsingError = error instanceof Error ? error : new Error('Parsing failed');
          
          aiAnalytics.trackEvent({
            eventType: 'error',
            eventName: 'parsing_error',
            errorType: 'parsing',
            success: false,
            metadata: { error: parsingError.message }
          });
        }
      }
      
      // Calcola il tempo di elaborazione
      const processingTime = Date.now() - startTime;
      
      // Prepara la risposta
      const aiResponse: AIResponse<any> = {
        rawResponse: content,
        data: parsedData,
        error: parsingError?.message,
        success: !parsingError,
        processingTime,
        usage: {
          promptTokens: data.usage?.input_tokens || 0,
          completionTokens: data.usage?.output_tokens || 0,
          totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)
        }
      };
      
      // Se storeResult è true, salva in cache
      if (cacheParams.storeResult) {
        await this.storeInCache(cacheKey, aiResponse, cacheParams.cacheTTL || 3600000);
      }
      
      // Formato di risposta MCP
      return {
        cacheHit: false,
        response: aiResponse,
        savingsEstimate: {
          tokens: 0,
          cost: 0,
          timeMs: 0
        }
      };
    } catch (error) {
      // Gestione dei tentativi
      if (retryCount < this.options.maxRetries) {
        console.log(`Retrying request (${retryCount + 1}/${this.options.maxRetries})...`);
        
        // Backoff esponenziale
        const delay = this.options.retryDelay * Math.pow(2, retryCount);
        await new Promise(resolve => setTimeout(resolve, delay));
        
        return this.executeRequest(request, retryCount + 1);
      }
      
      // Traccia l'errore
      aiAnalytics.trackEvent({
        eventType: 'error',
        eventName: 'request_failed',
        errorType: error instanceof Error ? error.name : 'unknown',
        success: false,
        metadata: { 
          message: error instanceof Error ? error.message : 'Unknown error',
          retries: retryCount
        }
      });
      
      // Risposta di errore
      const errorResponse: AIResponse<any> = {
        rawResponse: null,
        data: null,
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false
      };
      
      return {
        cacheHit: false,
        response: errorResponse,
        savingsEstimate: {
          tokens: 0,
          cost: 0,
          timeMs: 0
        }
      };
    }
  }
  /**
   * Genera una chiave di cache basata sulla richiesta e la strategia
   */
  private generateCacheKey(request: AIRequest, strategy: string): string {
    const { prompt, model, systemPrompt, temperature } = request;
    
    if (strategy === 'exact') {
      // Per cache esatta, includi tutti i parametri
      return `mcp:${model}:${temperature}:${systemPrompt}:${prompt}`;
    } else {
      // Per cache semantica, includi solo il modello e l'hash della richiesta
      const requestHash = this.hashString(`${prompt}:${systemPrompt || ''}`);
      return `mcp:semantic:${model}:${requestHash}`;
    }
  }
  
  /**
   * Verifica se esiste un risultato in cache
   */
  private async checkCache(cacheKey: string, params: MCPRequestParams): Promise<AIResponse<any> | null> {
    // Implementazione di base, in produzione usare una soluzione più sofisticata
    return aiCache.get(cacheKey) as AIResponse<any> | null;
  }
  
  /**
   * Salva un risultato in cache
   */
  private async storeInCache(cacheKey: string, response: AIResponse<any>, ttl: number): Promise<void> {
    await aiCache.set(cacheKey, response, ttl);
  }
  
  /**
   * Stima il costo in base ai token usati e al modello
   */
  private estimateCost(tokens: number, model?: string): number {
    // Stima basica dei costi per token
    // In una implementazione reale, usare tariffe aggiornate dei provider
    const ratePerToken = model?.includes('sonnet') ? 0.000015 : 0.00001;
    return tokens * ratePerToken;
  }
  
  /**
   * Funzione hash semplice per generare identificatori di stringhe
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Converti in int a 32 bit
    }
    return hash.toString(16);
  }
}

// Export a singleton instance
export const mcpService = new MCPService();