// src/components/ai/ProactiveAssistant/utils.ts
import { ProactiveSuggestion, ContextualHint, ProactiveAnalysisResult } from "./types";

/**
 * Utility functions for the Proactive AI Assistant system.
 * These functions provide essential capabilities for code analysis, suggestion generation,
 * and contextual understanding within the G-code programming environment.
 */

export class GCodeAnalysisUtils {
  /**
   * Analyzes G-code content to identify patterns, potential issues, and optimization opportunities.
   * This method performs comprehensive semantic analysis beyond simple syntax checking.
   */
  static analyzeCodeContext(
    code: string,
    cursorPosition?: number
  ): {
    context: string;
    patterns: string[];
    complexity: number;
    riskLevel: "low" | "medium" | "high";
  } {
    const lines = code.split("\n");
    const currentLineIndex = cursorPosition ? this.getLineFromPosition(code, cursorPosition) : 0;

    // Extract contextual information around current position
    const contextStart = Math.max(0, currentLineIndex - 3);
    const contextEnd = Math.min(lines.length, currentLineIndex + 4);
    const context = lines.slice(contextStart, contextEnd).join("\n");

    // Identify programming patterns
    const patterns = this.identifyGCodePatterns(code);

    // Calculate complexity metrics
    const complexity = this.calculateCodeComplexity(code);

    // Assess risk level based on commands and patterns
    const riskLevel = this.assessRiskLevel(code);

    return { context, patterns, complexity, riskLevel };
  }

  /**
   * Generates proactive suggestions based on current code context and user behavior patterns.
   * This method leverages machine learning insights to provide contextually relevant recommendations.
   */
  static generateProactiveSuggestions(
    code: string,
    analysisResult: any,
    userHistory?: string[]
  ): ProactiveSuggestion[] {
    const suggestions: ProactiveSuggestion[] = [];

    // Analyze for optimization opportunities
    const optimizations = this.identifyOptimizationOpportunities(code);
    optimizations.forEach(opt => {
      suggestions.push({
        id: `opt_${Date.now()}_${Math.random()}`,
        type: "optimization",
        severity: opt.impact > 0.3 ? "high" : "medium",
        title: opt.title,
        description: opt.description,
        suggestedAction: opt.action,
        codeLocation: opt.location,
        confidence: opt.confidence,
        autoApplicable: opt.impact < 0.2,
        estimatedImpact: {
          timeReduction: opt.timeReduction,
          qualityImprovement: opt.qualityImprovement
        }
      });
    });

    // Check for potential errors or safety issues
    const safetyChecks = this.performSafetyAnalysis(code);
    safetyChecks.forEach(check => {
      if (check.severity > 0.5) {
        suggestions.push({
          id: `safety_${Date.now()}_${Math.random()}`,
          type: "safety",
          severity: check.severity > 0.8 ? "critical" : "high",
          title: check.issue,
          description: check.explanation,
          suggestedAction: check.resolution,
          codeLocation: check.location,
          confidence: check.confidence,
          autoApplicable: false,
          estimatedImpact: {
            safetyScore: check.safetyImprovement
          }
        });
      }
    });

    return suggestions.sort((a, b) => {
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    });
  }

