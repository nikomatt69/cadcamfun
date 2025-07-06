// src/components/ai/ProactiveAssistant/types.ts
export interface ProactiveSuggestion {
  id: string;
  type: "optimization" | "error" | "improvement" | "completion" | "safety";
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  suggestedAction: string;
  codeLocation?: {
    line: number;
    column: number;
    length: number;
  };
  confidence: number;
  autoApplicable: boolean;
  estimatedImpact?: {
    timeReduction?: number;
    qualityImprovement?: number;
    safetyScore?: number;
  };
}

export interface ContextualHint {
  id: string;
  trigger: "selection" | "cursor" | "typing" | "idle";
  content: string;
  actionable: boolean;
  persistent: boolean;
  priority: number;
}

export interface VoiceCommand {
  command: string;
  intent: "generate" | "optimize" | "explain" | "navigate" | "edit";
  parameters: Record<string, any>;
  confidence: number;
}

export interface ProactiveAnalysisResult {
  suggestions: ProactiveSuggestion[];
  hints: ContextualHint[];
  codeQuality: {
    score: number;
    metrics: {
      efficiency: number;
      safety: number;
      maintainability: number;
      compatibility: number;
    };
  };
  predictiveInsights: {
    potentialIssues: string[];
    recommendedNextSteps: string[];
    performanceEstimate: {
      executionTime: number;
      accuracy: number;
    };
  };
}

export interface ProactiveAssistantConfig {
  enableRealTimeAnalysis: boolean;
  enableVoiceInteraction: boolean;
  enableProactiveSuggestions: boolean;
  suggestionFrequency: "immediate" | "moderate" | "minimal";
  autoApplyLowRiskSuggestions: boolean;
  personalizedLearning: boolean;
}
