// src/lib/ai/providers/openrouter.ts
// OpenRouter Provider - Access 200+ models from various providers
import { generateText, type LanguageModelV1 } from 'ai';
import { createOpenAI } from '@ai-provider/openai';

/**
 * OpenRouter configuration
 * OpenRouter provides access to models from:
 * - Anthropic (Claude)
 * - OpenAI (GPT)
 * - Google (Gemini)
 * - Meta (Llama)
 * - Mistral
 * - And 200+ more
 */
export interface OpenRouterConfig {
  apiKey: string;
  baseURL?: string;
  defaultModel?: string;
}

export interface OpenRouterModel {
  id: string;
  name: string;
  provider: string;
  context_length: number;
  pricing?: {
    prompt: string;
    completion: string;
  };
}

/**
 * Create OpenRouter provider instance
 */
export function createOpenRouterProvider(config: OpenRouterConfig) {
  const baseURL = config.baseURL || 'https://openrouter.ai/api/v1';
  
  const openrouter = createOpenAI({
    apiKey: config.apiKey,
    baseURL,
  });

  return {
    client: openrouter,
    defaultModel: config.defaultModel || 'anthropic/claude-3.5-sonnet',
    
    /**
     * Get available models from OpenRouter
     */
    async listModels(): Promise<OpenRouterModel[]> {
      try {
        const response = await fetch(`${baseURL}/models`, {
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
          },
        });
        
        if (!response.ok) {
          throw new Error(`Failed to list models: ${response.statusText}`);
        }
        
        const data = await response.json();
        return data.data || [];
      } catch (error) {
        console.error('Error listing OpenRouter models:', error);
        return [];
      }
    },
    
    /**
     * Get pricing for a specific model
     */
    async getModelPricing(modelId: string): Promise<{ prompt: number; completion: number } | null> {
      const models = await this.listModels();
      const model = models.find(m => m.id === modelId);
      
      if (!model?.pricing) return null;
      
      return {
        prompt: parseFloat(model.pricing.prompt),
        completion: parseFloat(model.pricing.completion),
      };
    },
  };
}

/**
 * Popular OpenRouter models
 */
export const OPENROUTER_POPULAR_MODELS = {
  // Anthropic
  'claude-3-5-sonnet': {
    id: 'anthropic/claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'Anthropic',
    context_length: 200000,
  },
  'claude-3-opus': {
    id: 'anthropic/claude-3-opus',
    name: 'Claude 3 Opus',
    provider: 'Anthropic',
    context_length: 200000,
  },
  'claude-3-haiku': {
    id: 'anthropic/claude-3-haiku',
    name: 'Claude 3 Haiku',
    provider: 'Anthropic',
    context_length: 200000,
  },
  
  // OpenAI
  'gpt-4o': {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    provider: 'OpenAI',
    context_length: 128000,
  },
  'gpt-4-turbo': {
    id: 'openai/gpt-4-turbo',
    name: 'GPT-4 Turbo',
    provider: 'OpenAI',
    context_length: 128000,
  },
  'gpt-3.5-turbo': {
    id: 'openai/gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo',
    provider: 'OpenAI',
    context_length: 16385,
  },
  
  // Google
  'gemini-pro-1.5': {
    id: 'google/gemini-pro-1.5',
    name: 'Gemini Pro 1.5',
    provider: 'Google',
    context_length: 1000000,
  },
  
  // Meta
  'llama-3-70b': {
    id: 'meta-llama/llama-3-70b-instruct',
    name: 'Llama 3 70B',
    provider: 'Meta',
    context_length: 8192,
  },
  'llama-3-8b': {
    id: 'meta-llama/llama-3-8b-instruct',
    name: 'Llama 3 8B',
    provider: 'Meta',
    context_length: 8192,
  },
  
  // Mistral
  'mistral-large': {
    id: 'mistralai/mistral-large',
    name: 'Mistral Large',
    provider: 'Mistral',
    context_length: 128000,
  },
  'mixtral-8x22b': {
    id: 'mistralai/mixtral-8x22b-instruct',
    name: 'Mixtral 8x22B',
    provider: 'Mistral',
    context_length: 65536,
  },
} as const;

export type OpenRouterModelId = keyof typeof OPENROUTER_POPULAR_MODELS;
