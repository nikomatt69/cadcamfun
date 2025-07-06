// =======================================================================================
// src/lib/ai/autonomous/continuityOrchestrator.ts - Main autonomous orchestrator
// =======================================================================================

import {
  AutonomousSession,
  ProgressReport,
  ContinuityState,
  AutonomousPreferences,
  CADContext,
  IterationResult,
} from "@/src/types/autonomousTypes";
import { AutonomousEngine, ElementStoreActions } from "./autonomousEngine";
import { v4 as uuidv4 } from "uuid";
import { unifiedAIService, UnifiedAIService } from "../unifiedAIService";
import { openAIService, OpenAIService } from "../openaiService";
import { autonomousToolRegistry, ToolChainPlan } from "./toolRegistry";

export type AutonomousServiceCall = (
  prompt: string,
  context?: CADContext
) => Promise<string>;

export class ContinuityOrchestrator {
  private autonomousEngine: AutonomousEngine | null = null;
  private activeSessions: Map<string, AutonomousSession> = new Map();
  private sessionListeners: Map<string, ((update: SessionUpdate) => void)[]> =
    new Map();

  private openAIService: OpenAIService;
  private unifiedAIService?: UnifiedAIService;
  private readonly elementStoreActions?: ElementStoreActions;

  // Enhanced continuous tool chaining
  private enableContinuousChaining: boolean = true;
  private streamingMode: boolean = true;
  private maxContinuousIterations: number = 15;

  constructor(
    openAIServiceInstance: OpenAIService,
    unifiedAIServiceInstance?: UnifiedAIService,
    elementStoreActions?: ElementStoreActions
  ) {
    this.openAIService = openAIServiceInstance;
    this.elementStoreActions = elementStoreActions;

    if (unifiedAIServiceInstance) {
      this.setUnifiedAIService(unifiedAIServiceInstance);
    } else {
      console.warn(
        "ContinuityOrchestrator: UnifiedAIService not provided at construction. Waiting for setUnifiedAIService."
      );
    }
  }

  public setUnifiedAIService(service: UnifiedAIService): void {
    if (this.unifiedAIService) {
      console.warn("ContinuityOrchestrator: UnifiedAIService already set.");
      return;
    }
    this.unifiedAIService = service;
    if (!this.openAIService) {
      console.error(
        "ContinuityOrchestrator: OpenAIService is not available to create AutonomousEngine."
      );
      return;
    }
    this.autonomousEngine = new AutonomousEngine(
      this.unifiedAIService,
      this.openAIService,
      this.elementStoreActions
    );
    console.log("ContinuityOrchestrator: AutonomousEngine initialized.");
  }

  private getEngine(): AutonomousEngine {
    if (!this.autonomousEngine) {
      throw new Error(
        "ContinuityOrchestrator: AutonomousEngine not initialized. UnifiedAIService might not have been set."
      );
    }
    return this.autonomousEngine;
  }

  /**
   * Starts a complete autonomous session
   */
  async startAutonomousSession(
    request: string,
    context: CADContext = {},
    aiServiceCall: AutonomousServiceCall,
    preferences: Partial<AutonomousPreferences> = {},
    onUpdate?: (update: SessionUpdate) => void
  ): Promise<AutonomousSession> {
    console.log(
      `Starting autonomous orchestration for: "${request.substring(0, 100)}..."`
    );

    // Create the session
    const session = await this.getEngine().startAutonomousSession(
      request,
      context,
      preferences
    );

    // Register the session
    this.activeSessions.set(session.id, session);

    // Register listener for updates
    if (onUpdate) {
      this.addSessionListener(session.id, onUpdate);
    }

    // Notify session start
    this.notifySessionUpdate(session.id, {
      type: "session_started",
      session,
      timestamp: new Date(),
    });

    // Start the iteration loop
    this.executeAutonomousLoop(session, aiServiceCall).catch((error) => {
      console.error(
        `Error in autonomous loop for session ${session.id}:`,
        error
      );
      this.notifySessionUpdate(session.id, {
        type: "error",
        session,
        error: error.message,
        timestamp: new Date(),
      });
    });

    return session;
  }

