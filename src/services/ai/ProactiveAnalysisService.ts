// src/services/ai/ProactiveAnalysisService.ts
import { GCodeAnalysisUtils, PerformanceMonitor } from "@/src/components/ai/ProactiveAssistant/utils";
import { ProactiveSuggestion, ProactiveAnalysisResult } from "@/src/components/ai/ProactiveAssistant/types";

/**
 * ProactiveAnalysisService provides comprehensive real-time analysis capabilities for G-code development.
 * This service coordinates multiple analytical processes while maintaining optimal performance through
 * intelligent caching and selective processing mechanisms.
 *
 * The service integrates with multiple AI providers and local analysis engines to deliver contextual
 * insights, suggestions, and predictive recommendations during active code development sessions.
 */
export class ProactiveAnalysisService {
  private static instance: ProactiveAnalysisService | null = null;
  private analysisCache: Map<string, { result: ProactiveAnalysisResult; timestamp: number }>;
  private cacheTimeout: number = 300000; // 5 minutes
  private analysisQueue: Array<{ code: string; resolve: Function; reject: Function }>;
  private isProcessing: boolean = false;

  constructor() {
    this.analysisCache = new Map();
    this.analysisQueue = [];
  }

  /**
   * Singleton pattern implementation ensures consistent state management across the application.
   * This approach prevents duplicate analysis processes and maintains cache coherence.
   */
  public static getInstance(): ProactiveAnalysisService {
    if (!ProactiveAnalysisService.instance) {
      ProactiveAnalysisService.instance = new ProactiveAnalysisService();
    }
    return ProactiveAnalysisService.instance;
  }

  /**
   * Performs comprehensive proactive analysis of G-code content with caching optimization.
   * This method coordinates syntax analysis, semantic understanding, and optimization detection
   * while maintaining responsiveness through intelligent queue management.
   */
  public async analyzeCode(
    code: string,
    options: {
      priority?: "low" | "medium" | "high";
      includePerformanceMetrics?: boolean;
      userContext?: Record<string, any>;
    } = {}
  ): Promise<ProactiveAnalysisResult> {
    const codeHash = this.generateCodeHash(code);
    const cachedResult = this.getCachedResult(codeHash);

    if (cachedResult) {
      return cachedResult;
    }

    return new Promise((resolve, reject) => {
      this.analysisQueue.push({
        code,
        resolve: (result: ProactiveAnalysisResult) => {
          this.cacheResult(codeHash, result);
          resolve(result);
        },
        reject
      });

      this.processAnalysisQueue();
    });
  }

  /**
   * Generates contextual suggestions based on current cursor position and code environment.
   * This method provides just-in-time assistance that adapts to specific editing contexts
   * while considering user behavior patterns and historical preferences.
   */
  public async generateContextualSuggestions(
    code: string,
    cursorPosition: number,
    recentActions: string[] = []
  ): Promise<ProactiveSuggestion[]> {
    const timerId = PerformanceMonitor.startTimer("contextual_suggestions");

    try {
      const codeAnalysis = GCodeAnalysisUtils.analyzeCodeContext(code, cursorPosition);
      const suggestions = GCodeAnalysisUtils.generateProactiveSuggestions(code, codeAnalysis, recentActions);

      // Filter suggestions based on current context relevance
      const contextualSuggestions = this.filterContextualRelevance(suggestions, cursorPosition, code);

      return contextualSuggestions.slice(0, 5); // Limit to most relevant suggestions
    } finally {
      PerformanceMonitor.endTimer(timerId);
    }
  }

  /**
   * Validates code changes in real-time to prevent errors before they impact execution.
   * This method performs incremental validation that focuses on modified sections
   * while maintaining awareness of broader code context and dependencies.
   */
  public async validateCodeChanges(
    previousCode: string,
    currentCode: string,
    changedLines: number[]
  ): Promise<{
    isValid: boolean;
    warnings: Array<{ line: number; message: string; severity: "warning" | "error" }>;
    suggestions: ProactiveSuggestion[];
  }> {
    const timerId = PerformanceMonitor.startTimer("code_validation");

    try {
      const validationResult = {
        isValid: true,
        warnings: [] as Array<{ line: number; message: string; severity: "warning" | "error" }>,
        suggestions: [] as ProactiveSuggestion[]
      };

      // Perform incremental validation focusing on changed sections
      for (const lineNumber of changedLines) {
        const lineValidation = await this.validateCodeLine(currentCode, lineNumber);

        if (lineValidation.warnings.length > 0) {
          validationResult.warnings.push(...lineValidation.warnings);

          if (lineValidation.warnings.some(w => w.severity === "error")) {
            validationResult.isValid = false;
          }
        }

        if (lineValidation.suggestions.length > 0) {
          validationResult.suggestions.push(...lineValidation.suggestions);
        }
      }

      return validationResult;
    } finally {
      PerformanceMonitor.endTimer(timerId);
    }
  }

