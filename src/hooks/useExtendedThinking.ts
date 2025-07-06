import { useState, useEffect, useCallback } from "react";
import { extendedThinkingService } from "@/src/lib/ai/ai-new/extendedThinkingService";
import { ThinkingSession, ThinkingStep, ExtendedThinkingOptions, AgentMemory } from "@/src/types/AITypes";

interface UseExtendedThinkingResult {
  // Session Management
  startThinkingSession: (conversationId: string, context: string, options?: Partial<ExtendedThinkingOptions>) => string;
  addThinkingStep: (
    sessionId: string,
    phase: ThinkingStep["type"],
    content: string,
    confidence?: number,
    reasoning?: string,
    context?: string[]
  ) => void;
  finalizeThinkingSession: (sessionId: string, summary?: string) => ThinkingSession | null;

  // State
  currentSessions: Map<string, ThinkingSession>;
  isThinking: boolean;
  thinkingOptions: ExtendedThinkingOptions;

  // Memory & Suggestions
  getAgentMemory: (conversationId: string) => AgentMemory | null;
  generateProactiveSuggestions: (conversationId: string, context: string) => string[];

  // Configuration
  updateThinkingOptions: (options: Partial<ExtendedThinkingOptions>) => void;
  setProactiveMode: (enabled: boolean) => void;

  // Statistics
  getMemoryStats: () => {
    totalConversations: number;
    totalThinkingSessions: number;
    averageSessionDuration: number;
    topSpecializations: string[];
  };

  // Utilities
  clearMemory: () => void;
}

export const useExtendedThinking = (): UseExtendedThinkingResult => {
  const [currentSessions, setCurrentSessions] = useState<Map<string, ThinkingSession>>(new Map());
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingOptions, setThinkingOptions] = useState<ExtendedThinkingOptions>({
    enabled: true,
    budgetTokens: 2000,
    showRealTime: true,
    persistToMemory: true,
    minimumThinkingTime: 2,
    verbosityLevel: "normal",
    phases: ["analysis", "reasoning", "conclusion", "question", "hypothesis"]
  });

  // Start a new thinking session
  const startThinkingSession = useCallback(
    (conversationId: string, contextText: string, options?: Partial<ExtendedThinkingOptions>): string => {
      const sessionId = extendedThinkingService.startThinkingSession(conversationId, contextText, options);
      setIsThinking(true);

      // Create a session entry in our local state
      const newSession: ThinkingSession = {
        id: sessionId,
        userQuery: contextText,
        context: contextText,
        steps: [],
        summary: "",
        confidence: 0,
        totalDuration: 0,
        timestamp: new Date(),
        mcpToolsUsed: [],
        outcome: "completed",
        tags: []
      };

      setCurrentSessions(prev => new Map(prev.set(sessionId, newSession)));
      return sessionId;
    },
    []
  );

  // Add a thinking step
  const addThinkingStep = useCallback(
    (
      sessionId: string,
      type: ThinkingStep["type"],
      content: string,
      confidence: number = 0.8,
      reasoning?: string,
      relatedConceptsParam?: string[]
    ) => {
      extendedThinkingService.addThinkingStep(sessionId, type, content, confidence, reasoning, relatedConceptsParam);

      // Update local session state
      setCurrentSessions(prev => {
        const updated = new Map(prev);
        const session = updated.get(sessionId);
        if (session) {
          const newStep: ThinkingStep = {
            id: `step_${Date.now()}`,
            type,
            content,
            confidence,
            timestamp: new Date(),
            reasoning: reasoning || "",
            relatedConcepts: relatedConceptsParam || [],
            duration: 0
          };
          session.steps = [...session.steps, newStep];
          session.totalDuration = Date.now() - session.timestamp.getTime();
          updated.set(sessionId, { ...session });
        }
        return updated;
      });
    },
    []
  );

  // Finalize thinking session
  const finalizeThinkingSession = useCallback(
    (sessionId: string, summary?: string): ThinkingSession | null => {
      const finalSession = extendedThinkingService.finalizeThinkingSession(sessionId, summary);

      if (finalSession) {
        setCurrentSessions(prev => {
          const updated = new Map(prev);
          updated.set(sessionId, finalSession);
          return updated;
        });

        // Check if we have any active sessions
        const hasActiveSessions = Array.from(currentSessions.values()).some(
          session => session.outcome !== "completed" && session.outcome !== "error" && session.outcome !== "interrupted"
        );
        setIsThinking(hasActiveSessions);
      }

      return finalSession;
    },
    [currentSessions]
  );

  // Get agent memory
  const getAgentMemory = useCallback((conversationId: string): AgentMemory | null => {
    return extendedThinkingService.getAgentMemory(conversationId);
  }, []);

  // Generate proactive suggestions
  const generateProactiveSuggestions = useCallback((conversationId: string, context: string): string[] => {
    return extendedThinkingService.generateProactiveSuggestions(conversationId, context);
  }, []);

  // Update thinking options
  const updateThinkingOptions = useCallback(
    (options: Partial<ExtendedThinkingOptions>) => {
      const newOptions = { ...thinkingOptions, ...options };
      setThinkingOptions(newOptions);
      extendedThinkingService.updateThinkingOptions(newOptions);
    },
    [thinkingOptions]
  );

  // Set proactive mode
  const setProactiveMode = useCallback((enabled: boolean) => {
    extendedThinkingService.setProactiveMode(enabled);
  }, []);

  // Get memory statistics
  const getMemoryStats = useCallback(() => {
    return extendedThinkingService.getMemoryStats();
  }, []);

  // Clear memory
  const clearMemory = useCallback(() => {
    extendedThinkingService.clearMemory();
    setCurrentSessions(new Map());
    setIsThinking(false);
  }, []);

  // Update thinking state based on active sessions
  useEffect(() => {
    const activeSessions = Array.from(currentSessions.values()).filter(
      session => session.outcome !== "completed" && session.outcome !== "error" && session.outcome !== "interrupted"
    );
    setIsThinking(activeSessions.length > 0);
  }, [currentSessions]);

  return {
    // Session Management
    startThinkingSession,
    addThinkingStep,
    finalizeThinkingSession,

    // State
    currentSessions,
    isThinking,
    thinkingOptions,

    // Memory & Suggestions
    getAgentMemory,
    generateProactiveSuggestions,

    // Configuration
    updateThinkingOptions,
    setProactiveMode,

    // Statistics
    getMemoryStats,

    // Utilities
    clearMemory
  };
};
