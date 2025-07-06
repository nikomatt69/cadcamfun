// =======================================================================================
// src/lib/ai/autonomous/stopConditionManager.ts - Gestione condizioni di stop
// =======================================================================================

import {
  AutonomousSession,
  QualityAnalysis,
  StopReason,
  StopCondition,
  AutonomousPreferences
} from "@/src/types/autonomousTypes";

export class StopConditionManager {
  private customConditions: Map<string, StopCondition> = new Map();
  private defaultPreferences: AutonomousPreferences = {
    maxIterations: 7,
    qualityThreshold: 85,
    timeLimit: 300000, // 5 minutes
    allowUserInterruption: true,
    verboseReporting: true,
    adaptiveStrategy: true
  };

  constructor(preferences?: Partial<AutonomousPreferences>) {
    if (preferences) {
      this.defaultPreferences = { ...this.defaultPreferences, ...preferences };
    }
    this.initializeDefaultConditions();
  }

  /**
   * Inizializza le condizioni di stop di default
   */
  private initializeDefaultConditions(): void {
    // Quality threshold condition
    this.addStopCondition({
      type: "quality_achieved",
      threshold: this.defaultPreferences.qualityThreshold,
      enabled: true,
      customLogic: (session: AutonomousSession) => {
        const lastIteration = session.iterations[session.iterations.length - 1];
        return lastIteration?.qualityAfter.score >= this.defaultPreferences.qualityThreshold;
      }
    });

    // Max iterations condition
    this.addStopCondition({
      type: "max_iterations",
      threshold: this.defaultPreferences.maxIterations,
      enabled: true,
      customLogic: (session: AutonomousSession) => {
        return session.currentIteration >= this.defaultPreferences.maxIterations;
      }
    });

    // Timeout condition
    this.addStopCondition({
      type: "timeout",
      threshold: this.defaultPreferences.timeLimit,
      enabled: true,
      customLogic: (session: AutonomousSession) => {
        const elapsed = Date.now() - session.startTime.getTime();
        return elapsed >= this.defaultPreferences.timeLimit;
      }
    });

    // User interruption condition
    this.addStopCondition({
      type: "user_interrupted",
      enabled: this.defaultPreferences.allowUserInterruption,
      customLogic: (session: AutonomousSession) => {
        return session.userInterrupted;
      }
    });

    // Error threshold condition
    this.addStopCondition({
      type: "error_threshold",
      threshold: 3, // Max 3 critical errors
      enabled: true,
      customLogic: (session: AutonomousSession) => {
        const lastIteration = session.iterations[session.iterations.length - 1];
        const criticalErrors = lastIteration?.qualityAfter.errors.filter(e => e.severity === "critical").length || 0;
        return criticalErrors >= 3;
      }
    });

    // Diminishing returns condition
    this.addStopCondition({
      type: "diminishing_returns",
      threshold: 5, // Less than 5% improvement
      enabled: true,
      customLogic: (session: AutonomousSession) => {
        if (session.iterations.length < 2) return false;

        const lastTwo = session.iterations.slice(-2);
        const improvement = lastTwo[1].qualityAfter.score - lastTwo[0].qualityAfter.score;
        return improvement < 5;
      }
    });

    // No improvements possible condition
    this.addStopCondition({
      type: "no_improvements_possible",
      enabled: true,
      customLogic: (session: AutonomousSession) => {
        const lastIteration = session.iterations[session.iterations.length - 1];
        const hasImprovements = lastIteration?.qualityAfter.improvements.length > 0;
        const qualityBelowThreshold =
          (lastIteration?.qualityAfter.score || 0) < this.defaultPreferences.qualityThreshold;

        return !hasImprovements && qualityBelowThreshold;
      }
    });
  }

  /**
   * Aggiunge una nuova condizione di stop
   */
  addStopCondition(condition: StopCondition): void {
    this.customConditions.set(condition.type, condition);
  }

  /**
   * Rimuove una condizione di stop
   */
  removeStopCondition(type: StopReason): boolean {
    return this.customConditions.delete(type);
  }

  /**
   * Abilita/disabilita una condizione di stop
   */
  toggleStopCondition(type: StopReason, enabled: boolean): boolean {
    const condition = this.customConditions.get(type);
    if (condition) {
      condition.enabled = enabled;
      return true;
    }
    return false;
  }

  /**
   * Aggiorna la soglia di una condizione
   */
  updateThreshold(type: StopReason, threshold: number): boolean {
    const condition = this.customConditions.get(type);
    if (condition) {
      condition.threshold = threshold;
      return true;
    }
    return false;
  }

  /**
   * Valuta tutte le condizioni di stop per una sessione
   */
  evaluateStopConditions(
    session: AutonomousSession,
    currentAnalysis: QualityAnalysis
  ): {
    shouldStop: boolean;
    reason: StopReason | null;
    confidence: number;
    triggeredConditions: StopReason[];
  } {
    const triggeredConditions: StopReason[] = [];
    let highestConfidenceReason: StopReason | null = null;
    let highestConfidence = 0;

    // Evaluate each condition
    for (const [type, condition] of Array.from(this.customConditions.entries())) {
      if (!condition.enabled) continue;

      try {
        const isTriggered = condition.customLogic
          ? condition.customLogic(session)
          : this.evaluateDefaultCondition(type as StopReason, session, currentAnalysis, condition.threshold);

        if (isTriggered) {
          triggeredConditions.push(type as StopReason);

          // Calculate confidence for this condition
          const confidence = this.calculateConditionConfidence(type as StopReason, session, currentAnalysis);
          if (confidence > highestConfidence) {
            highestConfidence = confidence;
            highestConfidenceReason = type as StopReason;
          }
        }
      } catch (error) {
        console.error(`Error evaluating stop condition ${type}:`, error);
      }
    }

    return {
      shouldStop: triggeredConditions.length > 0,
      reason: highestConfidenceReason,
      confidence: highestConfidence,
      triggeredConditions
    };
  }

