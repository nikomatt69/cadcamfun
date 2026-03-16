// src/lib/ai/index.ts
// Main export file for AI module
// Consolidated from ai/ and ai-new/ directories

// ============================================
// Provider System
// ============================================
export { 
  AIProvider, 
  createAIProvider, 
  setDefaultProvider, 
  getDefaultProvider,
  generateAIText,
  OPENROUTER_MODELS,
  type AIProviderConfig,
  type AIResponse,
  type AIStreamResponse,
  type ProviderType,
  type OpenRouterModel,
} from './AIProvider';

export { createOpenRouterProvider } from './providers/openrouter';

// ============================================
// Core Services
// ============================================
export { unifiedAIService } from './unifiedAIService';
export { aiToolpathOptimizer } from '../aiToolpathOptimizer';

// MCP Service
export { MCPService, mcpService } from './mcpService';

// ============================================
// Supporting Services
// ============================================
export { aiConfigManager } from './aiConfigManager';
export { aiAnalytics } from './aiAnalytics';
export { aiCache } from './aiCache';
export { aiCore } from './aiCore';
export { aiAssistant } from './aiAssistant';
export { aiDesignService } from './aiDesignService';
export { aiPerformanceMonitor } from './aiPerformanceMonitor';

// ============================================
// Utilities
// ============================================
export { promptTemplates } from './promptTemplates';
export { mcpClient } from './mcpClient';
export { mcpCadService } from './mcpCadService';

// ============================================
// Legacy / Deprecated - re-export from new location
// ============================================
// These are kept for backward compatibility
export { useAI } from '../../components/ai/ai-new/AIContextProvider';

// ============================================
// Types
// ============================================
export type { 
  Toolpath, 
  ToolpathParameters, 
  ToolpathModification,
  AIDesignSuggestion 
} from '../types/ai';

export type {
  AIModelType,
  AIRequest,
  AIResponse as AIResponseType,
  TextToCADRequest,
  MCPRequestParams,
  MCPResponse
} from '@/src/types/AITypes';

// ============================================
// Default Configuration
// ============================================
export const AI_DEFAULT_CONFIG = {
  provider: 'openrouter' as ProviderType,
  model: 'anthropic/claude-3.5-sonnet',
  temperature: 0.7,
  maxTokens: 6000,
  mcpEnabled: true,
  mcpStrategy: 'balanced' as const,
} as const;