  /**
   * Executes the autonomous iteration loop
   */
  private async executeAutonomousLoop(
    session: AutonomousSession,
    aiServiceCall: AutonomousServiceCall
  ): Promise<void> {
    let previousResponse: string | null = null;
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 3;
    const retryDelay = 2000; // 2 seconds

    console.log(`Starting autonomous loop for session ${session.id}`);

    while (session.isActive && !session.userInterrupted) {
      try {
        // Check for timeout before starting iteration
        const sessionDuration = Date.now() - session.startTime.getTime();
        if (sessionDuration > 600000) {
          // 10 minutes hard timeout
          console.warn(
            `Session ${session.id} exceeded hard timeout, forcing stop`
          );
          this.getEngine().interruptSession(session);
          this.notifySessionUpdate(session.id, {
            type: "error",
            session,
            error: "Session exceeded maximum duration (10 minutes)",
            timestamp: new Date(),
          });
          break;
        }

        // Enhanced continuous tool chaining mode
        if (
          this.enableContinuousChaining &&
          this.shouldEnterContinuousMode(session)
        ) {
          const continuousResult = await this.executeContinuousToolChaining(
            session,
            aiServiceCall
          );
          if (continuousResult.completed) {
            console.log(
              `🎯 Continuous tool chaining completed objective: "${session.originalRequest}"`
            );
            break;
          }
        }

        // Notify iteration start
        this.notifySessionUpdate(session.id, {
          type: "iteration_start",
          session,
          iteration: session.currentIteration + 1,
          timestamp: new Date(),
        });

        // Process iteration with timeout for single iteration
        const iterationPromise = this.getEngine().processIteration(
          session,
          previousResponse,
          (prompt) => aiServiceCall(prompt, session.context)
        );

        // Add timeout for individual iteration (2 minutes)
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("Iteration timeout")), 120000);
        });

        const iterationResult = await Promise.race([
          iterationPromise,
          timeoutPromise,
        ]);

        // Reset error counter on successful iteration
        consecutiveErrors = 0;

        // Update session in map
        this.activeSessions.set(session.id, session);

        // Notify iteration completion
        this.notifySessionUpdate(session.id, {
          type: "iteration_complete",
          session,
          iteration: iterationResult.iteration,
          iterationResult,
          timestamp: new Date(),
        });

        // Update previous response
        previousResponse = iterationResult.output;

        // Adaptive delay between iterations based on complexity
        if (session.isActive) {
          const delay = this.calculateAdaptiveDelay(session, iterationResult);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      } catch (error) {
        consecutiveErrors++;
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";

        console.error(
          `❌ Error in iteration ${session.currentIteration + 1} (${consecutiveErrors}/${maxConsecutiveErrors}):`,
          error
        );

        // Handle consecutive errors
        if (consecutiveErrors >= maxConsecutiveErrors) {
          console.error(
            `💥 Too many consecutive errors (${consecutiveErrors}), stopping session`
          );
          this.getEngine().interruptSession(session);

          this.notifySessionUpdate(session.id, {
            type: "error",
            session,
            error: `Session failed after ${consecutiveErrors} consecutive errors. Last error: ${errorMessage}`,
            timestamp: new Date(),
          });
          break;
        }

        // Attempt recovery for non-critical errors
        if (this.isRecoverableError(error)) {
          console.log(`🔄 Attempting recovery from error: ${errorMessage}`);

          // Wait before retry
          await new Promise((resolve) =>
            setTimeout(resolve, retryDelay * consecutiveErrors)
          );

          // Try to reset session state if needed
          await this.attemptSessionRecovery(session, error);

          continue; // Try again
        } else {
          // Critical error, stop immediately
          console.error(
            `🚨 Critical error, stopping session immediately:`,
            error
          );
          this.getEngine().interruptSession(session);

          this.notifySessionUpdate(session.id, {
            type: "error",
            session,
            error: `Critical error: ${errorMessage}`,
            timestamp: new Date(),
          });
          break;
        }
      }
    }

    // Generate final report only if session hasn't already ended with error
    if (session.isActive || session.endTime) {
      try {
        const finalReport = this.getEngine().generateProgressReport(session);
        session.finalReport = finalReport;

        // Update final session
        this.activeSessions.set(session.id, session);

        // Notify session completion
        this.notifySessionUpdate(session.id, {
          type: "session_complete",
          session,
          finalReport,
          timestamp: new Date(),
        });

        console.log(`✅ Autonomous session ${session.id} completed:`, {
          iterations: session.iterations.length,
          finalScore: finalReport.finalQualityScore,
          stopReason: finalReport.stopReason,
          consecutiveErrors,
        });
      } catch (reportError) {
        console.error(
          `❌ Error generating final report for session ${session.id}:`,
          reportError
        );

        this.notifySessionUpdate(session.id, {
          type: "error",
          session,
          error: `Failed to generate final report: ${reportError instanceof Error ? reportError.message : "Unknown error"}`,
          timestamp: new Date(),
        });
      }
    }

    // Cleanup session after delay
    setTimeout(() => {
      this.activeSessions.delete(session.id);
      this.sessionListeners.delete(session.id);
      console.log(`🧹 Cleaned up session ${session.id}`);
    }, 60000); // 1 minute cleanup
  }

  /**
   * Calculates adaptive delay between iterations
   */
  private calculateAdaptiveDelay(
    session: AutonomousSession,
    iterationResult: IterationResult
  ): number {
    const baseDelay = 1000; // 1 second base

    // Increase delay for complex operations
    const complexityMultiplier = iterationResult.processingTime > 10000 ? 2 : 1;

    // Increase delay if many iterations
    const iterationMultiplier = session.currentIteration > 5 ? 1.5 : 1;

    // Decrease delay for high quality responses
    const qualityMultiplier = iterationResult.qualityAfter.score > 80 ? 0.8 : 1;

    return Math.round(
      baseDelay * complexityMultiplier * iterationMultiplier * qualityMultiplier
    );
  }

  /**
   * Determines if an error is recoverable
   */
  private isRecoverableError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;

    const recoverablePatterns = [
      /timeout/i,
      /network/i,
      /rate limit/i,
      /temporary/i,
      /connection/i,
      /service unavailable/i,
    ];

    return recoverablePatterns.some((pattern) => pattern.test(error.message));
  }

  /**
   * Attempts session recovery
   */
  private async attemptSessionRecovery(
    session: AutonomousSession,
    error: unknown
  ): Promise<void> {
    console.log(`🔧 Attempting session recovery for ${session.id}`);

    try {
      // Reset any problematic state
      if (session.context.elements) {
        // Validate and clean elements
        session.context.elements = session.context.elements.filter(
          (el) => el && typeof el === "object" && el.id
        );
      }

      // Log recovery attempt
      console.log(
        `✅ Session recovery completed for ${session.id}. Elements: ${session.context.elements?.length || 0}`
      );
    } catch (recoveryError) {
      console.error(
        `❌ Session recovery failed for ${session.id}:`,
        recoveryError
      );
      throw recoveryError; // Re-throw to trigger critical error handling
    }
  }

  /**
   * Interrupts an autonomous session
   */
  interruptAutonomousSession(sessionId: string): boolean {
    const session = this.activeSessions.get(sessionId);

    if (!session || !session.isActive) {
      console.warn(
        `⚠️ Cannot interrupt session ${sessionId}: not found or not active`
      );
      return false;
    }

    console.log(`⏹️ Interrupting autonomous session ${sessionId}`);

    // Interrupt the session
    this.getEngine().interruptSession(session);

    // Notify interruption
    this.notifySessionUpdate(sessionId, {
      type: "session_interrupted",
      session,
      timestamp: new Date(),
    });

    return true;
  }

  /**
   * Gets the state of a session
   */
  getSessionState(sessionId: string): AutonomousSession | null {
    return this.activeSessions.get(sessionId) || null;
  }

  /**
   * Gets all active sessions
   */
  getActiveSessions(): AutonomousSession[] {
    return Array.from(this.activeSessions.values());
  }

  /**
   * Gets general orchestrator statistics
   */
  getOrchestratorStats(): {
    activeSessions: number;
    totalSessions: number;
    averageIterations: number;
    averageQualityImprovement: number;
  } {
    const activeSessions = this.activeSessions.size;
    const allSessions = Array.from(this.activeSessions.values());

    const completedSessions = allSessions.filter((s) => !s.isActive);
    const totalIterations = completedSessions.reduce(
      (sum, s) => sum + s.iterations.length,
      0
    );
    const averageIterations =
      completedSessions.length > 0
        ? totalIterations / completedSessions.length
        : 0;

    const qualityImprovements = completedSessions
      .map((s) => s.finalReport?.qualityImprovement || 0)
      .filter((i) => i > 0);
    const averageQualityImprovement =
      qualityImprovements.length > 0
        ? qualityImprovements.reduce((sum, i) => sum + i, 0) /
          qualityImprovements.length
        : 0;

    return {
      activeSessions,
      totalSessions: allSessions.length,
      averageIterations: Math.round(averageIterations * 10) / 10,
      averageQualityImprovement:
        Math.round(averageQualityImprovement * 10) / 10,
    };
  }

  /**
   * Cleans up completed sessions
   */
  cleanupCompletedSessions(): number {
    let cleaned = 0;
    const now = Date.now();
    const maxAge = 10 * 60 * 1000; // 10 minutes

    for (const [sessionId, session] of Array.from(
      this.activeSessions.entries()
    )) {
      if (!session.isActive && session.endTime) {
        const age = now - session.endTime.getTime();
        if (age > maxAge) {
          this.activeSessions.delete(sessionId);
          this.sessionListeners.delete(sessionId);
          cleaned++;
        }
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 Cleaned up ${cleaned} completed sessions`);
    }

    return cleaned;
  }

  /**
   * Determines whether to enter continuous tool chaining mode
   */
  private shouldEnterContinuousMode(session: AutonomousSession): boolean {
    // Enter continuous mode if:
    // 1. It's in early iterations and the objective is complex
    // 2. Quality is low and continuous improvement is needed
    // 3. The objective contains keywords indicating complexity

    const isEarlyIteration = session.currentIteration < 3;
    const hasComplexObjective = this.isComplexObjective(
      session.originalRequest
    );
    const needsContinuousImprovement =
      session.iterations.length > 0 &&
      session.iterations[session.iterations.length - 1].qualityAfter.score < 70;

    return (
      isEarlyIteration && (hasComplexObjective || needsContinuousImprovement)
    );
  }

  /**
   * Determines if the objective is complex and requires tool chaining
   */
  private isComplexObjective(objective: string): boolean {
    const complexKeywords = [
      "create",
      "generate",
      "build",
      "assemble",
      "component",
      "system",
      "design",
      "develop",
      "realize",
      "implement",
      "optimize",
      "cpu",
      "engine",
      "assembly",
      "mechanism",
      "circuit",
      "device",
    ];

    const lowerObjective = objective.toLowerCase();
    const keywordMatches = complexKeywords.filter((keyword) =>
      lowerObjective.includes(keyword)
    ).length;

    return keywordMatches >= 2 || objective.length > 100;
  }

  /**
   * Executes continuous tool chaining to complete the objective
   */
  private async executeContinuousToolChaining(
    session: AutonomousSession,
    aiServiceCall: AutonomousServiceCall
  ): Promise<{ completed: boolean; reason: string }> {
    console.log(
      `🔗 Entering continuous tool chaining mode for objective: "${session.originalRequest}"`
    );

    let continuousIterations = 0;
    let lastQualityScore = 0;
    let stagnationCount = 0;

    while (
      continuousIterations < this.maxContinuousIterations &&
      session.isActive
    ) {
      try {
        // Execute an iteration with tool chaining
        const iterationResult = await this.getEngine().processIteration(
          session,
          session.iterations.length > 0
            ? session.iterations[session.iterations.length - 1].output
            : null,
          (prompt) => aiServiceCall(prompt, session.context)
        );

        continuousIterations++;
        const currentQualityScore = iterationResult.qualityAfter.score;

        // Notify streaming progress
        if (this.streamingMode) {
          this.notifySessionUpdate(session.id, {
            type: "continuous_progress",
            session,
            iteration: continuousIterations,
            iterationResult,
            timestamp: new Date(),
          });
        }

        console.log(
          `🔄 Continuous iteration ${continuousIterations}: Quality ${currentQualityScore}%, Tools: ${iterationResult.actionsExecuted?.join(", ")}`
        );

        // Check if the objective has been achieved
        if (this.isObjectiveCompleted(session, iterationResult)) {
          console.log(
            `✅ Objective completed after ${continuousIterations} continuous iterations`
          );
          return { completed: true, reason: "objective_achieved" };
        }

        // Check for stagnation
        if (Math.abs(currentQualityScore - lastQualityScore) < 5) {
          stagnationCount++;
          if (stagnationCount >= 3) {
            console.log(
              `⏸️ Stopping continuous mode due to quality stagnation`
            );
            return { completed: false, reason: "quality_stagnation" };
          }
        } else {
          stagnationCount = 0; // Reset stagnation counter
        }

        lastQualityScore = currentQualityScore;

        // Brief pause between continuous iterations
        if (continuousIterations < this.maxContinuousIterations) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error(
          `❌ Error in continuous iteration ${continuousIterations}:`,
          error
        );
        return { completed: false, reason: "execution_error" };
      }
    }

    if (continuousIterations >= this.maxContinuousIterations) {
      console.log(
        `⏰ Stopped continuous mode after reaching maximum iterations (${this.maxContinuousIterations})`
      );
      return { completed: false, reason: "max_iterations_reached" };
    }

    return { completed: false, reason: "unknown" };
  }

  /**
   * Checks if the objective has been completed
   */
  private isObjectiveCompleted(
    session: AutonomousSession,
    lastIteration: IterationResult
  ): boolean {
    // Completion criteria:
    // 1. High quality (>= 80%)
    // 2. No critical improvements suggested
    // 3. Generated elements that match the request

    const highQuality = lastIteration.qualityAfter.score >= 80;
    const noCriticalImprovements =
      lastIteration.qualityAfter.improvements.filter(
        (imp) => imp.priority === "high"
      ).length === 0;
    const hasElements =
      session.context.elements && session.context.elements.length > 0;

    // Semantic verification of objective vs result
    const semanticMatch = this.checkSemanticObjectiveMatch(
      session.originalRequest,
      lastIteration.output,
      session.context.elements || []
    );

    return !!(
      highQuality &&
      noCriticalImprovements &&
      hasElements &&
      semanticMatch
    );
  }

  /**
   * Checks semantic correspondence between objective and result
   */
  private checkSemanticObjectiveMatch(
    objective: string,
    output: string,
    elements: any[]
  ): boolean {
    // Simplified verification based on keywords
    const objectiveKeywords = this.extractKeywords(objective);
    const outputKeywords = this.extractKeywords(output);
    const elementTypes = elements
      .map((el) => el.type || el.name || "")
      .join(" ");
    const elementKeywords = this.extractKeywords(elementTypes);

    const allResultKeywords = new Set([...outputKeywords, ...elementKeywords]);
    const matchingKeywords = objectiveKeywords.filter((keyword) =>
      allResultKeywords.has(keyword)
    );

    // Consider a match if at least 50% of the objective keywords are present
    return (
      matchingKeywords.length >=
      Math.max(1, Math.floor(objectiveKeywords.length * 0.5))
    );
  }

  /**
   * Extracts significant keywords from text
   */
  private extractKeywords(text: string): string[] {
    const stopWords = [
      "the",
      "a",
      "an",
      "and",
      "or",
      "but",
      "in",
      "on",
      "at",
      "to",
      "for",
      "of",
      "with",
      "by",
    ];
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2 && !stopWords.includes(word))
      .filter((word, index, arr) => arr.indexOf(word) === index); // Remove duplicates
  }

  // =======================================================================================
  // Listeners and notifications management
  // =======================================================================================

  private addSessionListener(
    sessionId: string,
    listener: (update: SessionUpdate) => void
  ): void {
    if (!this.sessionListeners.has(sessionId)) {
      this.sessionListeners.set(sessionId, []);
    }
    this.sessionListeners.get(sessionId)!.push(listener);
  }

  private notifySessionUpdate(sessionId: string, update: SessionUpdate): void {
    const listeners = this.sessionListeners.get(sessionId) || [];
    listeners.forEach((listener) => {
      try {
        listener(update);
      } catch (error) {
        console.error(`❌ Error in session listener:`, error);
      }
    });
  }
}

// =======================================================================================
// Types per aggiornamenti sessione
// =======================================================================================

export interface SessionUpdate {
  type:
    | "session_started"
    | "iteration_start"
    | "iteration_complete"
    | "session_complete"
    | "session_interrupted"
    | "error"
    | "continuous_progress";
  session: AutonomousSession;
  iteration?: number;
  iterationResult?: IterationResult;
  finalReport?: ProgressReport;
  error?: string;
  timestamp: Date;
}

// =======================================================================================
// Singleton instance
// =======================================================================================

export const continuityOrchestrator = new ContinuityOrchestrator(openAIService);
