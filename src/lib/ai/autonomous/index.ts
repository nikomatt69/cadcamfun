// =======================================================================================
// src/lib/ai/autonomous/index.ts - Export per il sistema autonomo
// =======================================================================================

export { AutonomousEngine } from "./autonomousEngine";
export { ResponseAnalyzer } from "./responseAnalyzer";
export { ContinuityOrchestrator, continuityOrchestrator } from "./continuityOrchestrator";
export type { SessionUpdate, AutonomousServiceCall } from "./continuityOrchestrator";

// Re-export types
export type {
  AutonomousSession,
  QualityAnalysis,
  ErrorReport,
  Suggestion,
  IterationResult,
  StopReason,
  ProgressReport,
  ContinuityState,
  IterationStrategy,
  StopCondition,
  AutonomousPreferences,
  FocusArea,
  CADContext
} from "@/src/types/autonomousTypes";