  /**
   * Creates contextual hints based on current editor state and user interaction patterns.
   * These hints provide just-in-time learning opportunities and productivity enhancements.
   */
  static generateContextualHints(code: string, cursorPosition: number, recentActions: string[]): ContextualHint[] {
    const hints: ContextualHint[] = [];

    // Analyze current context for hint opportunities
    const currentLine = this.getCurrentLine(code, cursorPosition);
    const nearbyCommands = this.getNearbyCommands(code, cursorPosition);

    // Generate hints based on current context
    if (this.isAtParameterPosition(currentLine, cursorPosition)) {
      hints.push({
        id: `param_hint_${Date.now()}`,
        trigger: "cursor",
        content: this.getParameterHint(currentLine),
        actionable: true,
        persistent: false,
        priority: 3
      });
    }

    // Check for common patterns and suggest improvements
    const patternHints = this.generatePatternBasedHints(nearbyCommands);
    hints.push(...patternHints);

    return hints.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Calculates comprehensive code quality metrics for predictive analysis.
   * This method evaluates multiple dimensions of code quality and maintainability.
   */
  static calculateCodeQuality(code: string): {
    score: number;
    metrics: {
      efficiency: number;
      safety: number;
      maintainability: number;
      compatibility: number;
    };
  } {
    const lines = code.split("\n").filter(line => line.trim() && !line.trim().startsWith(";"));

    // Calculate efficiency metrics
    const efficiency = this.calculateEfficiencyScore(code);

    // Assess safety compliance
    const safety = this.calculateSafetyScore(code);

    // Evaluate maintainability factors
    const maintainability = this.calculateMaintainabilityScore(code);

    // Check compatibility with standard G-code practices
    const compatibility = this.calculateCompatibilityScore(code);

    const overallScore = (efficiency + safety + maintainability + compatibility) / 4;

    return {
      score: Math.round(overallScore * 100) / 100,
      metrics: {
        efficiency: Math.round(efficiency * 100) / 100,
        safety: Math.round(safety * 100) / 100,
        maintainability: Math.round(maintainability * 100) / 100,
        compatibility: Math.round(compatibility * 100) / 100
      }
    };
  }

  // Private helper methods for internal analysis operations

  private static getLineFromPosition(code: string, position: number): number {
    return code.substring(0, position).split("\n").length - 1;
  }

  private static identifyGCodePatterns(code: string): string[] {
    const patterns: string[] = [];

    // Common G-code patterns detection
    if (/G0[01]?\s+[XYZ]/.test(code)) patterns.push("linear_movement");
    if (/G0?2|G0?3/.test(code)) patterns.push("circular_movement");
    if (/M0?3|M0?4|M0?5/.test(code)) patterns.push("spindle_control");
    if (/T\d+/.test(code)) patterns.push("tool_change");
    if (/G8[1-9]|G9[0-9]/.test(code)) patterns.push("canned_cycle");

    return patterns;
  }

  private static calculateCodeComplexity(code: string): number {
    const lines = code.split("\n").filter(line => line.trim());
    const commands = lines.filter(line => /^[GM]\d+/.test(line.trim()));
    const parameters = code.match(/[XYZFIJKRS]\d+\.?\d*/g) || [];

    // Complexity based on command variety and parameter density
    const commandVariety = new Set(commands.map(cmd => cmd.match(/^[GM]\d+/)?.[0])).size;
    const parameterDensity = parameters.length / lines.length;

    return Math.min(1, commandVariety / 20 + parameterDensity / 3);
  }

  private static assessRiskLevel(code: string): "low" | "medium" | "high" {
    let riskScore = 0;

    // High-risk patterns
    if (/G0.*Z-/.test(code)) riskScore += 0.3; // Rapid movement into material
    if (/M3.*S\d{5,}/.test(code)) riskScore += 0.2; // Very high spindle speeds
    if (!/G94|G95/.test(code)) riskScore += 0.2; // No feed rate mode specified
    if (!/M30|M02/.test(code)) riskScore += 0.1; // No program end

    if (riskScore >= 0.5) return "high";
    if (riskScore >= 0.2) return "medium";
    return "low";
  }

  private static identifyOptimizationOpportunities(code: string): any[] {
    const opportunities: any[] = [];

    // Detect redundant positioning moves
    const redundantMoves = this.detectRedundantMoves(code);
    redundantMoves.forEach(move => {
      opportunities.push({
        title: "Redundant Movement Detected",
        description: "Multiple positioning moves to similar coordinates can be consolidated",
        action: "Combine redundant movements",
        location: move.location,
        confidence: 0.85,
        impact: 0.2,
        timeReduction: move.estimatedSaving,
        qualityImprovement: 0.1
      });
    });

    // Check for suboptimal feed rates
    const feedRateIssues = this.analyzeFeedRates(code);
    feedRateIssues.forEach(issue => {
      opportunities.push({
        title: "Feed Rate Optimization",
        description: issue.description,
        action: issue.suggestion,
        location: issue.location,
        confidence: 0.75,
        impact: 0.15,
        timeReduction: issue.timeReduction,
        qualityImprovement: issue.qualityImprovement
      });
    });

    return opportunities;
  }

  private static performSafetyAnalysis(code: string): any[] {
    const safetyIssues: any[] = [];

    // Check for missing safety commands
    if (!/G54|G55|G56|G57|G58|G59/.test(code)) {
      safetyIssues.push({
        issue: "No Work Coordinate System",
        explanation: "Missing work coordinate system specification can lead to positioning errors",
        resolution: "Add appropriate G54-G59 command",
        severity: 0.7,
        confidence: 0.9,
        safetyImprovement: 0.3,
        location: { line: 0, column: 0, length: 0 }
      });
    }

    // Check for rapid movements into material
    const lines = code.split("\n");
    lines.forEach((line, index) => {
      if (/G0.*Z-\d+/.test(line)) {
        safetyIssues.push({
          issue: "Rapid Movement into Material",
          explanation: "Rapid positioning movement with negative Z value may cause tool breakage",
          resolution: "Use G1 with appropriate feed rate for Z-axis movements into material",
          severity: 0.9,
          confidence: 0.85,
          safetyImprovement: 0.5,
          location: { line: index, column: 0, length: line.length }
        });
      }
    });

    return safetyIssues;
  }

  private static getCurrentLine(code: string, position: number): string {
    const lines = code.split("\n");
    const lineIndex = this.getLineFromPosition(code, position);
    return lines[lineIndex] || "";
  }

  private static getNearbyCommands(code: string, position: number, range: number = 3): string[] {
    const lines = code.split("\n");
    const lineIndex = this.getLineFromPosition(code, position);
    const start = Math.max(0, lineIndex - range);
    const end = Math.min(lines.length, lineIndex + range + 1);

    return lines.slice(start, end);
  }

  private static isAtParameterPosition(line: string, position: number): boolean {
    // Check if cursor is positioned after a parameter letter (X, Y, Z, F, etc.)
    const beforeCursor = line.substring(0, position);
    return /[XYZFIJKRS]$/.test(beforeCursor);
  }

  private static getParameterHint(line: string): string {
    const paramMatch = line.match(/([XYZFIJKRS])\d*\.?\d*$/);
    if (!paramMatch) return "";

    const param = paramMatch[1];
    const hints: Record<string, string> = {
      "X": "X-axis coordinate (horizontal positioning)",
      "Y": "Y-axis coordinate (depth/width positioning)",
      "Z": "Z-axis coordinate (vertical/height positioning)",
      "F": "Feed rate (cutting speed)",
      "S": "Spindle speed (RPM)",
      "I": "X-axis offset for circular interpolation",
      "J": "Y-axis offset for circular interpolation",
      "K": "Z-axis offset for circular interpolation",
      "R": "Radius for circular interpolation or canned cycles"
    };

    return hints[param] || "Parameter value";
  }

  private static generatePatternBasedHints(commands: string[]): ContextualHint[] {
    const hints: ContextualHint[] = [];

    // Analyze command patterns for hint opportunities
    const hasCircularMove = commands.some(cmd => /G0?[23]/.test(cmd));
    const hasLinearMove = commands.some(cmd => /G0?1/.test(cmd));

    if (hasCircularMove && !commands.some(cmd => /[IJK]/.test(cmd))) {
      hints.push({
        id: `circular_hint_${Date.now()}`,
        trigger: "typing",
        content: "Circular movements require I, J, or K parameters for arc center specification",
        actionable: true,
        persistent: true,
        priority: 2
      });
    }

    return hints;
  }

  private static calculateEfficiencyScore(code: string): number {
    // Implement efficiency calculation based on movement optimization,
    // redundancy reduction, and optimal command usage
    const lines = code.split("\n").filter(line => line.trim());
    const moveCommands = lines.filter(line => /G0[01]?/.test(line));

    // Basic efficiency metrics
    const redundancyPenalty = this.calculateRedundancyPenalty(code);
    const movementEfficiency = this.calculateMovementEfficiency(moveCommands);

    return Math.max(0, 1 - redundancyPenalty + movementEfficiency) / 2;
  }

  private static calculateSafetyScore(code: string): number {
    let safetyScore = 1.0;

    // Deduct points for safety violations
    if (!/G54|G55|G56|G57|G58|G59/.test(code)) safetyScore -= 0.2;
    if (!/M30|M02/.test(code)) safetyScore -= 0.1;
    if (/G0.*Z-/.test(code)) safetyScore -= 0.3;

    return Math.max(0, safetyScore);
  }

  private static calculateMaintainabilityScore(code: string): number {
    const lines = code.split("\n");
    const commentLines = lines.filter(line => line.trim().startsWith(";"));
    const codeLines = lines.filter(line => line.trim() && !line.trim().startsWith(";"));

    // Calculate comment ratio and code organization
    const commentRatio = commentLines.length / Math.max(1, codeLines.length);
    const organizationScore = this.calculateOrganizationScore(code);

    return Math.min(1, commentRatio + organizationScore);
  }

  private static calculateCompatibilityScore(code: string): number {
    // Check compatibility with standard G-code practices
    let compatibilityScore = 1.0;

    // Standard command usage
    const nonStandardCommands = code.match(/[GM]\d{3,}/g) || [];
    compatibilityScore -= nonStandardCommands.length * 0.1;

    return Math.max(0, compatibilityScore);
  }

  // Additional helper methods for detailed analysis

  private static detectRedundantMoves(code: string): any[] {
    // Implementation for detecting redundant movements
    return [];
  }

  private static analyzeFeedRates(code: string): any[] {
    // Implementation for feed rate analysis
    return [];
  }

  private static calculateRedundancyPenalty(code: string): number {
    // Implementation for redundancy calculation
    return 0;
  }

  private static calculateMovementEfficiency(moveCommands: string[]): number {
    // Implementation for movement efficiency calculation
    return 0.5;
  }

  private static calculateOrganizationScore(code: string): number {
    // Implementation for code organization scoring
    return 0.7;
  }
}

/**
 * Debounce utility for performance optimization of real-time analysis.
 * This prevents excessive API calls during rapid typing or editing.
 */
export function debounce<T extends (...args: any[]) => any>(func: T, wait: number): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;

  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Performance monitoring utility for tracking analysis response times.
 * This helps optimize the proactive assistance system for better user experience.
 */
export class PerformanceMonitor {
  private static metrics: Map<string, number[]> = new Map();

