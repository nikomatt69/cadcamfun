// src/hooks/useApi.ts
import { useState, useCallback, useEffect, useRef } from "react";

interface ApiState<T> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
}

const initialApiState = {
  data: null,
  isLoading: false,
  error: null
};

export function useApi<T>() {
  const [state, setState] = useState<ApiState<T>>(initialApiState);
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const setLatestState = useCallback((requestId: number, nextState: ApiState<T>) => {
    if (mountedRef.current && requestId === requestIdRef.current) {
      setState(nextState);
    }
  }, []);

  const execute = useCallback(async (apiCall: () => Promise<T>) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    setLatestState(requestId, { data: null, isLoading: true, error: null });

    try {
      const data = await apiCall();
      setLatestState(requestId, { data, isLoading: false, error: null });
      return { data, error: null };
    } catch (error) {
      console.error("API Error:", error);
      const apiError =
        error instanceof Error ? error : new Error(typeof error === "string" ? error : "Errore sconosciuto");
      setLatestState(requestId, { data: null, isLoading: false, error: apiError });
      return { data: null, error: apiError };
    }
  }, [setLatestState]);

  const reset = useCallback(() => {
    requestIdRef.current += 1;
    setState(initialApiState);
  }, []);

  return {
    ...state,
    execute,
    reset
  };
}