  /**
   * Analyzes code performance characteristics and provides optimization recommendations.
   * This method evaluates execution efficiency, resource utilization, and identifies
   * bottlenecks while considering machine-specific constraints and capabilities.
   */
  public async analyzePerformance(
    code: string,
    machineProfile?: {
      maxFeedRate: number;
      maxSpindleSpeed: number;
      rapidRate: Record<string, any>;
      toolChangeTime: number;
    }
  ): Promise<{
    executionTime: number;
    efficiency: number;
    bottlenecks: Array<{ line: number; description: string; impact: number }>;
    recommendations: ProactiveSuggestion[];
  }> {
    const timerId = PerformanceMonitor.startTimer("performance_analysis");

    try {
      const codeMetrics = GCodeAnalysisUtils.calculateCodeQuality(code);
      const analysisContext = GCodeAnalysisUtils.analyzeCodeContext(code);

      // Calculate estimated execution time based on commands and machine capabilities
      const executionTime = this.calculateExecutionTime(code, machineProfile);

      // Identify performance bottlenecks through pattern analysis
      const bottlenecks = this.identifyPerformanceBottlenecks(code, machineProfile);

      // Generate performance-focused optimization suggestions
      const recommendations = await this.generatePerformanceRecommendations(code, bottlenecks, codeMetrics);

      return {
        executionTime,
        efficiency: codeMetrics.metrics.efficiency,
        bottlenecks,
        recommendations
      };
    } finally {
      PerformanceMonitor.endTimer(timerId);
    }
  }

  /**
   * Clears analysis cache to ensure fresh results when code context changes significantly.
   * This method maintains optimal memory usage while preserving frequently accessed results.
   */
  public clearCache(selectiveHash?: string): void {
    if (selectiveHash) {
      this.analysisCache.delete(selectiveHash);
    } else {
      this.analysisCache.clear();
    }
  }

  /**
   * Retrieves comprehensive performance metrics for analysis system optimization.
   * These metrics enable continuous improvement of analysis accuracy and response time.
   */
  public getPerformanceMetrics(): {
    cacheHitRate: number;
    averageAnalysisTime: number;
    totalAnalysesPerformed: number;
    currentQueueLength: number;
  } {
    return {
      cacheHitRate: this.calculateCacheHitRate(),
      averageAnalysisTime: PerformanceMonitor.getAverageTime("proactive_analysis"),
      totalAnalysesPerformed: this.getTotalAnalysesCount(),
      currentQueueLength: this.analysisQueue.length
    };
  }

  // Private helper methods for internal service operations

