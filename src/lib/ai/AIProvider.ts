// src/lib/ai/AIProvider.ts
// Unified AI Provider - Agnostic wrapper for multiple AI providers
// Uses native fetch API for maximum compatibility

export type ProviderType = 'openai' | 'anthropic' | 'google' | 'openrouter' | 'azure';

export interface AIProviderConfig {
  provider: ProviderType;
  apiKey: string;
  model?: string;
  baseURL?: string;
  maxTokens?: number;
  temperature?: number;
  organization?: string;
}

export interface AIResponse<T> {
  text: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: string;
  data?: T;
  rawResponse?: any;
}

export interface AIStreamResponse {
  text: string;
  done: boolean;
}

/**
 * Unified AI Provider Class
 * Supports multiple providers with a consistent API
 * Uses native fetch - no external AI SDK required
 */
export class AIProvider {
  private config: AIProviderConfig;
  private model: string;

  constructor(config: AIProviderConfig) {
    this.config = config;
    this.model = config.model || this.getDefaultModel(config.provider);
  }

  private getDefaultModel(provider: ProviderType): string {
    switch (provider) {
      case 'openai':
        return 'gpt-4o';
      case 'anthropic':
        return 'claude-3-5-sonnet-20250219';
      case 'google':
        return 'gemini-1.5-pro';
      case 'openrouter':
        return 'anthropic/claude-3.5-sonnet';
      case 'azure':
        return 'gpt-4o';
      default:
        return 'gpt-4o';
    }
  }

  private getBaseURL(): string {
    if (this.config.baseURL) return this.config.baseURL;
    
    switch (this.config.provider) {
      case 'openai':
        return 'https://api.openai.com/v1';
      case 'anthropic':
        return 'https://api.anthropic.com/v1';
      case 'google':
        return 'https://generativelanguage.googleapis.com/v1beta';
      case 'openrouter':
        return 'https://openrouter.ai/api/v1';
      default:
        return 'https://api.openai.com/v1';
    }
  }

  private getHeaders(isStreaming: boolean = false): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    switch (this.config.provider) {
      case 'openai':
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
        break;
      case 'anthropic':
        headers['x-api-key'] = this.config.apiKey;
        headers['anthropic-version'] = '2023-06-01';
        break;
      case 'google':
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
        break;
      case 'openrouter':
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
        headers['HTTP-Referer'] = 'https://cadcamfun.com';
        headers['X-Title'] = 'CadCamFun';
        break;
      case 'azure':
        headers['api-key'] = this.config.apiKey;
        break;
    }

