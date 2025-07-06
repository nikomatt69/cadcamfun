// src/lib/ai/ai-new/aiConfigManager.ts

import { AIMode, AIModelType, AIServiceConfig } from "src/types/AITypes";

/**
 * Configurazione centralizzata per tutti i modelli e le modalità AI
 */

// Definizione dei modelli AI disponibili
export const AI_MODELS = {
  // Claude models
  CLAUDE_SONNET: "claude-3-7-sonnet-20250219",
  CLAUDE_OPUS: "claude-opus-4-20250514",
  CLAUDE_HAIKU: "claude-3-haiku-20240229",
  CLAUDE_SONNET_4: "claude-sonnet-4-20250514",
  // OpenAI models
  GPT_4: "gpt-4",
  GPT_4_1: "gpt-4.1",
  GPT_4_TURBO: "gpt-4-turbo-preview",
  GPT_3_5_TURBO: "gpt-3.5-turbo",
  GPT_4O: "gpt-4o",
  GPT_4O_MINI: "gpt-4o-mini"
} as const;

// Definizione dei provider AI
export const AI_PROVIDERS = {
  CLAUDE: "claude",
  OPENAI: "openai"
} as const;

export type AIProvider = keyof typeof AI_PROVIDERS;

// Mapping di modelli ai loro provider
export const MODEL_PROVIDERS: Record<AIModelType, AIProvider> = {
  [AI_MODELS.CLAUDE_SONNET]: "CLAUDE",
  [AI_MODELS.CLAUDE_OPUS]: "CLAUDE",
  [AI_MODELS.CLAUDE_HAIKU]: "CLAUDE",
  [AI_MODELS.CLAUDE_SONNET_4]: "CLAUDE",
  [AI_MODELS.GPT_4]: "OPENAI",
  [AI_MODELS.GPT_4_TURBO]: "OPENAI",
  [AI_MODELS.GPT_3_5_TURBO]: "OPENAI",
  [AI_MODELS.GPT_4O]: "OPENAI",
  [AI_MODELS.GPT_4O_MINI]: "OPENAI",
  [AI_MODELS.GPT_4_1]: "OPENAI"
} as const;

// Definizione delle modalità AI
export const AI_MODES: Record<string, AIMode> = {
  CAD: "cad",
  CAM: "cam",
  GCODE: "gcode",
  TOOLPATH: "toolpath",
  ANALYSIS: "analysis",
  GENERAL: "general"
} as const;

// Configurazione predefinita per il servizio AI
export const DEFAULT_CONFIG: AIServiceConfig = {
  defaultModel: AI_MODELS.CLAUDE_SONNET_4,
  maxTokens: 8000,
  temperature: 0.7,
  cacheEnabled: true,
  analyticsEnabled: true,
  allowBrowser: true
};

