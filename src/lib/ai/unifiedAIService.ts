// src/lib/ai/unifiedAIService.ts
// Unified AI Service - Now using AIProvider with multi-provider support

import { AIModelType, AIRequest, AIResponse, TextToCADRequest, AIDesignSuggestion, MCPRequestParams, MCPResponse } from '@/src/types/AITypes';
import { aiCache } from './ai-new/aiCache';
import { aiAnalytics } from './ai-new/aiAnalytics';
import { promptTemplates } from './promptTemplates';
import { Element } from '@/src/store/elementsStore';
import { mcpService } from './ai-new/mcpService';
import { aiConfigManager } from './ai-new/aiConfigManager';
import { AIProvider, createAIProvider, type ProviderType, type AIProviderConfig } from './AIProvider';

// Cache for provider instances
const providerCache = new Map<string, AIProvider>();

function getProviderFromConfig(config: {
  provider?: ProviderType;
  apiKey?: string;
  model?: string;
}): AIProvider {
  const providerKey = config.provider || 'openrouter';
  const apiKey = config.apiKey || '';
  
  // Check cache
  const cacheKey = `${providerKey}-${apiKey.slice(0, 8)}`;
  if (providerCache.has(cacheKey)) {
    return providerCache.get(cacheKey)!;
  }

  // Create new provider
  const providerConfig: AIProviderConfig = {
    provider: providerKey,
    apiKey: apiKey || getDefaultApiKey(providerKey),
    model: config.model,
  };

  const provider = createAIProvider(providerConfig);
  providerCache.set(cacheKey, provider);
  
  return provider;
}

function getDefaultApiKey(provider: ProviderType): string {
  switch (provider) {
    case 'openrouter':
      return process.env.OPENROUTER_API_KEY || '';
    case 'openai':
      return process.env.OPENAI_API_KEY || '';
    case 'anthropic':
      return process.env.ANTHROPIC_API_KEY || '';
    case 'google':
      return process.env.GOOGLE_API_KEY || '';
    default:
      return process.env.OPENAI_API_KEY || '';
  }
}

/**
 * Servizio AI unificato che gestisce tutte le interazioni con i modelli AI
 * e fornisce metodi specializzati per i diversi casi d'uso dell'applicazione.
 * 
 * Ora supporta provider multipli: OpenAI, Anthropic, Google, OpenRouter
 */
export class UnifiedAIService {
  private apiKey: string;
  private allowBrowser: boolean = true;
  private defaultModel: AIModelType = 'claude-3-7-sonnet-20250219';
  private defaultMaxTokens: number = 6000;
  private mcpEnabled: boolean = false;
  private mcpStrategy: 'aggressive' | 'balanced' | 'conservative' = 'balanced';
  private mcpCacheLifetime: number = 3600000;
  private currentProvider: ProviderType = 'openrouter'; // Default to openrouter
  private aiProvider: AIProvider | null = null;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || '';
    
    // Leggi le configurazioni da aiConfigManager se disponibili
    const config = aiConfigManager.getConfig();
    if (config) {
      this.defaultModel = config.defaultModel || this.defaultModel;
      this.defaultMaxTokens = config.maxTokens || this.defaultMaxTokens;
      this.allowBrowser = config.allowBrowser ?? this.allowBrowser;
      this.mcpEnabled = config.mcpEnabled ?? this.mcpEnabled;
      
      if (config.mcpStrategy) {
        this.mcpStrategy = config.mcpStrategy as 'aggressive' | 'balanced' | 'conservative';
      }
      if (config.mcpCacheLifetime) {
        this.mcpCacheLifetime = config.mcpCacheLifetime;
      }
    }
    
