import { AIModelType, AIServiceConfig } from '../../types/ai';

export const AI_MODELS = {
  CLAUDE_SONNET: 'claude-3-7-sonnet-20250219',
  CLAUDE_OPUS: 'claude-3-opus-20240229',
  CLAUDE_HAIKU: 'claude-3-haiku-20240229',
} as const;

export const AI_MODES = {
  CAD: 'cad',
  CAM: 'cam',
  GCODE: 'gcode',
  TOOLPATH: 'toolpath',
  ANALYSIS: 'analysis',
} as const;

export const DEFAULT_CONFIG: AIServiceConfig = {
  defaultModel: AI_MODELS.CLAUDE_SONNET,
  maxTokens: 6000,
  temperature: 0.7,
  cacheEnabled: true,
  analyticsEnabled: true,
  allowBrowser: true,
};

export const MODEL_CAPABILITIES = {
  [AI_MODELS.CLAUDE_SONNET]: {
    maxTokens: 8000,
    bestFor: ['complex_design', 'detailed_analysis'],
    costTier: 'high',
  },
  [AI_MODELS.CLAUDE_OPUS]: {
    maxTokens: 6000,
    bestFor: ['general_purpose', 'design_assistance'],
    costTier: 'medium',
  },
  [AI_MODELS.CLAUDE_HAIKU]: {
    maxTokens: 2000,
    bestFor: ['quick_suggestions', 'simple_tasks'],
    costTier: 'low',
  },
} as const;