  /**
   * Valuta una condizione di stop predefinita
   */
  private evaluateDefaultCondition(
    type: StopReason,
    session: AutonomousSession,
    analysis: QualityAnalysis,
    threshold?: number
  ): boolean {
    switch (type) {
      case "quality_achieved":
        return analysis.score >= (threshold || this.defaultPreferences.qualityThreshold);

      case "max_iterations":
        return session.currentIteration >= (threshold || this.defaultPreferences.maxIterations);

      case "timeout":
        const elapsed = Date.now() - session.startTime.getTime();
        return elapsed >= (threshold || this.defaultPreferences.timeLimit);

      case "user_interrupted":
        return session.userInterrupted;

      case "error_threshold":
        const criticalErrors = analysis.errors.filter(e => e.severity === "critical").length;
        return criticalErrors >= (threshold || 3);

      case "diminishing_returns":
        if (session.iterations.length < 2) return false;
        const lastTwo = session.iterations.slice(-2);
        const improvement = lastTwo[1].qualityAfter.score - lastTwo[0].qualityAfter.score;
        return improvement < (threshold || 5);

      case "no_improvements_possible":
        return analysis.improvements.length === 0 && analysis.score < this.defaultPreferences.qualityThreshold;

      default:
        return false;
    }
  }

  /**
   * Calcola la confidenza per una condizione specifica
   */
  private calculateConditionConfidence(
    type: StopReason,
    session: AutonomousSession,
    analysis: QualityAnalysis
  ): number {
    switch (type) {
      case "quality_achieved":
        const qualityExcess = analysis.score - this.defaultPreferences.qualityThreshold;
        return Math.min(100, 90 + qualityExcess); // 90-100% confidence

      case "max_iterations":
        return 100; // Always certain when max iterations reached

      case "timeout":
        return 100; // Always certain when timeout reached

      case "user_interrupted":
        return 100; // Always certain when user interrupts

      case "error_threshold":
        const criticalErrors = analysis.errors.filter(e => e.severity === "critical").length;
        return Math.min(100, 70 + criticalErrors * 10); // 70-100% confidence

      case "diminishing_returns":
        if (session.iterations.length < 2) return 0;
        const lastTwo = session.iterations.slice(-2);
        const improvement = lastTwo[1].qualityAfter.score - lastTwo[0].qualityAfter.score;
        return Math.min(100, 60 + Math.max(0, 5 - improvement) * 8); // 60-100% confidence

      case "no_improvements_possible":
        const confidenceBoost = analysis.score < 50 ? 20 : 0; // Lower quality = higher confidence
        return 70 + confidenceBoost; // 70-90% confidence

      default:
        return 50; // Default moderate confidence
    }
  }

  /**
   * Ottiene tutte le condizioni attive
   */
  getActiveConditions(): StopCondition[] {
    return Array.from(this.customConditions.values()).filter(c => c.enabled);
  }

  /**
   * Ottiene una condizione specifica
   */
  getCondition(type: StopReason): StopCondition | undefined {
    return this.customConditions.get(type);
  }

  /**
   * Resetta tutte le condizioni ai valori di default
   */
  resetToDefaults(): void {
    this.customConditions.clear();
    this.initializeDefaultConditions();
  }

  /**
   * Aggiorna le preferenze e riconfigura le condizioni
   */
  updatePreferences(preferences: Partial<AutonomousPreferences>): void {
    this.defaultPreferences = { ...this.defaultPreferences, ...preferences };
    this.resetToDefaults(); // Reinitialize with new preferences
  }

  /**
   * Genera un report delle condizioni valutate
   */
  generateConditionsReport(
    session: AutonomousSession,
    analysis: QualityAnalysis
  ): {
    totalConditions: number;
    activeConditions: number;
    triggeredConditions: StopReason[];
    conditionDetails: Array<{
      type: StopReason;
      enabled: boolean;
      triggered: boolean;
      confidence: number;
      threshold?: number;
    }>;
  } {
    const evaluation = this.evaluateStopConditions(session, analysis);
    const conditionDetails = Array.from(this.customConditions.entries()).map(([type, condition]) => ({
      type: type as StopReason,
      enabled: condition.enabled,
      triggered: evaluation.triggeredConditions.includes(type as StopReason),
      confidence: condition.enabled ? this.calculateConditionConfidence(type as StopReason, session, analysis) : 0,
      threshold: condition.threshold
    }));

    return {
      totalConditions: this.customConditions.size,
      activeConditions: this.getActiveConditions().length,
      triggeredConditions: evaluation.triggeredConditions,
      conditionDetails
    };
  }
}
