// src/hooks/useMCPServerStatus.ts
import { useState, useEffect, useCallback, useRef } from "react";

// Server status types
export type ServerStatusType = "unknown" | "running" | "started" | "error" | "stopped";

// Status response interface
interface StatusResponse {
  status: ServerStatusType;
  message?: string;
  error?: string;
}

// Default polling intervals based on environment
const DEFAULT_POLL_INTERVAL = process.env.NODE_ENV === "development" ? 60000 : 30000; // Dev: 60s, Prod: 30s

export function useMCPServerStatus(
  serverId: string | undefined | null,
  options?: {
    pollInterval?: number; // Polling interval in ms
    autoStart?: boolean; // Whether to automatically start the server if it's not running
  }
) {
  const [status, setStatus] = useState<ServerStatusType>("unknown");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Default options with environment-aware polling
  const { pollInterval = DEFAULT_POLL_INTERVAL, autoStart = false } = options || {};

  // Check server status
  const checkStatus = useCallback(
    async (signal?: AbortSignal): Promise<StatusResponse> => {
      if (!serverId) {
        setStatus("unknown");
        setStatusMessage("Server ID is required");
        setError("Server ID is required");
        return { status: "unknown", error: "Server ID is required" };
      }

      setIsChecking(true);

      try {
        const response = await fetch("/api/mcp/stdio-server-status", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ serverId }),
          signal
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to check server status");
        }

        setStatus(data.status || "unknown");
        setStatusMessage(data.message || null);
        setError(null);

        return data;
      } catch (err: any) {
        // Ignore abort errors
        if (err.name === "AbortError") {
          return { status: "unknown", message: "Request aborted" };
        }

        setStatus("error");
        setStatusMessage(null);
        setError(err.message || "An error occurred");

        return {
          status: "error",
          error: err.message || "An error occurred"
        };
      } finally {
        setIsChecking(false);
      }
    },
    [serverId]
  );

  // Start server
  const startServer = useCallback(async (): Promise<StatusResponse> => {
    if (!serverId) {
      return { status: "unknown", error: "Server ID is required" };
    }

    setIsChecking(true);

    try {
      // We use the same endpoint but the implementation will try to start the server if it's not running
      const response = await fetch("/api/mcp/stdio-server-status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          serverId,
          start: true // Add parameter to indicate we want to start the server
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to start server");
      }

      setStatus(data.status || "unknown");
      setStatusMessage(data.message || null);
      setError(null);

      return data;
    } catch (err: any) {
      setStatus("error");
      setStatusMessage(null);
      setError(err.message || "Failed to start server");

      return {
        status: "error",
        error: err.message || "Failed to start server"
      };
    } finally {
      setIsChecking(false);
    }
  }, [serverId]);

  // Stop server
  const stopServer = useCallback(async (): Promise<StatusResponse> => {
    if (!serverId) {
      return { status: "unknown", error: "Server ID is required" };
    }

    setIsChecking(true);

    try {
      const response = await fetch("/api/mcp/stdio-cleanup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ serverId })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to stop server");
      }

      setStatus("stopped");
      setStatusMessage(data.message || "Server stopped");
      setError(null);

      return {
        status: "stopped",
        message: data.message || "Server stopped"
      };
    } catch (err: any) {
      setError(err.message || "Failed to stop server");

      return {
        status: "error",
        error: err.message || "Failed to stop server"
      };
    } finally {
      setIsChecking(false);
    }
  }, [serverId]);

  // Start polling for status
  const startPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }

    // Initial check
    checkStatus();

    // Set up interval
    pollingRef.current = setInterval(() => {
      checkStatus();
    }, pollInterval);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [checkStatus, pollInterval]);

  // Stop polling
  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  // Set up polling when server ID changes
  useEffect(() => {
    if (serverId) {
      const cleanup = startPolling();

      return () => {
        cleanup();
        stopPolling();
      };
    }

    return undefined;
  }, [serverId, startPolling, stopPolling]);

  // Auto-start server if requested
  useEffect(() => {
    if (autoStart && serverId && status === "unknown") {
      startServer();
    }
  }, [autoStart, serverId, status, startServer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  return {
    status,
    statusMessage,
    isChecking,
    error,
    checkStatus,
    startServer,
    stopServer,
    startPolling,
    stopPolling
  };
}
