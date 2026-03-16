// src/lib/index.ts
// Central lib exports - Enterprise Level

// Export individual modules (avoid directory exports for compatibility)
export { createAIProvider, generateAIText, OPENROUTER_MODELS } from './ai/AIProvider';
export { unifiedAIService } from './ai/unifiedAIService';
export { aiToolpathOptimizer } from './aiToolpathOptimizer';

// Error handling
export { logger, createLogger, LogLevel } from './error/logger';
export { ErrorBoundary } from '../components/ui/ErrorBoundary';
export { 
  createApiError, 
  isApiError, 
  formatErrorForUser, 
  tryCatch, 
  safeAsync,
  withErrorHandling 
} from './error/errorUtils';

// Monitoring
export { monitoring, metrics, health, performance } from './monitoring';

// Utils
export { 
  generateId, 
  groupBy, 
  sortBy, 
  debounce, 
  throttle, 
  cn,
  isEmail,
  isUrl,
  isEmpty,
  formatBytes,
  formatRelativeTime
} from './utils';

// API Client
export { api, projects, drawings, components, toolpaths, materials, tools, user } from './api/client';
export { validateRequest, createProjectSchema } from './api/validation';

// Legacy exports
export { default as aiService } from './aiService';
export { default as canvasRenderer } from './canvas/canvasRenderer';
export { default as toolpathGenerator } from './toolpathGenerator';
export { default as gcodeGenerator } from './fanucGcodeGenerator';