    // Initialize the AI provider
    this.initializeProvider();
  }

  private initializeProvider(): void {
    try {
      this.aiProvider = getProviderFromConfig({
        provider: this.currentProvider,
        apiKey: this.apiKey,
        model: this.defaultModel,
      });
    } catch (error) {
      console.warn('Failed to initialize AI provider, will use proxy:', error);
    }
  }

  /**
   * Set the current AI provider
   */
  setProvider(provider: ProviderType, apiKey?: string): void {
    this.currentProvider = provider;
    this.aiProvider = getProviderFromConfig({
      provider,
      apiKey: apiKey || this.apiKey,
      model: this.defaultModel,
    });
  }

  /**
   * Get current provider info
   */
  getProviderInfo(): { provider: ProviderType; model: string } {
    return {
      provider: this.currentProvider,
      model: this.defaultModel,
    };
  }

  /**
   * Processo generico per le richieste AI con supporto per caching e analytics
   */
  async processRequest<T>({
    prompt,
    model = this.defaultModel,
    systemPrompt,
    temperature = 0.7,
    maxTokens = this.defaultMaxTokens,
    parseResponse,
    onProgress,
    metadata = {},
    useMCP,
    mcpParams
  }: AIRequest): Promise<AIResponse<T>> {
    // Check if MCP is enabled and should be used
    const shouldUseMCP = useMCP ?? this.mcpEnabled;
    
    if (shouldUseMCP) {
      return this.processMCPRequest<T>({
        prompt,
        model,
        systemPrompt,
        temperature,
        maxTokens,
        parseResponse,
        onProgress,
        metadata,
        mcpParams
      });
    }
    
    // Generate cache key
    const cacheKey = aiCache.getKeyForRequest({ 
      prompt, 
      model, 
      systemPrompt, 
      temperature 
    });
    
    // Check cache
    const cachedResponse = aiCache.get<AIResponse<T>>(cacheKey);
    if (cachedResponse) {
      return {
        ...cachedResponse,
        fromCache: true
      };
    }
    
    // Track request start
    const requestId = aiAnalytics.trackRequestStart(
      'ai_request', 
      model, 
      { promptLength: prompt.length, ...metadata }
    );
    
    const startTime = Date.now();
    
    try {
      // Try to use the new AIProvider first
      if (this.aiProvider) {
        const result = await this.aiProvider.generateText({
          prompt,
          system: systemPrompt,
          temperature,
          maxTokens,
        });

        const processingTime = Date.now() - startTime;
        
        aiAnalytics.trackRequestComplete(
          requestId,
          processingTime,
          true,
          result.usage?.promptTokens || 0,
          result.usage?.completionTokens || 0
        );

        let parsedData: T | null = null;
        let parsingError: Error | null = null;
        
        if (parseResponse && result.text) {
          try {
            parsedData = await parseResponse(result.text);
          } catch (err) {
            parsingError = err instanceof Error ? err : new Error('Failed to parse response');
          }
        }

        const finalResponse: AIResponse<T> = {
          rawResponse: result.text,
          data: parsedData,
          error: parsingError?.message,
          parsingError,
          processingTime,
          model,
          success: !parsingError,
          usage: result.usage,
          metadata: {
            ...metadata,
            requestId,
            provider: this.currentProvider,
          }
        };

        aiCache.set(cacheKey, finalResponse);
        
        return finalResponse;
      }

      // Fallback to proxy API
      const response = await fetch('/api/ai/proxy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: maxTokens,
          temperature,
          system: systemPrompt,
          provider: this.currentProvider,
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'API request failed');
      }
      
      const data = await response.json();
      const fullResponse = data.content?.[0]?.text || data.content?.[0]?.type === 'text' ? data.content[0].text : '';
      
      const tokenUsage = data.usage ? {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
        totalTokens: data.usage.input_tokens + data.usage.output_tokens
      } : {
        promptTokens: Math.round(prompt.length / 4),
        completionTokens: Math.round(fullResponse.length / 4),
        totalTokens: Math.round(prompt.length / 4) + Math.round(fullResponse.length / 4)
      };

      const processingTime = Date.now() - startTime;
      
      aiAnalytics.trackRequestComplete(
        requestId,
        processingTime,
        true,
        tokenUsage.promptTokens,
        tokenUsage.completionTokens
      );

      let parsedData: T | null = null;
      let parsingError: Error | null = null;
      
      if (parseResponse && fullResponse) {
        try {
          parsedData = await parseResponse(fullResponse);
        } catch (err) {
          parsingError = err instanceof Error ? err : new Error('Failed to parse response');
        }
      }

      const finalResponse: AIResponse<T> = {
        rawResponse: fullResponse,
        data: parsedData,
        error: parsingError?.message,
        parsingError,
        processingTime,
        model,
        success: !parsingError,
        usage: tokenUsage,
        metadata: {
          ...metadata,
          requestId,
          provider: this.currentProvider,
        }
      };

      aiCache.set(cacheKey, finalResponse);
      
      return finalResponse;
    } catch (error) {
      aiAnalytics.trackEvent({
        eventType: 'error',
        eventName: 'api_error',
        errorType: error instanceof Error ? error.name : 'unknown',
        success: false,
        metadata: { 
          requestId, 
          message: error instanceof Error ? error.message : 'Unknown error' 
        }
      });

      return {
        rawResponse: null,
        data: null,
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false,
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0
        },
        metadata: {
          ...metadata,
          requestId
        }
      };
    }
  }

  /**
   * Elabora una richiesta tramite il protocollo MCP
   */
  private async processMCPRequest<T>(request: AIRequest): Promise<AIResponse<T>> {
    const defaultMCPParams: MCPRequestParams = this.getMCPParamsFromStrategy();
    
    const mcpParams: MCPRequestParams = {
      ...defaultMCPParams,
      ...(request.mcpParams || {})
    };

    const mcpRequest: AIRequest = {
      ...request,
      mcpParams
    };

    try {
      const priority = this.getMCPPriorityFromMetadata(request.metadata);
      const mcpResponse = await mcpService.enqueue<T>(mcpRequest, priority);

      if (mcpResponse.cacheHit) {
        aiAnalytics.trackEvent({
          eventType: 'mcp',
          eventName: 'cache_hit',
          success: true,
          metadata: {
            similarity: mcpResponse.similarity,
            savings: mcpResponse.savingsEstimate
          }
        });
      }

      return mcpResponse.response;
    } catch (error) {
      console.error('MCP request failed:', error);
      console.log('Falling back to standard request processing');
      
      const { mcpParams, useMCP, ...standardRequest } = request;
      return this.processRequest<T>(standardRequest);
    }
  }
  
  private getMCPParamsFromStrategy(): MCPRequestParams {
    switch (this.mcpStrategy) {
      case 'aggressive':
        return {
          cacheStrategy: 'hybrid',
          minSimilarity: 0.65,
          cacheTTL: this.mcpCacheLifetime,
          priority: 'speed',
          storeResult: true
        };
      case 'conservative':
        return {
          cacheStrategy: 'exact',
          minSimilarity: 0.9,
          cacheTTL: this.mcpCacheLifetime,
          priority: 'quality',
          storeResult: true
        };
      case 'balanced':
      default:
        return {
          cacheStrategy: 'semantic',
          minSimilarity: 0.8,
          cacheTTL: this.mcpCacheLifetime,
          priority: 'quality',
          storeResult: true
        };
    }
  }
  
  private getMCPPriorityFromMetadata(metadata: Record<string, any> = {}): 'high' | 'normal' | 'low' {
    const requestType = metadata?.type || '';
    
    if (requestType.includes('message') || requestType.includes('critical') || requestType.includes('interactive')) {
      return 'high';
    }
    
    if (requestType.includes('background') || requestType.includes('batch') || requestType.includes('analysis')) {
      return 'low';
    }
    
    return 'normal';
  }

  /**
   * Converte descrizione di testo in elementi CAD
   */
  async textToCADElements(request: TextToCADRequest): Promise<AIResponse<Element[]>> {
    const { 
      description, 
      constraints, 
      style = 'precise', 
      complexity = 'moderate',
      context = [] 
    } = request;
    
    const systemPrompt = promptTemplates.textToCAD.system
      .replace('{{complexity}}', complexity)
      .replace('{{style}}', style);
    
    let prompt = promptTemplates.textToCAD.user.replace('{{description}}', description);
    
    if (constraints) {
      prompt += '\n\nConstraints:\n' + JSON.stringify(constraints, null, 2);
    }
    
    if (context && context.length > 0) {
      const maxContextLength = 3000;
      
      context.forEach((contextItem, index) => {
        const truncatedContext = contextItem.length > maxContextLength 
          ? contextItem.substring(0, maxContextLength) + '... [content truncated]' 
          : contextItem;
        
        prompt += `\n--- Context Document ${index + 1} ---\n${truncatedContext}\n`;
      });
      
      prompt += '\n\nPlease consider the above reference context when generating the CAD model.';
    }
    
    return this.processRequest<Element[]>({
      prompt,
      systemPrompt,
      model: 'claude-3-7-sonnet-20250219',
      temperature: complexity === 'creative' ? 0.8 : 0.5,
      maxTokens: this.defaultMaxTokens,
      parseResponse: this.parseTextToCADResponse,
      metadata: {
        type: 'text_to_cad',
        description: description.substring(0, 100),
        complexity,
        style,
        contextCount: context?.length || 0
      }
    });
  }

  /**
   * Analizza progetti CAD e fornisce suggerimenti
   */
  async analyzeDesign(elements: Element[]): Promise<AIResponse<AIDesignSuggestion[]>> {
    const prompt = promptTemplates.designAnalysis.user
      .replace('{{elements}}', JSON.stringify(elements, null, 2));
    
    return this.processRequest<AIDesignSuggestion[]>({
      prompt,
      systemPrompt: promptTemplates.designAnalysis.system,
      model: 'claude-3-7-sonnet-20250219',
      temperature: 0.3,
      maxTokens: this.defaultMaxTokens,
      parseResponse: this.parseDesignResponse,
      metadata: {
        type: 'design_analysis',
        elementCount: elements.length
      }
    });
  }

  /**
   * Ottimizza G-code per macchine CNC
   */
  async optimizeGCode(gcode: string, machineType: string, material?: string): Promise<AIResponse<string>> {
    const systemPrompt = promptTemplates.gcodeOptimization.system
      .replace('{{machineType}}', machineType);
    
    const constraints = `- Optimize for speed and efficiency
    - Maintain part accuracy and quality
    - Ensure safe machine operation
    - Follow ${machineType} best practices`;
    
    const prompt = promptTemplates.gcodeOptimization.user
      .replace('{{machineType}}', machineType)
      .replace('{{material}}', material || 'unknown material')
      .replace('{{gcode}}', gcode)
      .replace('{{constraints}}', constraints);
    
    return this.processRequest<string>({
      prompt,
      systemPrompt,
      model: 'claude-3-5-sonnet-20240229',
      temperature: 0.3,
      maxTokens: this.defaultMaxTokens,
      parseResponse: (text) => Promise.resolve(text),
      metadata: {
        type: 'gcode_optimization',
        machineType,
        material,
        codeLength: gcode.length
      }
    });
  }

  /**
   * Genera suggerimenti specifici per il contesto corrente
   */
  async generateSuggestions(context: string, mode: string): Promise<AIResponse<string[]>> {
    const prompt = `Based on the current ${mode} context, generate 3-5 helpful suggestions.
    
    Context details:
    ${context}
    
    Provide suggestions as a JSON array of strings.`;
    
    return this.processRequest<string[]>({
      prompt,
      systemPrompt: `You are an AI CAD/CAM assistant helping users with ${mode} tasks.`,
      model: 'claude-3-haiku-20240229',
      temperature: 0.7,
      maxTokens: 1000,
      parseResponse: this.parseSuggestionsResponse,
      metadata: {
        type: 'suggestions',
        mode
      }
    });
  }

  /**
   * Ottimizza parametri di lavorazione
   */
  async optimizeMachiningParameters(material: string, toolType: string, operation: string): Promise<AIResponse<any>> {
    const prompt = promptTemplates.machiningParameters.user
      .replace('{{material}}', material)
      .replace('{{tool}}', toolType)
      .replace('{{operation}}', operation)
      .replace('{{machine}}', 'Generic CNC');
    
    return this.processRequest<any>({
      prompt,
      systemPrompt: promptTemplates.machiningParameters.system,
      model: 'claude-3-5-sonnet-20240229',
      temperature: 0.3,
      maxTokens: 4000,
      parseResponse: this.parseMachiningResponse,
      metadata: {
        type: 'machining_parameters',
        material,
        toolType,
        operation
      }
    });
  }

  /**
   * Processa un messaggio diretto dall'assistente AI
   */
  async processMessage(message: string, mode: string): Promise<AIResponse<string>> {
    let contextPrefix = '';
    
    switch (mode) {
      case 'cad':
        contextPrefix = 'You are an expert CAD design assistant helping with 3D modeling. ';
        break;
      case 'cam':
        contextPrefix = 'You are an expert CAM programming assistant helping with CNC manufacturing. ';
        break;
      case 'gcode':
        contextPrefix = 'You are an expert G-code programming assistant helping with CNC code. ';
        break;
      case 'toolpath':
        contextPrefix = 'You are an expert toolpath optimization assistant for CNC machines. ';
        break;
      default:
        contextPrefix = 'You are a helpful CAD/CAM software assistant. ';
    }
    
    return this.processRequest<string>({
      prompt: message,
      systemPrompt: contextPrefix + 'Provide helpful, concise, and accurate responses.',
      model: 'claude-3-5-sonnet-20240229',
      temperature: 0.7,
      maxTokens: 4000,
      parseResponse: (text) => Promise.resolve(text),
      metadata: {
        type: 'assistant_message',
        mode,
        messageLength: message.length
      }
    });
  }

  /**
   * Configura i parametri del servizio AI
   */
  setConfig(config: {
    defaultModel?: AIModelType;
    defaultMaxTokens?: number;
    allowBrowser?: boolean;
    mcpEnabled?: boolean;
    mcpStrategy?: 'aggressive' | 'balanced' | 'conservative';
    mcpCacheLifetime?: number;
    provider?: ProviderType;
    apiKey?: string;
  }): void {
    if (config.defaultModel) this.defaultModel = config.defaultModel;
    if (config.defaultMaxTokens) this.defaultMaxTokens = config.defaultMaxTokens;
    if (config.allowBrowser !== undefined) this.allowBrowser = config.allowBrowser;
    if (config.mcpEnabled !== undefined) this.mcpEnabled = config.mcpEnabled;
    if (config.mcpStrategy) this.mcpStrategy = config.mcpStrategy;
    if (config.mcpCacheLifetime) this.mcpCacheLifetime = config.mcpCacheLifetime;
    
    if (config.provider) {
      this.setProvider(config.provider, config.apiKey);
    }
  }

  // Private parsing methods
  private parseTextToCADResponse = async (text: string): Promise<Element[]> => {
    try {
      const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || 
                        text.match(/\[\s*\{[\s\S]*\}\s*\]/);
                        
      if (!jsonMatch) {
        throw new Error('No valid JSON found in response');
      }
      
      const json = jsonMatch[1] || jsonMatch[0];
      const elements = JSON.parse(json);
      
      return elements.map((el: any) => ({
        type: el.type || 'cube',
        x: el.x ?? 0,
        y: el.y ?? 0,
        z: el.z ?? 0,
        width: el.width ?? 50,
        height: el.height ?? 50,
        depth: el.depth ?? 50,
        radius: el.radius ?? 25,
        color: el.color ?? '#1e88e5',
        ...(el.rotation && {
          rotation: {
            x: el.rotation.x ?? 0,
            y: el.rotation.y ?? 0,
            z: el.rotation.z ?? 0
          }
        }),
        ...el
      }));
    } catch (error) {
      console.error('Failed to parse CAD elements:', error);
      throw error;
    }
  };

  private parseDesignResponse = async (text: string): Promise<AIDesignSuggestion[]> => {
    try {
      const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || 
                        text.match(/```\n([\s\S]*?)\n```/) ||
                        text.match(/\[\s*\{[\s\S]*\}\s*\]/);
      
      if (!jsonMatch) {
        throw new Error('No valid JSON found in response');
      }
      
      const json = jsonMatch[1] || jsonMatch[0];
      const parsed = JSON.parse(json);
      
      if (Array.isArray(parsed)) {
        return parsed;
      } else if (parsed.suggestions) {
        return parsed.suggestions;
      } else {
        throw new Error('Unexpected JSON format in design response');
      }
    } catch (error) {
      console.error('Failed to parse design response:', error);
      throw error;
    }
  };

  private parseSuggestionsResponse = async (text: string): Promise<string[]> => {
    try {
      const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || 
                        text.match(/\[\s*"[\s\S]*"\s*\]/) ||
                        text.match(/\[\s*\{[\s\S]*\}\s*\]/);
      
      if (!jsonMatch) {
        const bulletPoints = text.match(/[-*]\s+([^\n]+)/g);
        if (bulletPoints) {
          return bulletPoints.map(point => point.replace(/^[-*]\s+/, '').trim());
        }
        
        return text.split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0);
      }
      
      const json = jsonMatch[1] || jsonMatch[0];
      const parsed = JSON.parse(json);
      
      if (Array.isArray(parsed)) {
        if (typeof parsed[0] === 'string') {
          return parsed;
        } else if (typeof parsed[0] === 'object') {
          return parsed.map((item: any) => item.text || item.suggestion || item.description || JSON.stringify(item));
        }
      }
      
      throw new Error('Unexpected JSON format in suggestions response');
    } catch (error) {
      console.error('Failed to parse suggestions:', error);
      return [];
    }
  };

  private parseMachiningResponse = async (text: string): Promise<any> => {
    try {
      const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || 
                        text.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const json = jsonMatch[1] || jsonMatch[0];
        return JSON.parse(json);
      }
      
      const params: any = {};
      
      const speedMatch = text.match(/cutting speed:?\s*([\d.]+)\s*(sfm|m\/min)/i);
      if (speedMatch) {
        params.cuttingSpeed = {
          value: parseFloat(speedMatch[1]),
          unit: speedMatch[2].toLowerCase()
        };
      }
      
      const feedMatch = text.match(/feed(?:\s*rate)?:?\s*([\d.]+)\s*(ipr|mm\/rev)/i);
      if (feedMatch) {
        params.feedRate = {
          value: parseFloat(feedMatch[1]),
          unit: feedMatch[2].toLowerCase()
        };
      }
      
      const depthMatch = text.match(/depth of cut:?\s*([\d.]+)\s*(in|mm)/i);
      if (depthMatch) {
        params.depthOfCut = {
          value: parseFloat(depthMatch[1]),
          unit: depthMatch[2].toLowerCase()
        };
      }

      return params;
    } catch (error) {
      console.error('Failed to parse machining parameters:', error);
      throw error;
    }
  };
}

// Esporta un'istanza singleton
export const unifiedAIService = new UnifiedAIService();