// Mappatura delle capacità per ciascun modello
export const MODEL_CAPABILITIES = {
  // Claude models
  [AI_MODELS.CLAUDE_OPUS]: {
    maxTokens: 8000,
    bestFor: ["complex_design", "detailed_analysis", "high_quality_content"],
    costTier: "high",
    tokensPerSecond: 15,
    thinking: true,
    thinkingBudget: 2000,
    reasoning: true,
    reasoningBudget: 2000,
    supportedFeatures: ["complex_reasoning", "code_generation", "technical_analysis"],
    provider: AI_PROVIDERS.CLAUDE
  },
  [AI_MODELS.CLAUDE_SONNET]: {
    maxTokens: 6000,
    bestFor: ["general_purpose", "design_assistance", "balanced_performance"],
    costTier: "medium",
    tokensPerSecond: 25,
    supportedFeatures: ["reasoning", "code_generation", "technical_analysis"],
    provider: AI_PROVIDERS.CLAUDE
  },
  [AI_MODELS.CLAUDE_HAIKU]: {
    maxTokens: 2000,
    bestFor: ["quick_suggestions", "simple_tasks", "interactive_assistance"],
    costTier: "low",
    tokensPerSecond: 40,
    supportedFeatures: ["basic_reasoning", "text_completion", "simple_assistance"],
    provider: AI_PROVIDERS.CLAUDE
  },
  [AI_MODELS.CLAUDE_SONNET_4]: {
    maxTokens: 6000,
    bestFor: ["advanced_reasoning", "complex_design", "enhanced_analysis"],
    costTier: "medium",
    tokensPerSecond: 30,
    thinking: true,
    thinkingBudget: 2000,
    reasoning: true,
    reasoningBudget: 2000,
    supportedFeatures: ["enhanced_reasoning", "code_generation", "technical_analysis", "complex_reasoning"],
    provider: AI_PROVIDERS.CLAUDE
  },
  // OpenAI models
  [AI_MODELS.GPT_4]: {
    maxTokens: 8000,
    bestFor: ["complex_reasoning", "creative_content", "code_generation"],
    costTier: "high",
    tokensPerSecond: 15,
    supportedFeatures: ["complex_reasoning", "code_generation", "technical_analysis"],
    provider: AI_PROVIDERS.OPENAI
  },
  [AI_MODELS.GPT_4_TURBO]: {
    maxTokens: 4000,
    bestFor: ["fast_reasoning", "creative_content", "balanced_performance"],
    costTier: "medium-high",
    tokensPerSecond: 25,
    supportedFeatures: ["reasoning", "code_generation", "technical_analysis"],
    provider: AI_PROVIDERS.OPENAI
  },
  [AI_MODELS.GPT_3_5_TURBO]: {
    maxTokens: 4000,
    bestFor: ["quick_responses", "simple_tasks", "cost_efficiency"],
    costTier: "low",
    tokensPerSecond: 40,
    supportedFeatures: ["basic_reasoning", "text_completion", "simple_assistance"],
    provider: AI_PROVIDERS.OPENAI
  },
  [AI_MODELS.GPT_4O]: {
    maxTokens: 8000,
    bestFor: ["complex_reasoning", "creative_content", "code_generation"],
    costTier: "high",
    tokensPerSecond: 15,
    provider: AI_PROVIDERS.OPENAI
  },
  [AI_MODELS.GPT_4O_MINI]: {
    maxTokens: 4000,
    bestFor: ["quick_responses", "simple_tasks", "cost_efficiency"],
    costTier: "low",
    tokensPerSecond: 40,
    provider: AI_PROVIDERS.OPENAI
  },
  [AI_MODELS.GPT_4_1]: {
    maxTokens: 8000,
    supportedFeatures: ["enhanced_reasoning", "code_generation", "technical_analysis", "complex_reasoning"],
    costTier: "high",
    tokensPerSecond: 15,
    provider: AI_PROVIDERS.OPENAI
  }
} as const;

// Mappatura dei costi per token per ciascun modello ($ per 1 milione di tokens)
export const MODEL_COSTS: Record<AIModelType, { input: number; output: number }> = {
  // Claude models (prezzi ufficiali Anthropic 2024-2025)
  [AI_MODELS.CLAUDE_OPUS]: { input: 15.0, output: 75.0 }, // Claude 3 Opus - $ per 1M tokens
  [AI_MODELS.CLAUDE_SONNET]: { input: 3.0, output: 15.0 }, // Claude 3.5 Sonnet - $ per 1M tokens  
  [AI_MODELS.CLAUDE_HAIKU]: { input: 0.25, output: 1.25 }, // Claude 3 Haiku - $ per 1M tokens
  [AI_MODELS.CLAUDE_SONNET_4]: { input: 3.0, output: 15.0 }, // Claude Sonnet 4 - $ per 1M tokens
  
  // OpenAI models (prezzi ufficiali OpenAI 2024-2025)
  [AI_MODELS.GPT_4]: { input: 30.0, output: 60.0 }, // GPT-4 - $ per 1M tokens
  [AI_MODELS.GPT_4O]: { input: 5.0, output: 15.0 }, // GPT-4o - $ per 1M tokens
  [AI_MODELS.GPT_4O_MINI]: { input: 0.15, output: 0.6 }, // GPT-4o Mini - $ per 1M tokens
  [AI_MODELS.GPT_4_TURBO]: { input: 10.0, output: 30.0 }, // GPT-4 Turbo - $ per 1M tokens
  [AI_MODELS.GPT_4_1]: { input: 2.0, output: 8.0 }, // GPT-4.1 - $ per 1M tokens
  [AI_MODELS.GPT_3_5_TURBO]: { input: 0.5, output: 1.5 } // GPT-3.5 Turbo - $ per 1M tokens
};

// Contesto predefinito per ciascuna modalità AI
export const MODE_CONTEXTS: Record<AIMode, string> = {
  cad: "You are a CAD design expert assistant helping users create and optimize 3D models.",
  cam: "You are a CAM programming expert helping users create efficient machining strategies.",
  gcode: "You are a G-code programming expert helping users create and optimize CNC machine instructions.",
  toolpath: "You are a toolpath optimization expert helping users create efficient cutting paths.",
  analysis: "You are a design analysis expert helping users evaluate and improve their CAD models.",
  general: "You are a helpful AI assistant for CAD/CAM software."
};

/**
 * Classe per la gestione della configurazione AI
 */
export class AIConfigManager {
  private config: AIServiceConfig;

