/**
 * Tipi per il sistema AI autonomo
 */

import { AIModelType, AIMessage, ThinkingSession } from "../AITypes";
import { Element } from "@/src/store/elementsStore";

/**
 * Stato dell'agent autonomo
 */
export type AutonomousState =
  | "idle"
  | "analyzing"
  | "thinking"
  | "generating"
  | "correcting"
  | "validating"
  | "completed"
  | "stopped"
  | "error";

/**
 * Tipo di decisione autonoma
 */
export type AutonomousDecision =
  | "continue" // Continua con miglioramenti
  | "correct" // Correggi errori
  | "complete" // Completa elementi mancanti
  | "optimize" // Ottimizza risultato
  | "stop" // Ferma, obiettivo raggiunto
  | "abort" // Interrompi per errore grave
  | "retry" // Riprova con strategia diversa
  | "clarify"; // Richiedi chiarimenti all'utente

/**
 * Analisi della risposta AI
 */
export interface ResponseAnalysis {
  // Qualità generale della risposta
  quality: {
    score: number; // 0-1
    confidence: number; // 0-1
    completeness: number; // 0-1
    accuracy: number; // 0-1
  };

  // Problemi rilevati
  issues: AnalysisIssue[];

  // Suggerimenti per migliorare
  improvements: ImprovementSuggestion[];

  // Decisione proposta
  decision: AutonomousDecision;
  reasoning: string;

  // Elementi specifici CAD
  cadAnalysis?: {
    elementsGenerated: number;
    elementsValid: number;
    geometryErrors: string[];
    constraintViolations: string[];
    missingRequirements: string[];
  };
}

/**
 * Problema rilevato nell'analisi
 */
export interface AnalysisIssue {
  type: "error" | "warning" | "suggestion";
  severity: "critical" | "major" | "minor";
  category: IssueCategory;
  description: string;
  location?: string;
  suggestedFix?: string;
}

export type IssueCategory =
  | "syntax"
  | "logic"
  | "completeness"
  | "accuracy"
  | "performance"
  | "constraints"
  | "requirements"
  | "geometry"
  | "validation";

/**
 * Suggerimento di miglioramento
 */
export interface ImprovementSuggestion {
  type: "enhancement" | "optimization" | "correction";
  priority: "high" | "medium" | "low";
  description: string;
  implementation: string;
  expectedImpact: string;
}

/**
 * Contesto di esecuzione autonoma
 */
export interface AutonomousContext {
  // Obiettivo originale
  originalRequest: string;

  // Requisiti estratti
  requirements: Requirement[];

  // Vincoli da rispettare
  constraints: Constraint[];

  // Storico iterazioni
  iterations: AutonomousIteration[];

  // Configurazione
  config: AutonomousConfig;

  // Stato corrente
  currentState: AutonomousState;

  // Metriche
  metrics: AutonomousMetrics;
}

/**
 * Requisito estratto dalla richiesta
 */
export interface Requirement {
  id: string;
  description: string;
  type: "functional" | "non-functional" | "constraint";
  priority: "must-have" | "should-have" | "nice-to-have";
  status: "pending" | "in-progress" | "completed" | "failed";
  validationCriteria?: string[];
}

/**
 * Vincolo da rispettare
 */
export interface Constraint {
  id: string;
  type: "dimension" | "material" | "performance" | "safety" | "cost" | "time";
  description: string;
  value: any;
  unit?: string;
  tolerance?: number;
}

/**
 * Iterazione del processo autonomo
 */
export interface AutonomousIteration {
  id: string;
  number: number;
  timestamp: number;

  // Input/Output
  input: string;
  output: string;

  // Analisi
  analysis: ResponseAnalysis;

  // Decisione presa
  decision: AutonomousDecision;

  // Thinking session se disponibile
  thinking?: ThinkingSession;

  // Risultati
  results?: {
    elements?: Element[];
    errors?: Error[];
    warnings?: string[];
  };

  // Durata
  duration: number;
}

