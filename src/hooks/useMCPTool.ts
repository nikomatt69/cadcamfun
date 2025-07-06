// src/hooks/useMCPTool.ts
import { useState, useRef, useCallback } from "react";

// Define error response type
interface ErrorResponse {
  error: string;
  code?: string;
  toolName?: string;
  parameters?: any;
}

export function useMCPTool<T = any, P = Record<string, any>>(
  serverId: string | undefined | null,
  toolName: string | null,
  options?: {
    retry?: boolean; // Whether to retry failed executions
    maxRetries?: number; // Maximum number of retries
    retryDelay?: number; // Delay between retries in ms
    timeout?: number; // Request timeout in ms
  }
) {
  const [result, setResult] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const retryCountRef = useRef<number>(0);
  const executionCountRef = useRef<number>(0);

  // Default options
  const {
    retry = false, // Default to no retry for tools (unlike resources)
    maxRetries = 2,
    retryDelay = 1000,
    timeout = 30000 // 30 second default timeout
  } = options || {};

  const execute = useCallback(
    async (parameters: P): Promise<T> => {
      // Validate required parameters
      if (!serverId || !toolName) {
        const errorMsg = !serverId ? "Server ID is required" : "Tool name is required";
        setError(errorMsg);
        return Promise.reject(new Error(errorMsg));
      }

      // Abort previous request if it exists
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new abort controller with timeout
      abortControllerRef.current = new AbortController();
      const { signal } = abortControllerRef.current;

      // Set up timeout if specified
      const timeoutId = timeout
        ? setTimeout(() => {
            if (abortControllerRef.current) {
              abortControllerRef.current.abort();
            }
          }, timeout)
        : null;

      // Reset error state and set loading
      setIsLoading(true);
      setError(null);

      // Increment execution count
      const currentExecution = ++executionCountRef.current;

      try {
        const response = await fetch("/api/mcp/tool", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            serverId,
            toolName,
            parameters
          }),
          signal
        });

        let responseData: T | ErrorResponse;

        try {
          responseData = await response.json();
        } catch (jsonError) {
          throw new Error("Invalid response format");
        }

        if (!response.ok) {
          const errorMessage =
            typeof responseData === "object" && responseData && "error" in responseData
              ? (responseData as ErrorResponse).error
              : "Failed to execute tool";

          throw new Error(errorMessage);
        }

        // Only update state if this is the most recent execution
        if (currentExecution === executionCountRef.current) {
          setResult(responseData as T);
          setIsLoading(false);
        }

        // Reset retry counter on success
        retryCountRef.current = 0;

        return responseData as T;
      } catch (err: any) {
        // Don't set error state if request was aborted
        if (err.name === "AbortError") {
          throw new Error("Request timed out or was aborted");
        }

        // Only update error state if this is the most recent execution
        if (currentExecution === executionCountRef.current) {
          setError(err.message || "An error occurred");
          setIsLoading(false);
        }

        // Handle retry logic
        if (retry && retryCountRef.current < maxRetries) {
          retryCountRef.current++;
          const delay = retryDelay * retryCountRef.current;

          console.log(`Retrying tool execution (${retryCountRef.current}/${maxRetries})...`);

          await new Promise(resolve => setTimeout(resolve, delay));
          return execute(parameters);
        }

        throw err;
      } finally {
        // Clean up timeout
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    },
    [serverId, toolName, retry, maxRetries, retryDelay, timeout]
  );

  // Function to reset state
  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    retryCountRef.current = 0;
  }, []);

  // Function to abort current execution
  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  }, []);

  return {
    execute,
    result,
    isLoading,
    error,
    reset,
    abort
  };
}