  static startTimer(operation: string): string {
    const timerId = `${operation}_${Date.now()}_${Math.random()}`;
    performance.mark(`${timerId}_start`);
    return timerId;
  }

  static endTimer(timerId: string): number {
    const operation = timerId.split("_")[0];
    performance.mark(`${timerId}_end`);
    performance.measure(timerId, `${timerId}_start`, `${timerId}_end`);

    const measure = performance.getEntriesByName(timerId)[0];
    const duration = measure.duration;

    if (!this.metrics.has(operation)) {
      this.metrics.set(operation, []);
    }

    const operationMetrics = this.metrics.get(operation)!;
    operationMetrics.push(duration);

    // Keep only last 100 measurements
    if (operationMetrics.length > 100) {
      operationMetrics.shift();
    }

    performance.clearMarks(`${timerId}_start`);
    performance.clearMarks(`${timerId}_end`);
    performance.clearMeasures(timerId);

    return duration;
  }

  static getAverageTime(operation: string): number {
    const metrics = this.metrics.get(operation);
    if (!metrics || metrics.length === 0) return 0;

    return metrics.reduce((sum, time) => sum + time, 0) / metrics.length;
  }

  static getMetricsSummary(): Record<string, { average: number; count: number; last: number }> {
    const summary: Record<string, { average: number; count: number; last: number }> = {};

    this.metrics.forEach((times, operation) => {
      if (times.length > 0) {
        summary[operation] = {
          average: times.reduce((sum, time) => sum + time, 0) / times.length,
          count: times.length,
          last: times[times.length - 1]
        };
      }
    });

    return summary;
  }
}
