// src/lib/error/errorUtils.ts
// Error utility functions

export interface ApiError {
  code: string;
  message: string;
  statusCode: number;
  details?: Record<string, any>;
  timestamp?: string;
  requestId?: string;
}

/**
 * Create a structured API error
 */
export function createApiError(
  message: string,
  statusCode: number,
  code?: string,
  details?: Record<string, any>
): ApiError {
  return {
    code: code || `ERR_${statusCode}`,
    message,
    statusCode,
    details,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Check if error is an API error
 */
export function isApiError(error: any): error is ApiError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    'message' in error &&
    'code' in error
  );
}

/**
 * Format error for user display
 */
export function formatErrorForUser(error: unknown): string {
  if (isApiError(error)) {
    // Use the message from the API error
    return error.message;
  }

  if (error instanceof Error) {
    // Generic error messages for common errors
    const message = error.message.toLowerCase();
    
    if (message.includes('network') || message.includes('fetch')) {
      return 'Network error. Please check your internet connection.';
    }
    
    if (message.includes('timeout')) {
      return 'Request timed out. Please try again.';
    }
    
    if (message.includes('unauthorized') || message.includes('auth')) {
      return 'Authentication failed. Please log in again.';
    }
    
    if (message.includes('permission') || message.includes('forbidden')) {
      return 'You do not have permission to perform this action.';
    }

    // In development, show actual error
    if (process.env.NODE_ENV === 'development') {
      return error.message;
    }

    // Generic message for production
    return 'An unexpected error occurred. Please try again.';
  }

  return 'An unexpected error occurred. Please try again.';
}

/**
 * Get error code from any error type
 */
export function getErrorCode(error: unknown): string {
  if (isApiError(error)) {
    return error.code;
  }
  
  if (error instanceof Error) {
    return `ERR_${error.name.toUpperCase().replace(/ /g, '_')}`;
  }
  
  return 'ERR_UNKNOWN';
}

/**
 * Check if error is retryable
 */
export function isRetryable(error: unknown): boolean {
  if (isApiError(error)) {
    // Retry on 429 (rate limit) or 5xx errors
    return error.statusCode === 429 || error.statusCode >= 500;
  }
  
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return message.includes('network') || message.includes('timeout');
  }
  
  return false;
}

/**
 * Extract error details for logging
 */
export function getErrorDetails(error: unknown): Record<string, any> {
  if (isApiError(error)) {
    return {
      code: error.code,
      statusCode: error.statusCode,
      details: error.details,
      timestamp: error.timestamp,
      requestId: error.requestId,
    };
  }
  
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  
  return { error: String(error) };
}

/**
 * Async error handler wrapper
 */
export function tryCatch<T>(
  promise: Promise<T>,
  onError?: (error: Error) => void
): Promise<[T | null, Error | null]> {
  return promise
    .then((data) => [data, null] as [T, null])
    .catch((error) => {
      const err = error instanceof Error ? error : new Error(String(error));
      onError?.(err);
      return [null, err] as [null, Error];
    });
}

/**
 * Safe async function that never throws
 */
export async function safeAsync<T>(
  fn: () => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}
