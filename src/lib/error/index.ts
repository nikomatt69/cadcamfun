// src/lib/error/index.ts
// Error handling exports

export { ErrorBoundary, useErrorHandler } from '../../components/ui/ErrorBoundary';
export { logger, createLogger, LogLevel, type LogTransport } from './logger';
export type { LoggerConfig, LogEntry } from './logger';

// Re-export commonly used utilities
export { createApiError, isApiError, formatErrorForUser } from './errorUtils';

// API Error handler
export async function withErrorHandling<T>(
  fn: () => Promise<T>,
  options?: {
    onError?: (error: Error) => void;
    onSuccess?: (result: T) => void;
    fallback?: T;
    retryCount?: number;
    retryDelay?: number;
  }
): Promise<T> {
  const { 
    onError, 
    onSuccess, 
    fallback, 
    retryCount = 0,
    retryDelay = 1000 
  } = options || {};

  try {
    const result = await fn();
    if (onSuccess) onSuccess(result);
    return result;
  } catch (error) {
    const err = error as Error;
    
    // Retry logic
    if (retryCount > 0) {
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      return withErrorHandling(fn, {
        ...options,
        retryCount: retryCount - 1,
        retryDelay: retryDelay * 2,
      });
    }

    if (onError) onError(err);
    
    if (fallback !== undefined) {
      return fallback;
    }
    
    throw err;
  }
}
