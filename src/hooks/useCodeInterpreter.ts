// src/hooks/useCodeInterpreter.ts
import { useState, useCallback } from "react";
import { codeInterpreterService } from "@/src/lib/ai/codeInterpreter/codeInterpreterService";
import { CodeInterpreterRequest, CodeInterpreterResponse, ContainerFile } from "@/src/types/codeInterpreterTypes";

interface UseCodeInterpreterReturn {
  executeCode: (code: string, options?: Partial<CodeInterpreterRequest>) => Promise<CodeInterpreterResponse>;
  isExecuting: boolean;
  lastResult: CodeInterpreterResponse | null;
  error: string | null;
  clearError: () => void;
}

export const useCodeInterpreter = (): UseCodeInterpreterReturn => {
  const [isExecuting, setIsExecuting] = useState(false);
  const [lastResult, setLastResult] = useState<CodeInterpreterResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const executeCode = useCallback(
    async (code: string, options: Partial<CodeInterpreterRequest> = {}): Promise<CodeInterpreterResponse> => {
      setIsExecuting(true);
      setError(null);

      try {
        const request: CodeInterpreterRequest = {
          prompt: options.prompt || "Execute the provided Python code",
          code,
          codeType: options.codeType || "analysis",
          model: options.model || "gpt-4.1",
          containerMode: options.containerMode || "auto",
          executionTimeout: options.executionTimeout || 300000,
          ...options
        };

        const result = await codeInterpreterService.executeCode(request);
        setLastResult(result);

        if (!result.success && result.error) {
          setError(result.error);
        }

        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error occurred";
        setError(errorMessage);

        const errorResult: CodeInterpreterResponse = {
          rawResponse: null,
          data: null,
          success: false,
          error: errorMessage,
          processingTime: 0,
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
        };

        setLastResult(errorResult);
        return errorResult;
      } finally {
        setIsExecuting(false);
      }
    },
    []
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    executeCode,
    isExecuting,
    lastResult,
    error,
    clearError
  };
};
