// src/hooks/useWebSearch.ts
// Hook completo per gestire WebSearch in produzione
import { useState, useCallback, useRef, useEffect } from "react";
import {
  webSearchService,
  WebSearchOptions,
  CADContextForSearch,
  WebSearchResponse
} from "../lib/ai/websearch/websearchService";
import { executeWebSearch } from "../lib/ai/mcp/mcpOfficialClient";
import { aiCore } from "../lib/ai/aiCore";

export interface WebSearchState {
  query: string;
  results: WebSearchResponse | null;
  isSearching: boolean;
  error: string | null;
  suggestions: string[];
  searchHistory: string[];
  hasSearched: boolean;
}

export interface UseWebSearchOptions {
  maxResults?: number;
  searchDepth?: "shallow" | "deep" | "comprehensive";
  enableHistory?: boolean;
  enableSuggestions?: boolean;
  cadContext?: CADContextForSearch;
  debounceMs?: number;
}

export const useWebSearch = (options: UseWebSearchOptions = {}) => {
  const {
    maxResults = 10,
    searchDepth = "shallow",
    enableHistory = true,
    enableSuggestions = true,
    cadContext,
    debounceMs = 300
  } = options;

  const [state, setState] = useState<WebSearchState>({
    query: "",
    results: null,
    isSearching: false,
    error: null,
    suggestions: [],
    searchHistory: [],
    hasSearched: false
  });

  const searchTimeoutRef = useRef<NodeJS.Timeout>();
  const searchRequestIdRef = useRef<string>();

  // Load search history from localStorage on mount
  useEffect(() => {
    if (enableHistory && typeof window !== "undefined") {
      try {
        const savedHistory = localStorage.getItem("websearch_history");
        if (savedHistory) {
          const history = JSON.parse(savedHistory);
          setState(prev => ({ ...prev, searchHistory: history.slice(0, 50) }));
        }
      } catch (error) {
        console.warn("Failed to load search history:", error);
      }
    }
  }, [enableHistory]);

  // Save search history to localStorage
  const saveToHistory = useCallback(
    (query: string) => {
      if (!enableHistory || !query.trim()) return;

      setState(prev => {
        const newHistory = [query, ...prev.searchHistory.filter(h => h !== query)].slice(0, 50);

        // Save to localStorage
        if (typeof window !== "undefined") {
          try {
            localStorage.setItem("websearch_history", JSON.stringify(newHistory));
          } catch (error) {
            console.warn("Failed to save search history:", error);
          }
        }

        return { ...prev, searchHistory: newHistory };
      });
    },
    [enableHistory]
  );

  // Perform web search
  const performSearch = useCallback(
    async (searchQuery: string, searchOptions?: Partial<WebSearchOptions>): Promise<WebSearchResponse | null> => {
      if (!searchQuery.trim()) {
        setState(prev => ({ ...prev, error: "Search query cannot be empty" }));
        return null;
      }

      const requestId = `search_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      searchRequestIdRef.current = requestId;

      setState(prev => ({
        ...prev,
        isSearching: true,
        error: null,
        hasSearched: true
      }));

      try {
        console.log("🔍 Starting web search:", searchQuery);

        // Prepare search options
        const finalOptions: WebSearchOptions = {
          maxResults,
          searchDepth,
          includeImages: false,
          language: "en",
          region: "global",
          contextAware: !!cadContext,
          ...searchOptions
        };

        // Try Claude AI MCP first (most advanced)
        let searchResult;
        try {
          console.log("🚀 Using Claude AI MCP for search...");
          const mcpResult = await aiCore.processWebSearchRequest({
            query: searchQuery,
            options: finalOptions,
            cadContext,
            useSemanticAnalysis: searchDepth === "comprehensive",
            conversationId: `websearch_${requestId}`
          });

          if (mcpResult.success && mcpResult.data) {
            searchResult = mcpResult.data;
            console.log("✅ Claude AI MCP search successful");
          } else {
            throw new Error(mcpResult.error || "Claude AI MCP search failed");
          }
        } catch (mcpError) {
          console.warn("⚠️ Claude AI MCP search failed, trying direct MCP:", mcpError);

          // Fallback to direct MCP tool
          try {
            const directMCPResult = await executeWebSearch(searchQuery, finalOptions, cadContext);
            if (directMCPResult.success && directMCPResult.data) {
              searchResult = directMCPResult.data;
              console.log("✅ Direct MCP search successful");
            } else {
              throw new Error(directMCPResult.error || "Direct MCP search failed");
            }
          } catch (directError) {
            console.warn("⚠️ Direct MCP search failed, trying service:", directError);

            // Final fallback to websearch service
            const serviceResult = await webSearchService.search(searchQuery, finalOptions, cadContext);
            if (serviceResult.success && serviceResult.data) {
              searchResult = serviceResult.data;
              console.log("✅ WebSearch service successful");
            } else {
              throw new Error(serviceResult.error || "All search methods failed");
            }
          }
        }

        // Check if this is still the current request
        if (searchRequestIdRef.current !== requestId) {
          console.log("🚫 Search request cancelled (newer request in progress)");
          return null;
        }

        // Update state with results
        setState(prev => ({
          ...prev,
          results: searchResult,
          isSearching: false,
          error: null
        }));

        // Save to history
        saveToHistory(searchQuery);

        // Generate suggestions if enabled
        if (enableSuggestions && searchResult?.relatedQueries) {
          setState(prev => ({
            ...prev,
            suggestions: searchResult.relatedQueries || []
          }));
        }

        console.log(`✅ Search completed: ${searchResult?.results?.length || 0} results`);
        return searchResult;
      } catch (error) {
        console.error("❌ Web search error:", error);

        // Check if this is still the current request
        if (searchRequestIdRef.current !== requestId) {
          return null;
        }

        const errorMessage = error instanceof Error ? error.message : "Search failed";
        setState(prev => ({
          ...prev,
          isSearching: false,
          error: errorMessage,
          results: null
        }));

        return null;
      }
    },
    [maxResults, searchDepth, cadContext, saveToHistory, enableSuggestions]
  );

  // Debounced search
  const search = useCallback(
    (query: string, searchOptions?: Partial<WebSearchOptions>) => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }

      setState(prev => ({ ...prev, query }));

      if (!query.trim()) {
        setState(prev => ({ ...prev, results: null, error: null, hasSearched: false }));
        return;
      }

      searchTimeoutRef.current = setTimeout(() => {
        performSearch(query, searchOptions);
      }, debounceMs);
    },
    [performSearch, debounceMs]
  );

  // Immediate search (no debounce)
  const searchImmediate = useCallback(
    (query: string, searchOptions?: Partial<WebSearchOptions>) => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      setState(prev => ({ ...prev, query }));
      return performSearch(query, searchOptions);
    },
    [performSearch]
  );

  // Clear search results
  const clearSearch = useCallback(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    setState({
      query: "",
      results: null,
      isSearching: false,
      error: null,
      suggestions: [],
      searchHistory: state.searchHistory, // Keep history
      hasSearched: false
    });
  }, [state.searchHistory]);

  // Clear search history
  const clearHistory = useCallback(() => {
    setState(prev => ({ ...prev, searchHistory: [] }));
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("websearch_history");
      } catch (error) {
        console.warn("Failed to clear search history:", error);
      }
    }
  }, []);

  // Search from history
  const searchFromHistory = useCallback(
    (historyQuery: string) => {
      searchImmediate(historyQuery);
    },
    [searchImmediate]
  );

  // Search suggestion
  const searchSuggestion = useCallback(
    (suggestion: string) => {
      searchImmediate(suggestion);
    },
    [searchImmediate]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  return {
    // State
    ...state,

    // Actions
    search,
    searchImmediate,
    clearSearch,
    clearHistory,
    searchFromHistory,
    searchSuggestion,

    // Computed
    hasResults: !!state.results?.results?.length,
    resultCount: state.results?.results?.length || 0,
    canSearch: !state.isSearching && state.query.trim().length > 0,

    // Utils
    isCurrentSearch: (query: string) => state.query === query && state.hasSearched
  };
};

export default useWebSearch;
