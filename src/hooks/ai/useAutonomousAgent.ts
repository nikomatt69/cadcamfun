// =======================================================================================
// src/hooks/ai/useAutonomousAgent.ts - Hook per sistema autonomo completo
// =======================================================================================

import { useState, useCallback, useRef, useEffect } from "react";
import {
  AutonomousSession,
  ProgressReport,
  CADContext as AutonomousCADContext,
  AutonomousPreferences
} from "@/src/types/autonomousTypes";
import {
  SessionUpdate,
  continuityOrchestrator,
  ContinuityOrchestrator
} from "@/src/lib/ai/autonomous/continuityOrchestrator";
import { unifiedAIService } from "@/src/lib/ai/unifiedAIService";
import { ElementStoreActions } from "@/src/lib/ai/autonomous/autonomousEngine";

export interface UseAutonomousAgentOptions {
  elementStoreActions?: ElementStoreActions;
}

export interface UseAutonomousAgentReturn {
  // Session state
  isRunning: boolean;
  autonomousSession: AutonomousSession | null;
  finalReport: ProgressReport | null;
  error: string | null;
  isSessionEnded: boolean;

  // Progress tracking
  currentIteration: number;
  maxIterations: number;
  progressPercent: number;
  qualityScore: number;

  // Actions
  startAutonomousTask: (
    request: string,
    context?: AutonomousCADContext,
    preferences?: Partial<AutonomousPreferences>
  ) => Promise<void>;
  stopAutonomous: () => Promise<void>;
  resumeAutonomous: () => Promise<void>;
  clearSession: () => void;

  // Real-time updates
  autonomousHistory: AutonomousSession[];
  getSessionStats: () => {
    totalSessions: number;
    averageIterations: number;
    averageQuality: number;
  };
}

