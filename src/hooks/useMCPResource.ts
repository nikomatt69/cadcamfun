// src/hooks/useMCPResource.ts
import { useState, useEffect, useRef } from "react";

// Define response error type
interface ErrorResponse {
  error: string;
  code?: string;
  resourceUri?: string;
}

export function useMCPResource<T = any>(
  serverId: string | undefined | null,
  resourceUri: string | null,
  options?: {
    refreshInterval?: number | null; // Auto-refresh interval in ms
    retry?: boolean; // Whether to retry failed requests
    maxRetries?: number; // Maximum number of retries
    retryDelay?: number; // Delay between retries in ms
  }
) {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const retryCountRef = useRef<number>(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Default options
  const { refreshInterval = null, retry = true, maxRetries = 3, retryDelay = 1000 } = options || {};

  const fetchResource = async (isRefresh = false, signal?: AbortSignal) => {
    // Don't fetch if missing required params
    if (!serverId || !resourceUri) {
      return;
    }

    // Set loading states appropriately
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    setError(null);

    try {
      const response = await fetch("/api/mcp/resource", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          serverId,
          resourceUri
        }),
        signal // Pass abort signal for cancelation
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
            : "Failed to load resource";

        throw new Error(errorMessage);
      }

      setData(responseData as T);
      // Reset retry counter on success
      retryCountRef.current = 0;
    } catch (err: any) {
      // Don't set error state if request was aborted
      if (err.name === "AbortError") {
        return;
      }

      setError(err.message || "An error occurred");

      // Handle retry logic
      if (retry && retryCountRef.current < maxRetries) {
        retryCountRef.current++;
        const delay = retryDelay * retryCountRef.current;

        setTimeout(() => {
          console.log(`Retrying resource fetch (${retryCountRef.current}/${maxRetries})...`);
          fetchResource(isRefresh);
        }, delay);
      }
    } finally {
      if (isRefresh) {
        setIsRefreshing(false);
      } else {
        setIsLoading(false);
      }
    }
  };

  // Set up refresh interval
  useEffect(() => {
    // Clean up any existing timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Set up new refresh timer if we have an interval and valid params
    if (refreshInterval && serverId && resourceUri) {
      timerRef.current = setInterval(() => {
        fetchResource(true);
      }, refreshInterval);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [serverId, resourceUri, refreshInterval]);

  // Fetch data when serverId or resourceUri changes
  useEffect(() => {
    // Abort previous request if it exists
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Reset retry counter
    retryCountRef.current = 0;

    // Create new abort controller
    abortControllerRef.current = new AbortController();

    // Only fetch if we have both parameters
    if (serverId && resourceUri) {
      fetchResource(false, abortControllerRef.current.signal);
    } else {
      // Clear data and error when parameters are missing
      setData(null);
      setError(null);
    }

    return () => {
      // Cleanup: abort request on unmount or dependency change
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [serverId, resourceUri]);

  // Function to manually refresh
  const refresh = () => {
    // Reset retry counter
    retryCountRef.current = 0;

    // Abort previous request if it exists
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller
    abortControllerRef.current = new AbortController();

    return fetchResource(true, abortControllerRef.current.signal);
  };

  return {
    data,
    isLoading,
    isRefreshing,
    error,
    refresh
  };
}
