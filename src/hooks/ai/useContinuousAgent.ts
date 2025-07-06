// src/hooks/ai/useContinuousAgent.ts - Enhanced with Autonomous Capabilities
import { useState, useCallback, useEffect, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import { ThinkingSession, ContinuousAgentState } from "@/src/types/AITypes";
import { getExtendedThinkingService } from "@/src/lib/ai/ai-new/extendedThinkingService";
import { useAutonomousAgent, UseAutonomousAgentReturn } from "./useAutonomousAgent";
import { AutonomousPreferences, ProgressReport, CADContext as AutonomousCADContext } from "@/src/types/autonomousTypes";

interface CADContext {
  elements?: any[];
  projectName?: string;
  currentTool?: string;
  userPreferences?: Record<string, any>;
}

interface MCPResponse {
  response: string;
  thinkingSession?: ThinkingSession;
  mcpToolsCalled?: any[];
  proactiveSuggestions?: string[];
  processingTime?: number;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

interface UseContinuousAgentOptions {
  enableThinking?: boolean;
  enableMCP?: boolean;
  autoSuggest?: boolean;
  persistContext?: boolean;
  mcpServers?: string[];
  // New autonomous options
  enableAutonomous?: boolean;
  autonomousPreferences?: Partial<AutonomousPreferences>;
  onAutonomousComplete?: (report: ProgressReport) => void;
  onAutonomousError?: (error: string) => void;
}

export const useContinuousAgent = (conversationId?: string, options: UseContinuousAgentOptions = {}) => {
  const {
    enableThinking = true,
    enableMCP = true,
    autoSuggest = true,
    persistContext = true,
    mcpServers = ["cad-tools", "cam-tools"],
    // New autonomous options
    enableAutonomous = false,
    autonomousPreferences = {},
    onAutonomousComplete,
    onAutonomousError
  } = options;

  // State
  const [agentState, setAgentState] = useState<ContinuousAgentState>();
  const [currentThinking, setCurrentThinking] = useState<ThinkingSession | null>(null);
  const [proactiveSuggestions, setProactiveSuggestions] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<
    Array<{
      message: string;
      response: string;
      timestamp: Date;
      thinking?: ThinkingSession;
    }>
  >([]);
  const [error, setError] = useState<string | null>(null);

  // Refs
  const actualConversationId = useRef(conversationId || uuidv4());
  const thinkingService = useRef(getExtendedThinkingService());

  // Autonomous agent hook
  const {
    autonomousSession,
    isRunning: isRunningAutonomously,
    error: autonomousErrorFromHook,
    finalReport: autonomousReport,
    isSessionEnded: isAutonomousSessionEnded,
    startAutonomousTask,
    stopAutonomous: interruptAutonomousTask,
    clearSession: clearAutonomousSession
  } = useAutonomousAgent();

  // Handle onAutonomousComplete callback
  useEffect(() => {
    if (autonomousReport && onAutonomousComplete) {
      onAutonomousComplete(autonomousReport);
    }
  }, [autonomousReport, onAutonomousComplete]);

  // Handle onAutonomousError callback
  useEffect(() => {
    if (autonomousErrorFromHook && onAutonomousError) {
      onAutonomousError(autonomousErrorFromHook);
    }
  }, [autonomousErrorFromHook, onAutonomousError]);

  // Initialize agent state
  useEffect(() => {
    const initialState: ContinuousAgentState = {
      isActive: true,
      currentContext: "",
      memoryId: actualConversationId.current,
      thinkingSessions: [],
      proactiveMode: autoSuggest,
      suggestionThreshold: 0.7
    };

    setAgentState(initialState);

    if (autoSuggest) {
      thinkingService.current.setProactiveMode(true);
    }
  }, [autoSuggest]);

  // Load persisted context on mount
  useEffect(() => {
    if (persistContext && typeof window !== "undefined") {
      const savedHistory = localStorage.getItem(`cad_agent_history_${actualConversationId.current}`);
      if (savedHistory) {
        try {
          const parsed = JSON.parse(savedHistory);
          setConversationHistory(
            parsed.map((item: any) => ({
              ...item,
              timestamp: new Date(item.timestamp)
            }))
          );
        } catch (error) {
          console.warn("Failed to load conversation history:", error);
        }
      }
    }
  }, [persistContext]);

  // Save context when conversation history changes
  useEffect(() => {
    if (persistContext && conversationHistory.length > 0 && typeof window !== "undefined") {
      localStorage.setItem(
        `cad_agent_history_${actualConversationId.current}`,
        JSON.stringify(conversationHistory.slice(-20)) // Keep last 20 exchanges
      );
    }
  }, [conversationHistory, persistContext]);

  /**
   * Send message with full MCP and thinking integration
   */
  const sendMessage = useCallback(
    async (
      message: string,
      context: CADContext = {},
      useAutonomousMode: boolean = enableAutonomous
    ): Promise<string> => {
      // If autonomous mode is enabled and requested, use autonomous processing
      if (useAutonomousMode && enableAutonomous) {
        console.log(`🤖 Starting autonomous processing for: ${message.substring(0, 100)}...`);

        try {
          const autoContext: AutonomousCADContext = {
            elements: context.elements,
            projectName: context.projectName,
            userPreferences: context.userPreferences
          };
          // Corrected call to startAutonomousTask from the new useAutonomousAgent hook
          await startAutonomousTask(message, autoContext, autonomousPreferences);
          return `Autonomous session started (ID: ${autonomousSession?.id || "pending"}). The AI will now work iteratively.`;
        } catch (err: any) {
          console.error("Failed to start autonomous task from sendMessage:", err);
          if (onAutonomousError) onAutonomousError(err.message || "Failed to start autonomous task");
          return `Error starting autonomous session: ${err.message || "Unknown error"}`;
        }
      }

      // Standard processing (original logic)
      setIsProcessing(true);
      setError(null);

      try {
        console.log(`🤖 Sending message to continuous agent: ${message.substring(0, 100)}...`);

        // Call MCP API with integrated thinking
        const response = await fetch("/api/ai/mcp", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            message,
            context: {
              conversationId: actualConversationId.current,
              cadElements: context.elements || [],
              currentProject: context.projectName,
              userPreferences: context.userPreferences || {}
            },
            options: {
              enableThinking,
              enableMCP,
              mcpServers,
              model: "claude-sonnet-4-20250514",
              temperature: 0.7, // Note: Auto-adjusted to 1 when thinking is enabled
              maxTokens: 6000
            }
          })
        });

        if (!response.ok) {
          throw new Error(`API request failed: ${response.status}`);
        }

        const data = await response.json();

        if (!data.success) {
          throw new Error(data.message || "Request failed");
        }

        const mcpResponse: MCPResponse = data.data;

        // Update thinking session
        if (mcpResponse.thinkingSession) {
          setCurrentThinking(mcpResponse.thinkingSession);
        }

        // Update proactive suggestions
        if (mcpResponse.proactiveSuggestions && mcpResponse.proactiveSuggestions.length > 0) {
          setProactiveSuggestions(mcpResponse.proactiveSuggestions);
        }

        // Add to conversation history
        const historyEntry = {
          message,
          response: mcpResponse.response,
          timestamp: new Date(),
          thinking: mcpResponse.thinkingSession
        };

        setConversationHistory(prev => [...prev, historyEntry]);

        // Update agent state
        setAgentState(prev =>
          prev
            ? {
                ...prev,
                currentContext: `Last message: ${message}. Response involved ${mcpResponse.mcpToolsCalled?.length || 0} tool calls.`,
                thinkingSessions: prev.thinkingSessions.concat(
                  mcpResponse.thinkingSession ? [mcpResponse.thinkingSession] : []
                )
              }
            : prev
        );

        console.log(`✅ Message processed successfully in ${mcpResponse.processingTime}ms`);
        console.log(`🔧 MCP tools called: ${mcpResponse.mcpToolsCalled?.length || 0}`);
        console.log(`💡 Suggestions generated: ${mcpResponse.proactiveSuggestions?.length || 0}`);

        return mcpResponse.response;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.error("❌ Error sending message:", error);
        setError(errorMessage);
        throw error;
      } finally {
        setIsProcessing(false);
      }
    },
    [
      enableThinking,
      enableMCP,
      mcpServers,
      enableAutonomous,
      startAutonomousTask,
      autonomousPreferences,
      onAutonomousError,
      autonomousSession
    ]
  );

  /**
   * Clear conversation history
   */
  const clearHistory = useCallback(() => {
    setConversationHistory([]);
    setCurrentThinking(null);
    setProactiveSuggestions([]);
    setError(null);

    if (persistContext && typeof window !== "undefined") {
      localStorage.removeItem(`cad_agent_history_${actualConversationId.current}`);
    }

    // Clear thinking service memory
    thinkingService.current.clearMemory();

    // Clear autonomous state if enabled
    if (enableAutonomous) {
      clearAutonomousSession();
    }
  }, [persistContext, enableAutonomous, clearAutonomousSession]);

  /**
   * Accept a proactive suggestion
   */
  const acceptSuggestion = useCallback(
    async (suggestion: string, context: CADContext = {}) => {
      return sendMessage(suggestion, context);
    },
    [sendMessage]
  );

  /**
   * Dismiss proactive suggestions
   */
  const dismissSuggestions = useCallback(() => {
    setProactiveSuggestions([]);
  }, []);

  /**
   * Get agent statistics
   */
  const getStatistics = useCallback(() => {
    const totalExchanges = conversationHistory.length;
    const thinkingSessions = conversationHistory.filter(h => h.thinking).length;
    const avgProcessingTime = currentThinking?.totalDuration || 0;

    const baseStats = {
      totalExchanges,
      thinkingSessions,
      avgProcessingTime,
      conversationId: actualConversationId.current,
      memoryStats: thinkingService.current.getMemoryStats()
    };

    // Add autonomous statistics if enabled
    if (enableAutonomous) {
      const autonomousStats = {
        isActive: isRunningAutonomously,
        isEnded: isAutonomousSessionEnded,
        currentIteration: autonomousSession?.currentIteration,
        totalIterationsInSession: autonomousSession?.iterations.length,
        lastError: autonomousErrorFromHook,
        finalScore: autonomousReport?.finalQualityScore
      };
      return {
        ...baseStats,
        autonomous: autonomousStats
      };
    }

    return baseStats;
  }, [
    conversationHistory,
    currentThinking,
    enableAutonomous,
    isRunningAutonomously,
    isAutonomousSessionEnded,
    autonomousErrorFromHook,
    autonomousReport
  ]);

  return {
    // Core functionality
    sendMessage,
    acceptSuggestion,

    // State
    currentThinking,
    proactiveSuggestions,
    agentState,
    conversationHistory,
    isProcessing: isProcessing || (enableAutonomous && isRunningAutonomously),
    error:
      error || (enableAutonomous && autonomousErrorFromHook ? `Autonomous Error: ${autonomousErrorFromHook}` : null),

    // Actions
    clearHistory,
    dismissSuggestions,

    // Autonomous functionality (conditionally exposed)
    ...(enableAutonomous && {
      // Autonomous state
      isRunningAutonomously,
      autonomousSession,
      autonomousReport,
      isAutonomousSessionEnded,

      // Autonomous actions
      startAutonomousTask,
      stopAutonomous: interruptAutonomousTask,
      getAutonomousProgressReport: () => autonomousReport,

      // Autonomous settings
      autonomousPreferences
    }),

    // Utilities
    conversationId: actualConversationId.current,
    getStatistics,

    // Feature flags
    enableAutonomous
  };
};

export default useContinuousAgent;
