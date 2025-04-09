import { AIModelType, AIRequest, AIResponse, TextToCADRequest, AIDesignSuggestion, MCPRequestParams, MCPResponse } from '@/src/types/AITypes';
import { aiCache } from './ai-new/aiCache';
import { aiAnalytics } from './ai-new/aiAnalytics';
import { promptTemplates } from './promptTemplates';
import { Element } from '@/src/store/elementsStore';
import { mcpService } from './ai-new/mcpService';
import { aiConfigManager } from './ai-new/aiConfigManager';

/**
 * Servizio AI unificato che gestisce tutte le interazioni con i modelli AI
 * e fornisce metodi specializzati per i diversi casi d'uso dell'applicazione.
 */
export class UnifiedAIService {
  private apiKey: string;
  private allowBrowser: boolean = true;
  private defaultModel: AIModelType = 'claude-3-7-sonnet-20250219';
  private defaultMaxTokens: number = 6000;
  private mcpEnabled: boolean = false;
  private mcpStrategy: 'aggressive' | 'balanced' | 'conservative' = 'balanced';
  private mcpCacheLifetime: number = 3600000; // 1 ora in millisecondi

  constructor(apiKey?: string) {
    this.apiKey = apiKey || '';
    
    // Leggi le configurazioni da aiConfigManager se disponibili
    const config = aiConfigManager.getConfig();
    if (config) {
      this.defaultModel = config.defaultModel || this.defaultModel;
      this.defaultMaxTokens = config.maxTokens || this.defaultMaxTokens;
      this.allowBrowser = config.allowBrowser ?? this.allowBrowser;
      this.mcpEnabled = config.mcpEnabled ?? this.mcpEnabled;
      
      // Carica le impostazioni MCP se disponibili
      if (config.mcpStrategy) {
        this.mcpStrategy = config.mcpStrategy as 'aggressive' | 'balanced' | 'conservative';
      }
      if (config.mcpCacheLifetime) {
        this.mcpCacheLifetime = config.mcpCacheLifetime;
      }
    }
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
    // Determina se utilizzare MCP
    const shouldUseMCP = useMCP ?? this.mcpEnabled;
    
    // Se MCP è abilitato, utilizza il servizio MCP
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
    
    // Genera una chiave di cache basata sui parametri della richiesta
    const cacheKey = aiCache.getKeyForRequest({ 
      prompt, 
      model, 
      systemPrompt, 
      temperature 
    });
    
    // Verifica se la risposta è già in cache
    const cachedResponse = aiCache.get<AIResponse<T>>(cacheKey);
    if (cachedResponse) {
      return {
        ...cachedResponse,
        fromCache: true
      };
    }
    
    // Traccia l'inizio della richiesta per analytics
    const requestId = aiAnalytics.trackRequestStart(
      'ai_request', 
      model, 
      { promptLength: prompt.length, ...metadata }
    );
    
    const startTime = Date.now();
    
    try {
      let fullResponse = '';
      let tokenUsage = {
        promptTokens: Math.round(prompt.length / 4), // stima approssimativa
        completionTokens: 0,
        totalTokens: Math.round(prompt.length / 4)
      };
      
      // Usa il proxy API invece di chiamare direttamente Anthropic
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
          system: systemPrompt
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'API request failed');
      }
      
      const data = await response.json();
      
      // Estrai il testo dalla risposta
      fullResponse = data.content[0]?.type === 'text' 
        ? data.content[0].text 
        : '';
        
      // Ottieni l'utilizzo dei token dalla risposta
      if (data.usage) {
        tokenUsage = {
          promptTokens: data.usage.input_tokens,
          completionTokens: data.usage.output_tokens,
          totalTokens: data.usage.input_tokens + data.usage.output_tokens
        };
      } else {
        // Stima dei token se non disponibile nella risposta
        tokenUsage.completionTokens = Math.round(fullResponse.length / 4);
        tokenUsage.totalTokens = tokenUsage.promptTokens + tokenUsage.completionTokens;
      }
      