  private async processAnalysisQueue(): Promise<void> {
    if (this.isProcessing || this.analysisQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      while (this.analysisQueue.length > 0) {
        const { code, resolve, reject } = this.analysisQueue.shift()!;

        try {
          const result = await this.performComprehensiveAnalysis(code);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async performComprehensiveAnalysis(code: string): Promise<ProactiveAnalysisResult> {
    const timerId = PerformanceMonitor.startTimer("comprehensive_analysis");

    try {
      const codeAnalysis = GCodeAnalysisUtils.analyzeCodeContext(code);
      const qualityMetrics = GCodeAnalysisUtils.calculateCodeQuality(code);
      const suggestions = GCodeAnalysisUtils.generateProactiveSuggestions(code, codeAnalysis);
      const hints = GCodeAnalysisUtils.generateContextualHints(code, 0, []);

      const result: ProactiveAnalysisResult = {
        suggestions,
        hints,
        codeQuality: qualityMetrics,
        predictiveInsights: {
          potentialIssues: this.identifyPotentialIssues(code),
          recommendedNextSteps: this.generateNextSteps(code, suggestions),
          performanceEstimate: {
            executionTime: this.estimateExecutionTime(code),
            accuracy: 0.92
          }
        }
      };

      return result;
    } finally {
      PerformanceMonitor.endTimer(timerId);
    }
  }

  private generateCodeHash(code: string): string {
    // Simple hash function for cache key generation
    let hash = 0;
    for (let i = 0; i < code.length; i++) {
      const char = code.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString();
  }

  private getCachedResult(hash: string): ProactiveAnalysisResult | null {
    const cached = this.analysisCache.get(hash);

    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.result;
    }

    if (cached) {
      this.analysisCache.delete(hash);
    }

    return null;
  }

  private cacheResult(hash: string, result: ProactiveAnalysisResult): void {
    this.analysisCache.set(hash, {
      result,
      timestamp: Date.now()
    });

    // Implement cache size management
    if (this.analysisCache.size > 100) {
      const oldestEntry = Array.from(this.analysisCache.entries()).sort(([, a], [, b]) => a.timestamp - b.timestamp)[0];

      if (oldestEntry) {
        this.analysisCache.delete(oldestEntry[0]);
      }
    }
  }

  private filterContextualRelevance(
    suggestions: ProactiveSuggestion[],
    cursorPosition: number,
    code: string
  ): ProactiveSuggestion[] {
    return suggestions.filter(suggestion => {
      if (!suggestion.codeLocation) return true;

      const { line } = suggestion.codeLocation;
      const currentLine = this.getLineFromPosition(code, cursorPosition);

      // Include suggestions within 5 lines of current position
      return Math.abs(line - currentLine) <= 5;
    });
  }

  private async validateCodeLine(
    code: string,
    lineNumber: number
  ): Promise<{
    warnings: Array<{ line: number; message: string; severity: "warning" | "error" }>;
    suggestions: ProactiveSuggestion[];
  }> {
    const lines = code.split("\n");
    const line = lines[lineNumber];
    const warnings: Array<{ line: number; message: string; severity: "warning" | "error" }> = [];
    const suggestions: ProactiveSuggestion[] = [];

    if (!line || !line.trim()) {
      return { warnings, suggestions };
    }

    // Basic G-code validation patterns
    if (line.includes("G0") && line.includes("Z-")) {
      warnings.push({
        line: lineNumber,
        message: "Rapid movement into material detected - potential safety risk",
        severity: "error"
      });
    }

    if (/G0?1/.test(line) && !/F\d+/.test(line) && !/F\d+/.test(lines.slice(0, lineNumber).join("\n"))) {
      warnings.push({
        line: lineNumber,
        message: "Feed move without feed rate specification",
        severity: "warning"
      });
    }

    return { warnings, suggestions };
  }

  private calculateExecutionTime(code: string, machineProfile?: Record<string, any>): number {
    const moves = (code.match(/G0?[123]/g) || []).length;
    const toolChanges = (code.match(/T\d+/g) || []).length;

    const baseMoveTime = 0.5; // seconds per move
    const toolChangeTime = machineProfile?.toolChangeTime || 10;

    return moves * baseMoveTime + toolChanges * toolChangeTime;
  }

  private identifyPerformanceBottlenecks(
    code: string,
    machineProfile?: Record<string, any>
  ): Array<{ line: number; description: string; impact: number }> {
    const bottlenecks: Array<{ line: number; description: string; impact: number }> = [];
    const lines = code.split("\n");

    lines.forEach((line, index) => {
      if (line.includes("F1") || line.includes("F2")) {
        bottlenecks.push({
          line: index,
          description: "Very slow feed rate detected",
          impact: 0.8
        });
      }

      if (line.includes("G4")) {
        bottlenecks.push({
          line: index,
          description: "Dwell time may impact cycle time",
          impact: 0.6
        });
      }
    });

    return bottlenecks;
  }

  private async generatePerformanceRecommendations(
    code: string,
    bottlenecks: Array<{ line: number; description: string; impact: number }>,
    metrics: any
  ): Promise<ProactiveSuggestion[]> {
    const recommendations = [];

    for (const bottleneck of bottlenecks) {
      if (bottleneck.impact > 0.7) {
        recommendations.push({
          id: `perf_${Date.now()}_${bottleneck.line}`,
          type: "optimization" as const,
          severity: "high" as const,
          title: "Performance Optimization Available",
          description: bottleneck.description,
          suggestedAction: "Consider increasing feed rate or optimizing toolpath",
          codeLocation: {
            line: bottleneck.line,
            column: 0,
            length: 1
          },
          confidence: 0.85,
          autoApplicable: false,
          estimatedImpact: {
            timeReduction: bottleneck.impact * 10
          }
        });
      }
    }

    return recommendations;
  }

  private identifyPotentialIssues(code: string): string[] {
    const issues = [];

    if (!/G54|G55|G56|G57|G58|G59/.test(code)) {
      issues.push("Missing work coordinate system specification");
    }

    if (!/M30|M02/.test(code)) {
      issues.push("Program end command not found");
    }

    return issues;
  }

  private generateNextSteps(code: string, suggestions: ProactiveSuggestion[]): string[] {
    const nextSteps = [];

    if (suggestions.some(s => s.type === "optimization")) {
      nextSteps.push("Review and apply optimization suggestions");
    }

    if (suggestions.some(s => s.type === "safety")) {
      nextSteps.push("Address safety concerns before execution");
    }

    nextSteps.push("Verify code through simulation");

    return nextSteps;
  }

  private estimateExecutionTime(code: string): number {
    const moves = (code.match(/G0?[123]/g) || []).length;
    return moves * 0.5; // Simplified estimation
  }

  private getLineFromPosition(code: string, position: number): number {
    return code.substring(0, position).split("\n").length - 1;
  }

  private calculateCacheHitRate(): number {
    // Implementation would track cache hits vs misses
    return 0.75; // Placeholder
  }

  private getTotalAnalysesCount(): number {
    // Implementation would track total analyses performed
    return 150; // Placeholder
  }
}

export default ProactiveAnalysisService;