/**
 * Configurazione sistema autonomo
 */
export interface AutonomousConfig {
  // Limiti
  maxIterations: number; // Default: 10
  maxDuration: number; // ms, Default: 300000 (5 min)
  maxTokensPerIteration: number; // Default: 8000

  // Comportamento
  autoCorrect: boolean; // Default: true
  autoOptimize: boolean; // Default: true
  requireUserConfirmation: boolean; // Default: false
  stopOnFirstSuccess: boolean; // Default: false

  // Soglie di qualità
  minQualityScore: number; // 0-1, Default: 0.8
  minConfidence: number; // 0-1, Default: 0.7
  minCompleteness: number; // 0-1, Default: 0.9

  // Modello AI
  model: AIModelType;
  temperature: number;

  // Features abilitate
  enableThinking: boolean;
  enableMCP: boolean;
  enableWebSearch: boolean;
  enableCodeInterpreter: boolean;
}

/**
 * Metriche del processo autonomo
 */
export interface AutonomousMetrics {
  startTime: number;
  endTime?: number;
  totalDuration: number;

  iterations: number;
  successfulIterations: number;
  failedIterations: number;

  tokensUsed: number;
  estimatedCost: number;

  qualityProgression: number[]; // Progressione del punteggio qualità

  finalQuality?: number;
  goalsAchieved: number;
  goalsTotal: number;
}

/**
 * Report finale del processo autonomo
 */
export interface AutonomousFinalReport {
  id: string;
  timestamp: number;

  // Riepilogo
  summary: {
    request: string;
    result: "success" | "partial" | "failure";
    iterations: number;
    duration: number;
    finalQuality: number;
  };

  // Obiettivi
  goals: {
    achieved: Requirement[];
    partial: Requirement[];
    failed: Requirement[];
  };

  // Processo
  process: {
    iterations: AutonomousIteration[];
    decisions: AutonomousDecision[];
    improvements: string[];
  };

  // Risultati
  results: {
    elements?: Element[];
    artifacts?: any[];
    errors?: Error[];
    warnings?: string[];
  };

  // Metriche
  metrics: AutonomousMetrics;

  // Raccomandazioni
  recommendations: string[];
}

/**
 * Eventi del sistema autonomo
 */
export interface AutonomousEvent {
  type: AutonomousEventType;
  timestamp: number;
  data: any;
}

export type AutonomousEventType =
  | "started"
  | "iteration_start"
  | "iteration_complete"
  | "analysis_complete"
  | "decision_made"
  | "correction_start"
  | "optimization_start"
  | "stopped"
  | "completed"
  | "error"
  | "report_generated";

/**
 * Callback per eventi autonomi
 */
export type AutonomousEventCallback = (event: AutonomousEvent) => void;

/**
 * Opzioni per inizializzare l'agent autonomo
 */
export interface AutonomousAgentOptions {
  config?: Partial<AutonomousConfig>;
  onEvent?: AutonomousEventCallback;
  onProgress?: (progress: number) => void;
  onIteration?: (iteration: AutonomousIteration) => void;
  onDecision?: (decision: AutonomousDecision, reasoning: string) => void;
  onReport?: (report: AutonomousFinalReport) => void;
}

/**
 * Strategia di correzione
 */
export interface CorrectionStrategy {
  type: "retry" | "patch" | "regenerate" | "incremental";
  priority: IssueCategory[];
  maxAttempts: number;
  backoffMultiplier: number;
}

/**
 * Piano di esecuzione autonoma
 */
export interface ExecutionPlan {
  steps: ExecutionStep[];
  estimatedDuration: number;
  estimatedIterations: number;
  confidence: number;
}

/**
 * Step di esecuzione
 */
export interface ExecutionStep {
  id: string;
  type: "analyze" | "generate" | "validate" | "correct" | "optimize";
  description: string;
  input: any;
  expectedOutput: string;
  successCriteria: string[];
  fallbackStrategy?: string;
}