      // Calcola il tempo di elaborazione
      const processingTime = Date.now() - startTime;
      
      // Registra il completamento della richiesta
      aiAnalytics.trackRequestComplete(
        requestId,
        processingTime,
        true,
        tokenUsage.promptTokens,
        tokenUsage.completionTokens
      );
      
      // Analizza la risposta se è fornita una funzione di parsing
      let parsedData: T | null = null;
      let parsingError: Error | null = null;
      
      if (parseResponse && fullResponse) {
        try {
          parsedData = await parseResponse(fullResponse);
        } catch (err) {
          parsingError = err instanceof Error ? err : new Error('Failed to parse response');
          
          // Traccia l'errore di parsing
          aiAnalytics.trackEvent({
            eventType: 'error',
            eventName: 'parsing_error',
            success: false,
            metadata: { 
              requestId, 
              error: parsingError.message 
            }
          });
        }
      }
      
      // Prepara la risposta finale
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
          requestId
        }
      };
      
      // Memorizza la risposta nella cache
      aiCache.set(cacheKey, finalResponse);
      
      return finalResponse;
    } catch (error) {
      // Traccia l'errore
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
      
      // Restituisci una risposta di errore
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
    // Configura parametri MCP basati sulla strategia selezionata
    const defaultMCPParams: MCPRequestParams = this.getMCPParamsFromStrategy();
    
    // Unisci i parametri di default con quelli forniti (se presenti)
    const mcpParams: MCPRequestParams = {
      ...defaultMCPParams,
      ...(request.mcpParams || {})
    };
    
    // Aggiungi parametri MCP alla richiesta
    const mcpRequest: AIRequest = {
      ...request,
      mcpParams
    };
    
    try {
      // Determina la priorità in base al tipo di richiesta
      const priority = this.getMCPPriorityFromMetadata(request.metadata);
      
      // Invia la richiesta tramite MCP service
      const mcpResponse = await mcpService.enqueue<T>(mcpRequest, priority);
      
      // Registra analisi MCP se è stata utilizzata la cache
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
      
      // Fallback al processamento standard in caso di errore MCP
      console.log('Falling back to standard request processing');
      
      // Rimuovi i parametri MCP e riprova con il processamento standard
      const { mcpParams, useMCP, ...standardRequest } = request;
      return this.processRequest<T>(standardRequest);
    }
  }
  
  /**
   * Determina i parametri MCP basati sulla strategia configurata
   */
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
  
  /**
   * Determina la priorità MCP in base ai metadati della richiesta
   */
  private getMCPPriorityFromMetadata(metadata: Record<string, any> = {}): 'high' | 'normal' | 'low' {
    const requestType = metadata?.type || '';
    
    // Richieste ad alta priorità
    if (
      requestType.includes('message') || 
      requestType.includes('critical') ||
      requestType.includes('interactive')
    ) {
      return 'high';
    }
    
    // Richieste a bassa priorità
    if (
      requestType.includes('background') || 
      requestType.includes('batch') ||
      requestType.includes('analysis')
    ) {
      return 'low';
    }
    
    // Priorità normale di default
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
    
    // Costruisce il prompt di sistema utilizzando il template
    const systemPrompt = promptTemplates.textToCAD.system
      .replace('{{complexity}}', complexity)
      .replace('{{style}}', style);
    
    // Costruisce il prompt utente
    let prompt = promptTemplates.textToCAD.user.replace('{{description}}', description);
    
    // Aggiunge i vincoli se presenti
    if (constraints) {
      prompt += '\n\nConstraints:\n' + JSON.stringify(constraints, null, 2);
    }
    
    // Aggiunge il contesto se presente
    if (context && context.length > 0) {
      prompt += '\n\nReference Context:\n';
      
      // Limita la dimensione di ciascun contesto per evitare di superare i limiti di token
      const maxContextLength = 3000; // Dimensione massima in caratteri per documento
      
      context.forEach((contextItem, index) => {
        // Tronca il contesto se troppo lungo
        const truncatedContext = contextItem.length > maxContextLength 
          ? contextItem.substring(0, maxContextLength) + '... [content truncated]' 
          : contextItem;
        
        prompt += `\n--- Context Document ${index + 1} ---\n${truncatedContext}\n`;
      });
      
      // Aggiunge istruzioni specifiche per l'utilizzo del contesto
      prompt += '\n\nPlease consider the above reference context when generating the CAD model. ' +
                'Use relevant specifications, measurements, and design principles from the context ' +
                'to inform your design, while adhering to the provided constraints.';
    }
    
    return this.processRequest<Element[]>({
      prompt,
      systemPrompt,
      model: 'claude-3-7-sonnet-20250219', // Usa il modello più potente per generazione CAD
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
      model: 'claude-3-7-sonnet-20250219', // Usa il modello più potente per analisi approfondite
      temperature: 0.3, // Temperatura bassa per risposte più analitiche
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
      parseResponse: (text) => Promise.resolve(text), // Non serve parsing speciale
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
    
    Provide suggestions as a JSON array of strings. Each suggestion should be clear, specific, and actionable.`;
    
    return this.processRequest<string[]>({
      prompt,
      systemPrompt: `You are an AI CAD/CAM assistant helping users with ${mode} tasks. Generate helpful context-aware suggestions.`,
      model: 'claude-3-haiku-20240229', // Usa il modello più veloce per suggerimenti
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
   * Ottimizza parametri di lavorazione in base al materiale e all'utensile
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
   * Genera completamenti per G-code durante l'editing
   */
  async completeGCode(context: string, cursorPosition: any): Promise<AIResponse<string>> {
    const prompt = `Complete the following G-code at the cursor position.
    
    Current G-code:
    ${context}
    
    Cursor position: line ${cursorPosition.lineNumber}, column ${cursorPosition.column}
    
    Provide only the completion text, no explanations.`;
    
    return this.processRequest<string>({
      prompt,
      systemPrompt: `You are a CNC programming expert. Complete G-code accurately and efficiently.`,
      model: 'claude-3-haiku-20240229', // Modello veloce per completamenti in tempo reale
      temperature: 0.2,
      maxTokens: 100,
      parseResponse: (text) => Promise.resolve(text.trim()),
      metadata: {
        type: 'gcode_completion',
        contextLength: context.length
      }
    });
  }

  /**
   * Processa un messaggio diretto dall'assistente AI
   */
  async processMessage(message: string, mode: string): Promise<AIResponse<string>> {
    let contextPrefix = '';
    
    // Aggiunge contesto in base alla modalità
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
      systemPrompt: contextPrefix + 'Provide helpful, concise, and accurate responses to the user.',
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
  }): void {
    if (config.defaultModel) this.defaultModel = config.defaultModel;
    if (config.defaultMaxTokens) this.defaultMaxTokens = config.defaultMaxTokens;
    if (config.allowBrowser !== undefined) this.allowBrowser = config.allowBrowser;
    
    // Aggiungi configurazioni MCP
    if (config.mcpEnabled !== undefined) this.mcpEnabled = config.mcpEnabled;
    if (config.mcpStrategy) this.mcpStrategy = config.mcpStrategy;
    if (config.mcpCacheLifetime) this.mcpCacheLifetime = config.mcpCacheLifetime;
  }

  /**
   * Parser: Converti testo in elementi CAD
   */
  private parseTextToCADResponse = async (text: string): Promise<Element[]> => {
    try {
      // Cerca blocchi JSON nella risposta
      const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || 
                        text.match(/\[\s*\{[\s\S]*\}\s*\]/);
                        
      if (!jsonMatch) {
        throw new Error('No valid JSON found in response');
      }
      
      const json = jsonMatch[1] || jsonMatch[0];
      const elements = JSON.parse(json);
      
      // Valida e arricchisce gli elementi con valori predefiniti
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

  /**
   * Parser: Analisi del design
   */
  private parseDesignResponse = async (text: string): Promise<AIDesignSuggestion[]> => {
    try {
      // Cerca JSON in diversi formati
      const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || 
                        text.match(/```\n([\s\S]*?)\n```/) ||
                        text.match(/\[\s*\{[\s\S]*\}\s*\]/);
                        
      if (!jsonMatch) {
        throw new Error('No valid JSON found in response');
      }
      
      const json = jsonMatch[1] || jsonMatch[0];
      const parsed = JSON.parse(json);
      
      // Gestisce sia array diretti che oggetti annidati
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

  /**
   * Parser: Suggerimenti
   */
  private parseSuggestionsResponse = async (text: string): Promise<string[]> => {
    try {
      // Cerca JSON in diversi formati
      const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || 
                        text.match(/\[\s*"[\s\S]*"\s*\]/) ||
                        text.match(/\[\s*\{[\s\S]*\}\s*\]/);
                        
      if (!jsonMatch) {
        // Se non trova JSON, estrae elenchi puntati
        const bulletPoints = text.match(/[-*]\s+([^\n]+)/g);
        if (bulletPoints) {
          return bulletPoints.map(point => point.replace(/^[-*]\s+/, '').trim());
        }
        
        // Altrimenti divide per righe
        return text.split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0);
      }
      
      const json = jsonMatch[1] || jsonMatch[0];
      const parsed = JSON.parse(json);
      
      // Gestisce sia array di stringhe che array di oggetti
      if (Array.isArray(parsed)) {
        if (typeof parsed[0] === 'string') {
          return parsed;
        } else if (typeof parsed[0] === 'object') {
          return parsed.map(item => item.text || item.suggestion || item.description || JSON.stringify(item));
        }
      }
      
      throw new Error('Unexpected JSON format in suggestions response');
    } catch (error) {
      console.error('Failed to parse suggestions:', error);
      return [];
    }
  };

  /**
   * Parser: Parametri di lavorazione
   */
  private parseMachiningResponse = async (text: string): Promise<any> => {
    try {
      // Cerca JSON in diversi formati
      const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || 
                        text.match(/\{[\s\S]*\}/);
                        
      if (jsonMatch) {
        const json = jsonMatch[1] || jsonMatch[0];
        return JSON.parse(json);
      }
      
      // Se non trova JSON, crea un oggetto strutturato
      const params: any = {};
      
      // Estrae velocità di taglio (SFM o m/min)
      const speedMatch = text.match(/cutting speed:?\s*([\d.]+)\s*(sfm|m\/min)/i);
      if (speedMatch) {
        params.cuttingSpeed = {
          value: parseFloat(speedMatch[1]),
          unit: speedMatch[2].toLowerCase()
        };
      }
      
      // Estrae avanzamento (feed rate)
      const feedMatch = text.match(/feed(?:\s*rate)?:?\s*([\d.]+)\s*(ipr|mm\/rev)/i);
      if (feedMatch) {
        params.feedRate = {
          value: parseFloat(feedMatch[1]),
          unit: feedMatch[2].toLowerCase()
        };
      }
      
      // Estrae profondità di taglio
      const depthMatch = text.match(/depth of cut:?\s*([\d.]+)\s*(in|mm)/i);
      if (depthMatch) {
        params.depthOfCut = {
          value: parseFloat(depthMatch[1]),
          unit: depthMatch[2].toLowerCase()
        };
      }
      
      // Estrae step-over
      const stepoverMatch = text.match(/step(?:\s*over|\-over):?\s*([\d.]+)(?:\s*%)?/i);
      if (stepoverMatch) {
        params.stepover = parseFloat(stepoverMatch[1]);
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