  constructor(initialConfig?: Partial<AIServiceConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...initialConfig };
  }

  /**
   * Ottiene la configurazione corrente
   */
  getConfig(): AIServiceConfig {
    return { ...this.config };
  }

  /**
   * Aggiorna la configurazione
   */
  updateConfig(newConfig: Partial<AIServiceConfig>): AIServiceConfig {
    this.config = { ...this.config, ...newConfig };
    return this.getConfig();
  }

  /**
   * Seleziona il modello ottimale in base alla complessità del task
   */
  selectOptimalModel(taskComplexity: "low" | "medium" | "high", preferredProvider?: AIProvider): AIModelType {
    // Se l'auto-selezione è disabilitata, usa il modello predefinito
    if (!this.config.autoModelSelection?.enabled) {
      return this.config.defaultModel;
    }

    // Se è stato specificato un provider preferito, filtra solo i modelli di quel provider
    const eligibleModels: AIModelType[] = Object.entries(MODEL_CAPABILITIES)
      .filter(
        ([_, capabilities]) =>
          !preferredProvider || capabilities.provider.toLowerCase() === preferredProvider.toLowerCase()
      )
      .map(([model]) => model as AIModelType);

    // Seleziona il modello in base alla complessità
    switch (taskComplexity) {
      case "high":
        // Trova modelli ad alte prestazioni
        const highPerformanceModels = eligibleModels.filter(model => MODEL_CAPABILITIES[model].costTier === "high");
        return highPerformanceModels[0] || this.config.defaultModel;

      case "medium":
        // Trova modelli a prestazioni medie
        const mediumPerformanceModels = eligibleModels.filter(
          model =>
            MODEL_CAPABILITIES[model].costTier === "medium" || MODEL_CAPABILITIES[model].costTier === "medium-high"
        );
        return mediumPerformanceModels[0] || this.config.defaultModel;

      case "low":
        // Trova modelli a prestazioni basse ma efficienti
        const lowPerformanceModels = eligibleModels.filter(model => MODEL_CAPABILITIES[model].costTier === "low");
        return lowPerformanceModels[0] || this.config.defaultModel;

      default:
        return this.config.defaultModel;
    }
  }

  /**
   * Ottiene il contesto predefinito per una modalità
   */
  getModeContext(mode: AIMode): string {
    return MODE_CONTEXTS[mode] || MODE_CONTEXTS.general;
  }

  /**
   * Calcola il costo stimato per una richiesta
   */
  estimateCost(model: AIModelType, inputTokens: number, outputTokens: number): number {
    const costs = MODEL_COSTS[model] || MODEL_COSTS[AI_MODELS.CLAUDE_SONNET];

    // I prezzi in MODEL_COSTS sono ora per milione di token
    return (inputTokens / 1000000) * costs.input + (outputTokens / 1000000) * costs.output;
  }

  /**
   * Ottiene i parametri ottimali per una richiesta in base al tipo
   */
  getOptimalParameters(requestType: string): {
    model: AIModelType;
    temperature: number;
    maxTokens: number;
  } {
    switch (requestType) {
      case "text_to_cad":
        return {
          model: AI_MODELS.CLAUDE_SONNET_4,
          temperature: 0.5,
          maxTokens: 6000
        };
      case "design_analysis":
        return {
          model: AI_MODELS.CLAUDE_SONNET_4,
          temperature: 0.3,
          maxTokens: 4000
        };
      case "gcode_optimization":
        return {
          model: AI_MODELS.CLAUDE_SONNET_4,
          temperature: 0.2,
          maxTokens: 4000
        };
      case "suggestions":
        return {
          model: AI_MODELS.CLAUDE_SONNET_4,
          temperature: 0.7,
          maxTokens: 1000
        };
      case "chat":
        return {
          model: AI_MODELS.CLAUDE_SONNET_4,
          temperature: 0.7,
          maxTokens: 2000
        };
      default:
        return {
          model: this.config.defaultModel,
          temperature: this.config.temperature,
          maxTokens: this.config.maxTokens
        };
    }
  }

  /**
   * Determina il provider per un modello specifico
   */
  getProviderForModel(model: AIModelType): AIProvider {
    const capability = MODEL_CAPABILITIES[model];
    return capability?.provider === AI_PROVIDERS.OPENAI ? "OPENAI" : "CLAUDE";
  }

  /**
   * Ottiene tutti i modelli disponibili per un provider specifico
   */
  getModelsForProvider(provider: AIProvider): AIModelType[] {
    return Object.entries(MODEL_CAPABILITIES)
      .filter(([_, capability]) => capability.provider === AI_PROVIDERS[provider])
      .map(([model]) => model as AIModelType);
  }
}

// Esporta un'istanza singleton
export const aiConfigManager = new AIConfigManager();
