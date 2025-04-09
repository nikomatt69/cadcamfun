// src/hooks/useAIDesign.ts
import { useState, useCallback, useEffect } from 'react';
import { aiDesignService } from '../lib/ai/aiDesignService';
import {  AIDesignSuggestion } from '../types/ai';

export function useAIDesign() {
  const [suggestions, setSuggestions] = useState<AIDesignSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  
  const analyzeDesign = useCallback(async (elements: Element[]) => {
    // Cancel any in-progress request
    if (abortController) {
      abortController.abort();
    }
    
    // Create new abort controller
    const controller = new AbortController();
    setAbortController(controller);
    
    setLoading(true);
    setError(null);
    
    try {
      // Use the signal for cancelable requests
      const results = await aiDesignService.analyzeDesign({ elements, analysisType: 'structural' });
      if (!controller.signal.aborted) {
        setSuggestions(results.data ?? []);
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : 'Unknown error occurred');
        setSuggestions([]);
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortController) {
        abortController.abort();
      }
    };
  }, [abortController]);
  
  return {
    suggestions,
    loading,
    error,
    analyzeDesign
  };
}