// =======================================================================================
// src/types/autonomousTypes.ts - Types per il sistema autonomo
// =======================================================================================

export interface AutonomousSession {
  id: string;
  startTime: Date;
  endTime?: Date;
  originalRequest: string;
  context: CADContext;
  iterations: IterationResult[];
  currentIteration: number;
  maxIterations: number;
  isActive: boolean;
  finalReport?: ProgressReport;
  userInterrupted: boolean;
}

export interface QualityAnalysis {
  score: number; // 0-100
  completeness: number; // 0-100
  accuracy: number; // 0-100
  errorCount: number;
  errors: ErrorReport[];
  improvements: Suggestion[];
  confidence: number; // 0-100
  reasoning: string;
}

export interface ErrorReport {
  type: "syntax" | "logic" | "consistency" | "missing" | "invalid";
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  location?: string;
  suggestion?: string;
}

export interface Suggestion {
  type: "add" | "modify" | "remove" | "refine";
  priority: "low" | "medium" | "high";
  description: string;
  expectedImprovement: number; // 0-100
  effort: "minimal" | "moderate" | "significant";
  actionDetails?: {
    elementsToAdd?: Array<{
      description: string;
    }>;
    elementsToModify?: Array<{
      targetElementId: string;
      modificationDescription?: string;
      properties?: Record<string, any>;
    }>;
    elementsToRemove?: Array<{
      targetElementId: string;
      reason?: string;
    }>;
    refinementPrompt?: string;
  };
}

export interface IterationResult {
  iteration: number;
  timestamp: Date;
  input: string;
  output: string;
  qualityBefore?: QualityAnalysis;
  qualityAfter: QualityAnalysis;
  improvements: Suggestion[];
  processingTime: number;
  stopReason?: StopReason;
  elementsGenerated?: number;
  actionsExecuted?: string[];
  toolChainExecuted?: boolean;
  toolsExecutedCount?: number;
  continuousMode?: boolean;
}

export type StopReason =
  | "quality_achieved"
  | "max_iterations"
  | "user_interrupted"
  | "error_threshold"
  | "diminishing_returns"
  | "timeout"
  | "no_improvements_possible"
  | "objective_achieved"
  | "quality_stagnation"
  | "max_continuous_iterations";

export interface ProgressReport {
  sessionId: string;
  duration: number;
  totalIterations: number;
  finalQualityScore: number;
  qualityImprovement: number;
  elementsGenerated: number;
  actionsExecuted: string[];
  stopReason: StopReason;
  summary: string;
  achievements: string[];
  recommendations?: string[];
}

export interface ContinuityState {
  isAutonomous: boolean;
  currentSession?: AutonomousSession;
  strategy: IterationStrategy;
  stopConditions: StopCondition[];
  userPreferences: AutonomousPreferences;
}

export interface IterationStrategy {
  focusAreas: FocusArea[];
  improvementThreshold: number;
  qualityTarget: number;
  adaptiveMode: boolean;
  learningEnabled: boolean;
}

export interface StopCondition {
  type: StopReason;
  threshold?: number;
  enabled: boolean;
  customLogic?: (session: AutonomousSession) => boolean;
}

export interface AutonomousPreferences {
  maxIterations: number;
  qualityThreshold: number;
  timeLimit: number; // milliseconds
  allowUserInterruption: boolean;
  verboseReporting: boolean;
  adaptiveStrategy: boolean;
  enableContinuousChaining?: boolean;
  maxContinuousIterations?: number;
  streamingMode?: boolean;
}

export type FocusArea = "completeness" | "accuracy" | "error_correction" | "optimization" | "refinement" | "validation";

export interface CADContext {
  elements?: any[];
  projectName?: string;
  currentTool?: string;
  userPreferences?: Record<string, any>;
  constraints?: Record<string, any>;
  history?: any[];
  toolChainExecutions?: ToolChainExecution[];
}

/**
 * Traccia l'esecuzione di una catena di tools
 */
export interface ToolChainExecution {
  executionId: string;
  timestamp: Date;
  planId: string;
  objective: string;
  toolsExecuted: string[];
  totalExecutionTime: number;
  successRate: number; // 0-1
  qualityImprovement: number; // -1 to 1
  elementsCreated: number;
  elementsModified: number;
  elementsRemoved: number;
}