    return headers;
  }

  private buildRequestBody(prompt: string, system?: string, temperature?: number, maxTokens?: number, stream?: boolean): any {
    const temp = temperature ?? this.config.temperature ?? 0.7;
    const tokens = maxTokens ?? this.config.maxTokens ?? 4096;

    switch (this.config.provider) {
      case 'openai':
      case 'azure':
      case 'openrouter':
        return {
          model: this.model,
          messages: [
            ...(system ? [{ role: 'system', content: system }] : []),
            { role: 'user', content: prompt }
          ],
          temperature: temp,
          max_tokens: tokens,
          stream: stream || false,
        };

      case 'anthropic':
        return {
          model: this.model,
          messages: [
            ...(system ? [{ role: 'system', content: system }] : []),
            { role: 'user', content: prompt }
          ],
          temperature: temp,
          max_tokens: tokens,
          stream: stream || false,
        };

      case 'google':
        return {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: temp,
            maxOutputTokens: tokens,
          }
        };

      default:
        return { model: this.model, messages: [{ role: 'user', content: prompt }] };
    }
  }

  private getEndpoint(): string {
    const base = this.getBaseURL();
    
    switch (this.config.provider) {
      case 'openai':
        return `${base}/chat/completions`;
      case 'anthropic':
        return `${base}/messages`;
      case 'google':
        return `${base}/models/${this.model}:generateContent`;
      case 'openrouter':
        return `${base}/chat/completions`;
      case 'azure':
        return `${base}/deployments/${this.model}/chat/completions?api-version=2024-02-15-preview`;
      default:
        return `${base}/chat/completions`;
    }
  }

  /**
   * Generate text from a prompt
   */
  async generateText(options: {
    prompt: string;
    system?: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<AIResponse<string>> {
    const { prompt, system, temperature, maxTokens } = options;
    const endpoint = this.getEndpoint();
    const body = this.buildRequestBody(prompt, system, temperature, maxTokens);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`AI API Error (${response.status}): ${error}`);
      }

      const data = await response.json();
      return this.parseResponse(data);
    } catch (error) {
      console.error('AI Provider Error:', error);
      throw error;
    }
  }

  private parseResponse(data: any): AIResponse<string> {
    let text = '';
    let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    let finishReason = 'unknown';

    switch (this.config.provider) {
      case 'openai':
      case 'openrouter':
      case 'azure':
        const openaiChoice = data.choices?.[0];
        text = openaiChoice?.message?.content || '';
        finishReason = openaiChoice?.finish_reason || 'unknown';
        if (data.usage) {
          usage = {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          };
        }
        break;

      case 'anthropic':
        text = data.content?.[0]?.text || '';
        finishReason = data.stop_reason || 'unknown';
        if (data.usage) {
          usage = {
            promptTokens: data.usage.input_tokens,
            completionTokens: data.usage.output_tokens,
            totalTokens: data.usage.input_tokens + data.usage.output_tokens,
          };
        }
        break;

      case 'google':
        text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        finishReason = data.candidates?.[0]?.finishReason || 'unknown';
        break;
    }

    return {
      text,
      usage,
      finishReason,
      rawResponse: data,
    };
  }

  /**
   * Stream text generation
   */
  async *streamText(options: {
    prompt: string;
    system?: string;
    temperature?: number;
  }): AsyncGenerator<AIStreamResponse> {
    const { prompt, system, temperature } = options;
    const endpoint = this.getEndpoint();
    const body = this.buildRequestBody(prompt, system, temperature, undefined, true);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`AI API Error (${response.status}): ${error}`);
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        
        if (trimmed === 'data: [DONE]') {
          yield { text: '', done: true };
          return;
        }

        const data = trimmed.slice(6);
        try {
          const parsed = JSON.parse(data);
          const text = this.extractStreamText(parsed);
          if (text) {
            yield { text, done: false };
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }
    }

    yield { text: '', done: true };
  }

  private extractStreamText(data: any): string {
    switch (this.config.provider) {
      case 'openai':
      case 'openrouter':
      case 'azure':
        return data.choices?.[0]?.delta?.content || '';
      case 'anthropic':
        return data.delta?.text || '';
      default:
        return '';
    }
  }

  /**
   * Change the active model
   */
  setModel(model: string): void {
    this.model = model;
  }

  /**
   * Get current model
   */
  getModel(): string {
    return this.model;
  }

  /**
   * Get provider info
   */
  getProviderInfo(): { type: ProviderType; model: string } {
    return {
      type: this.config.provider,
      model: this.model,
    };
  }
}

// Factory function
export function createAIProvider(config: AIProviderConfig): AIProvider {
  return new AIProvider(config);
}

// Default instance
let defaultProvider: AIProvider | null = null;

export function setDefaultProvider(provider: AIProvider): void {
  defaultProvider = provider;
}

export function getDefaultProvider(): AIProvider | null {
  return defaultProvider;
}

// Convenience function
export async function generateAIText(
  prompt: string,
  options?: {
    provider?: ProviderType;
    model?: string;
    system?: string;
    apiKey?: string;
  }
): Promise<string> {
  const apiKey = options?.apiKey || 
    process.env.OPENROUTER_API_KEY || 
    process.env.OPENAI_API_KEY || 
    process.env.ANTHROPIC_API_KEY || '';
  
  const providerType = options?.provider || 'openrouter';
  
  const provider = new AIProvider({
    provider: providerType,
    apiKey,
    model: options?.model,
  });

  const result = await provider.generateText({
    prompt,
    system: options?.system,
  });

  return result.text;
}

// OpenRouter models
export const OPENROUTER_MODELS = {
  // Anthropic
  'claude-3-5-sonnet': 'anthropic/claude-3.5-sonnet',
  'claude-3-opus': 'anthropic/claude-3-opus',
  'claude-3-haiku': 'anthropic/claude-3-haiku',
  
  // OpenAI
  'gpt-4o': 'openai/gpt-4o',
  'gpt-4-turbo': 'openai/gpt-4-turbo',
  'gpt-3.5-turbo': 'openai/gpt-3.5-turbo',
  
  // Google
  'gemini-pro': 'google/gemini-pro-1.5',
  
  // Meta
  'llama-3-70b': 'meta-llama/llama-3-70b-instruct',
  'llama-3-8b': 'meta-llama/llama-3-8b-instruct',
  
  // Mistral
  'mistral-large': 'mistralai/mistral-large',
  'mixtral-8x22b': 'mistralai/mixtral-8x22b-instruct',
} as const;

export type OpenRouterModel = keyof typeof OPENROUTER_MODELS;
