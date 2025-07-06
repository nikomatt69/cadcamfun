// src/components/ai/AIInsights/types.ts

export interface AIInsight {
  id: string;
  type: "optimization" | "quality" | "efficiency" | "safety" | "trend" | "prediction";
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "critical";
  category: "code_quality" | "performance" | "safety" | "maintenance" | "learning";
  timestamp: Date;
  confidence: number;
  actionable: boolean;
  impact: {
    timeReduction?: number;
    qualityImprovement?: number;
    costSavings?: number;
    riskReduction?: number;
  };
  metadata: Record<string, any>;
}

export interface CodeMetrics {
  linesOfCode: number;
  complexity: number;
  efficiency: number;
  maintainability: number;
  safety: number;
  compatibility: number;
  executionTime: number;
  toolpathLength: number;
  rapidMoves: number;
  feedMoves: number;
  arcMoves: number;
  toolChanges: number;
}

export interface PerformanceTrend {
  timestamp: Date;
  metric: string;
  value: number;
  target?: number;
  improvement: number;
}

export interface PredictiveInsight {
  id: string;
  prediction: string;
  probability: number;
  timeframe: "immediate" | "short_term" | "medium_term" | "long_term";
  recommendedActions: string[];
  basedOn: string[];
}

export interface UserProductivityMetrics {
  sessionsCount: number;
  averageSessionDuration: number;
  codeGenerationEfficiency: number;
  errorReductionRate: number;
  aiSuggestionAcceptanceRate: number;
  mostUsedFeatures: string[];
  learningProgress: {
    beginnerConcepts: number;
    intermediateConcepts: number;
    advancedConcepts: number;
  };
}

export interface DashboardConfig {
  refreshInterval: number;
  enableRealTimeUpdates: boolean;
  visiblePanels: string[];
  layout: "compact" | "detailed" | "minimal";
  notifications: {
    criticalInsights: boolean;
    performanceAlerts: boolean;
    learningTips: boolean;
  };
}

export interface AIInsightsContextType {
  insights: AIInsight[];
  metrics: CodeMetrics | null;
  trends: PerformanceTrend[];
  predictions: PredictiveInsight[];
  productivity: UserProductivityMetrics | null;
  isLoading: boolean;
  error: string | null;
  config: DashboardConfig;
  updateConfig: (config: Partial<DashboardConfig>) => void;
  refreshInsights: () => Promise<void>;
  dismissInsight: (insightId: string) => void;
  applyInsightAction: (insightId: string) => Promise<void>;
}
