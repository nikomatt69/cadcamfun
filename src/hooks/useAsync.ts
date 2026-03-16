// src/hooks/useAsync.ts
// Async data fetching hook with loading, error, and caching

import { useState, useEffect, useCallback, useRef } from 'react';
import { logger } from '@/src/lib/error/logger';

export type AsyncState<T> = {
  data: T | null;
  loading: boolean;
  error: Error | null;
};

export interface UseAsyncOptions<T> {
  /** Immediate fetch on mount */
  immediate?: boolean;
  /** Debounce delay in ms */
  debounce?: number;
  /** Cache TTL in ms */
  cacheTTL?: number;
  /** Retry count */
  retries?: number;
  /** Retry delay */
  retryDelay?: number;
  /** Callback on success */
  onSuccess?: (data: T) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
}

interface CachedResult<T> {
  data: T;
  timestamp: number;
}

/**
 * Hook for async data fetching with caching and retry logic
 */
export function useAsync<T>(
  fetcher: () => Promise<T>,
  options: UseAsyncOptions<T> = {}
): {
  state: AsyncState<T>;
  execute: () => Promise<void>;
  reset: () => void;
} {
  const {
    immediate = true,
    debounce,
    cacheTTL = 60000,
    retries = 3,
    retryDelay = 1000,
    onSuccess,
    onError,
  } = options;

  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    loading: immediate,
    error: null,
  });

  const cacheRef = useRef<Map<string, CachedResult<T>>>(new Map());
  const abortRef = useRef<boolean>(false);

  const execute = useCallback(async () => {
    abortRef.current = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    let attempt = 0;
    let lastError: Error;

    // Check cache first
    const cacheKey = fetcher.toString();
    const cached = cacheRef.current.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < cacheTTL) {
      setState({ data: cached.data, loading: false, error: null });
      return;
    }

    while (attempt < retries) {
      if (abortRef.current) return;

      try {
        const data = await fetcher();
        
        if (abortRef.current) return;

        // Cache the result
        cacheRef.current.set(cacheKey, {
          data,
          timestamp: Date.now(),
        });

        setState({ data, loading: false, error: null });
        onSuccess?.(data);
        logger.info('useAsync: fetch success', { attempt: attempt + 1 });
        return;
      } catch (error) {
        lastError = error as Error;
        attempt++;

        logger.warn('useAsync: fetch failed, retrying...', { 
          attempt, 
          error: lastError.message 
        });

        if (attempt < retries && !abortRef.current) {
          await new Promise((resolve) => setTimeout(resolve, retryDelay * attempt));
        }
      }
    }

    setState({ data: null, loading: false, error: lastError! });
    onError?.(lastError!);
    logger.error('useAsync: fetch failed after retries', { 
      retries: attempt,
      error: lastError?.message 
    });
  }, [fetcher, cacheTTL, retries, retryDelay, onSuccess, onError]);

  const reset = useCallback(() => {
    abortRef.current = true;
    setState({ data: null, loading: false, error: null });
  }, []);

  useEffect(() => {
    if (immediate) {
      if (debounce) {
        const timeout = setTimeout(execute, debounce);
        return () => {
          clearTimeout(timeout);
          abortRef.current = true;
        };
      } else {
        execute();
      }
    }
  }, [execute, immediate, debounce]);

  return { state, execute, reset };
}

/**
 * Hook for async data with polling
 */
export function useAsyncPoll<T>(
  fetcher: () => Promise<T>,
  interval: number = 5000,
  options: UseAsyncOptions<T> = {}
) {
  const { state, execute, reset } = useAsync(fetcher, {
    ...options,
    immediate: true,
  });

  useEffect(() => {
    const id = setInterval(execute, interval);
    return () => clearInterval(id);
  }, [execute, interval]);

  return { ...state, refresh: execute, reset };
}

/**
 * Hook for async data with manual trigger
 */
export function useAsyncManual<T>(
  options: UseAsyncOptions<T> = {}
) {
  return useAsync<T>(null as any, {
    ...options,
    immediate: false,
  });
}

// ============================================
// Loading Skeleton Component
// ============================================

export interface SkeletonProps {
  /** Number of skeleton lines */
  lines?: number;
  /** Width of each line (can be array for variation) */
  width?: string | string[];
  /** Height of skeleton */
  height?: string;
  /** Border radius */
  radius?: string;
  /** Show animated shimmer */
  animate?: boolean;
  /** Custom className */
  className?: string;
}

export function Skeleton({
  lines = 3,
  width = '100%',
  height = '16px',
  radius = '4px',
  animate = true,
  className = '',
}: SkeletonProps) {
  const widths = Array.isArray(width) ? width : Array(lines).fill(width);
  
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          style={{
            width: widths[i] || width,
            height,
            borderRadius: radius,
          }}
          className={`bg-gray-200 dark:bg-gray-700 ${
            animate ? 'animate-pulse' : ''
          }`}
        />
      ))}
    </div>
  );
}

// ============================================
// Loading Button Component
// ============================================

export interface LoadingButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  loadingText?: string;
  children: React.ReactNode;
}

export const LoadingButton = ({
  loading = false,
  loadingText,
  children,
  disabled,
  className = '',
  ...props
}: LoadingButtonProps) => {
  return (
    <button
      className={`relative ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <svg
            className="animate-spin h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        </span>
      )}
      <span className={loading ? 'opacity-0' : ''}>
        {loading && loadingText ? loadingText : children}
      </span>
    </button>
  );
};