export const useAutonomousAgent = (options?: UseAutonomousAgentOptions): UseAutonomousAgentReturn => {
  // Core state
  const [isRunning, setIsRunning] = useState(false);
  const [autonomousSession, setAutonomousSession] = useState<AutonomousSession | null>(null);
  const [finalReport, setFinalReport] = useState<ProgressReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSessionEnded, setIsSessionEnded] = useState(false);
  const [autonomousHistory, setAutonomousHistory] = useState<AutonomousSession[]>([]);

  // Session tracking
  const currentSessionIdRef = useRef<string | null>(null);
  const sessionUpdateCallbackRef = useRef<((update: SessionUpdate) => void) | null>(null);

  // Local orchestrator instance with element store actions
  const localOrchestratorRef = useRef<ContinuityOrchestrator | null>(null);

  /**
   * Handle session updates from orchestrator
   */
  const handleSessionUpdate = useCallback((update: SessionUpdate) => {
    console.log(`🔔 Session update: ${update.type}`, update);

    // Always update the session state if it's provided
    if (update.session) {
      setAutonomousSession(update.session);
    }

    // Handle specific update types
    switch (update.type) {
      case "session_started":
        setIsRunning(true);
        setIsSessionEnded(false);
        setError(null);
        setFinalReport(null);
        break;

      case "iteration_start":
        // Session already updated above
        break;

      case "iteration_complete":
        // Session state is updated above with new iteration
        if (update.iterationResult) {
          console.log(
            `✅ Iteration ${update.iterationResult.iteration} completed: ${update.iterationResult.qualityAfter.score}%`
          );
        }
        break;

      case "session_complete":
        setIsRunning(false);
        setIsSessionEnded(true);
        if (update.finalReport) {
          setFinalReport(update.finalReport);
          console.log(`🎯 Session completed: Final quality ${update.finalReport.finalQualityScore}%`);
        }
        currentSessionIdRef.current = null;

        // Add to history
        if (update.session) {
          setAutonomousHistory(prev => [...prev, update.session]);
        }
        break;

      case "session_interrupted":
        setIsRunning(false);
        setIsSessionEnded(true);
        setError(update.error || "Session was interrupted");
        setFinalReport(update.finalReport || null);
        currentSessionIdRef.current = null;
        break;

      case "error":
        setIsRunning(false);
        setIsSessionEnded(true);
        setError(update.error || "Unknown error occurred");
        setFinalReport(update.finalReport || null);
        currentSessionIdRef.current = null;
        break;
    }
  }, []);

  /**
   * Start autonomous task
   */
  const startAutonomousTask = useCallback(
    async (
      request: string,
      context: AutonomousCADContext = {},
      preferences: Partial<AutonomousPreferences> = {}
    ): Promise<void> => {
      if (isRunning) {
        throw new Error("Autonomous session is already running");
      }

      console.log(`🚀 Starting autonomous task: "${request.substring(0, 100)}..."`);

      try {
        // Clear previous state
        setError(null);
        setFinalReport(null);
        setIsSessionEnded(false);

        // Create AI service call function
        const aiServiceCall = async (prompt: string, contextData?: AutonomousCADContext): Promise<string> => {
          try {
            const response = await unifiedAIService.processRequest<string>({
              prompt: prompt,
              systemPrompt: `You are a CAD assistant operating in autonomous mode. Context: ${JSON.stringify({
                elements: contextData?.elements || context.elements || [],
                projectName: contextData?.projectName || context.projectName,
                userPreferences: contextData?.userPreferences || context.userPreferences
              })}`,
              model: "claude-sonnet-4-20250514",
              temperature: 0.7,
              maxTokens: 4000,
              parseResponse: text => Promise.resolve(text),
              metadata: {
                type: "autonomous_iteration",
                context: contextData || context,
                enableMCP: true,
                enableThinking: true
              },
              useMCP: true
            });

            return response.rawResponse || response.data || "";
          } catch (err: any) {
            console.error("AI service call failed:", err);
            throw new Error(`AI service failed: ${err.message}`);
          }
        };

        // Choose the appropriate orchestrator
        let orchestratorToUse = continuityOrchestrator;

        // If element store actions are provided, create a local orchestrator
        if (options?.elementStoreActions) {
          console.log("🎯 Using local orchestrator with element store integration");

          // Import openaiService for the local orchestrator
          const { openAIService } = await import("@/src/lib/ai/openaiService");

          if (!localOrchestratorRef.current) {
            localOrchestratorRef.current = new ContinuityOrchestrator(
              openAIService,
              unifiedAIService,
              options.elementStoreActions
            );
          }

          orchestratorToUse = localOrchestratorRef.current;

          // Ensure UnifiedAIService is set for the local orchestrator
          if (typeof window !== "undefined" && unifiedAIService) {
            orchestratorToUse.setUnifiedAIService(unifiedAIService);
          }
        } else {
          // Use the global orchestrator
          if (typeof window !== "undefined" && unifiedAIService) {
            continuityOrchestrator.setUnifiedAIService(unifiedAIService);
          }
        }

        // Start the autonomous session
        const session = await orchestratorToUse.startAutonomousSession(
          request,
          context,
          aiServiceCall,
          preferences,
          handleSessionUpdate
        );

        currentSessionIdRef.current = session.id;
        setAutonomousSession(session);
      } catch (err: any) {
        console.error("Failed to start autonomous task:", err);
        setError(err.message || "Failed to start autonomous task");
        setIsRunning(false);
        throw err;
      }
    },
    [isRunning, handleSessionUpdate, options?.elementStoreActions]
  );

  /**
   * Stop autonomous processing
   */
  const stopAutonomous = useCallback(async (): Promise<void> => {
    if (!currentSessionIdRef.current) {
      console.warn("No active session to stop");
      return;
    }

    console.log(`⏹️ Stopping autonomous session: ${currentSessionIdRef.current}`);

    try {
      // Use local orchestrator if available, otherwise use global
      const orchestratorToUse = localOrchestratorRef.current || continuityOrchestrator;
      const success = orchestratorToUse.interruptAutonomousSession(currentSessionIdRef.current);
      if (!success) {
        console.warn("Failed to interrupt session");
      }
    } catch (err) {
      console.error("Error stopping autonomous session:", err);
      // Force stop locally
      setIsRunning(false);
      setError("Error stopping session");
      currentSessionIdRef.current = null;
    }
  }, []);

  /**
   * Resume autonomous processing (if paused)
   */
  const resumeAutonomous = useCallback(async (): Promise<void> => {
    if (!autonomousSession || isRunning) {
      console.warn("Cannot resume: no session or already running");
      return;
    }

    if (autonomousSession.isActive) {
      console.warn("Cannot resume: session is still marked as active");
      return;
    }

    console.log(`🔄 Resuming autonomous session: ${autonomousSession.id}`);

    try {
      // Prepare context for resumption
      const resumeContext = {
        ...autonomousSession.context,
        // Update with any current state if needed
        resumedAt: new Date(),
        previousIterations: autonomousSession.iterations.length
      };

      // Create the AI service call function (same as startAutonomousTask)
      const aiServiceCall = async (prompt: string, contextData?: AutonomousCADContext): Promise<string> => {
        try {
          const response = await unifiedAIService.processRequest<string>({
            prompt: prompt,
            systemPrompt: `You are a CAD assistant operating in autonomous mode (RESUMED SESSION). 
            Previous iterations: ${autonomousSession.iterations.length}
            Last quality score: ${autonomousSession.iterations[autonomousSession.iterations.length - 1]?.qualityAfter.score || "unknown"}
            Context: ${JSON.stringify({
              elements: contextData?.elements || resumeContext.elements || [],
              projectName: contextData?.projectName || resumeContext.projectName,
              userPreferences: contextData?.userPreferences || resumeContext.userPreferences
            })}`,
            model: "claude-sonnet-4-20250514",
            temperature: 0.7,
            maxTokens: 4000,
            parseResponse: text => Promise.resolve(text),
            metadata: {
              type: "autonomous_iteration_resume",
              context: contextData || resumeContext,
              enableMCP: true,
              enableThinking: true,
              sessionId: autonomousSession.id,
              resumed: true
            },
            useMCP: true
          });

          return response.rawResponse || response.data || "";
        } catch (err: any) {
          console.error("AI service call failed during resume:", err);
          throw new Error(`AI service failed during resume: ${err.message}`);
        }
      };

      // Reactivate the session
      autonomousSession.isActive = true;
      autonomousSession.userInterrupted = false;
      setIsRunning(true);
      setIsSessionEnded(false);
      setError(null);

      // Determine the last response to continue from
      const lastIteration = autonomousSession.iterations[autonomousSession.iterations.length - 1];
      const lastResponse = lastIteration?.output || null;

      console.log(
        `📋 Resuming from iteration ${autonomousSession.currentIteration} with last response: "${(lastResponse || "none").substring(0, 100)}..."`
      );

      // Resume the session using the appropriate orchestrator
      const orchestratorToUse = localOrchestratorRef.current || continuityOrchestrator;
      const resumedSession = await orchestratorToUse.startAutonomousSession(
        `RESUME: ${autonomousSession.originalRequest}`,
        resumeContext,
        aiServiceCall,
        {
          maxIterations: autonomousSession.maxIterations,
          qualityThreshold: 85, // Keep same or adjust based on last quality
          timeLimit: 300000, // Reset timeout for resumed session
          allowUserInterruption: true,
          verboseReporting: true,
          adaptiveStrategy: true
        },
        handleSessionUpdate
      );

      // Update session ID reference for the resumed session
      currentSessionIdRef.current = resumedSession.id;

      // Merge the old iterations with the new session
      resumedSession.iterations = [...autonomousSession.iterations, ...resumedSession.iterations];
      resumedSession.currentIteration = autonomousSession.currentIteration;

      setAutonomousSession(resumedSession);

      console.log(
        `✅ Session resumed successfully. Previous iterations: ${autonomousSession.iterations.length}, Continuing from iteration ${autonomousSession.currentIteration + 1}`
      );
    } catch (err: any) {
      console.error("Failed to resume autonomous session:", err);
      setError(`Failed to resume session: ${err.message}`);
      setIsRunning(false);

      // Mark original session as failed to resume
      if (autonomousSession) {
        autonomousSession.isActive = false;
        autonomousSession.userInterrupted = true;
      }

      throw err;
    }
  }, [autonomousSession, isRunning, handleSessionUpdate]);

  /**
   * Clear session data
   */
  const clearSession = useCallback(() => {
    setAutonomousSession(null);
    setFinalReport(null);
    setError(null);
    setIsSessionEnded(false);
    currentSessionIdRef.current = null;
  }, []);

  /**
   * Get session statistics
   */
  const getSessionStats = useCallback(() => {
    const totalSessions = autonomousHistory.length + (autonomousSession ? 1 : 0);
    const completedSessions = autonomousHistory.filter(s => !s.isActive);

    const averageIterations =
      completedSessions.length > 0
        ? completedSessions.reduce((sum, s) => sum + s.iterations.length, 0) / completedSessions.length
        : 0;

    const averageQuality =
      completedSessions.length > 0
        ? completedSessions.reduce((sum, s) => {
            const lastIteration = s.iterations[s.iterations.length - 1];
            return sum + (lastIteration?.qualityAfter.score || 0);
          }, 0) / completedSessions.length
        : 0;

    return {
      totalSessions,
      averageIterations: Math.round(averageIterations * 10) / 10,
      averageQuality: Math.round(averageQuality * 10) / 10
    };
  }, [autonomousHistory, autonomousSession]);

  // Computed values
  const currentIteration = autonomousSession?.currentIteration || 0;
  const maxIterations = autonomousSession?.maxIterations || 0;
  const progressPercent = maxIterations > 0 ? (currentIteration / maxIterations) * 100 : 0;

  const qualityScore =
    autonomousSession?.iterations && autonomousSession.iterations.length > 0
      ? autonomousSession.iterations[autonomousSession.iterations.length - 1].qualityAfter.score
      : 0;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (currentSessionIdRef.current && isRunning) {
        console.log("🧹 Cleaning up autonomous session on unmount");
        const orchestratorToUse = localOrchestratorRef.current || continuityOrchestrator;
        orchestratorToUse.interruptAutonomousSession(currentSessionIdRef.current);
      }
    };
  }, [isRunning]);

  return {
    // Session state
    isRunning,
    autonomousSession,
    finalReport,
    error,
    isSessionEnded,

    // Progress tracking
    currentIteration,
    maxIterations,
    progressPercent,
    qualityScore,

    // Actions
    startAutonomousTask,
    stopAutonomous,
    resumeAutonomous,
    clearSession,

    // Data
    autonomousHistory,
    getSessionStats
  };
};

export default useAutonomousAgent;
