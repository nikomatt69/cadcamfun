// src/hooks/useApi.ts
import { useState, useCallback } from 'react';

interface ApiState<T> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
}

export function useApi<T>() {
  const [state, setState] = useState<ApiState<T>>({
    data: null,
    isLoading: false,
    error: null
  });

  const execute = useCallback(async (apiCall: () => Promise<T>) => {
    setState({ data: null, isLoading: true, error: null });
    
    try {
      const data = await apiCall();
      setState({ data, isLoading: false, error: null });
      return { data, error: null };
    } catch (error) {
      console.error('API Error:', error);
      const apiError = error instanceof Error 
        ? error 
        : new Error(typeof error === 'string' ? error : 'Errore sconosciuto');
      setState({ data: null, isLoading: false, error: apiError });
      return { data: null, error: apiError };
    }
  }, []);

  return {
    ...state,
    execute
  };
}