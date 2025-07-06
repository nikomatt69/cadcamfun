import { Element } from "@/src/store/elementsStore";
import { ApplicationContext, UserAction } from "../UnifiedAIOrchestrator";

export class ContextAnalyzer {
  /**
   * Analyze current application context for AI decision making
   */
  async analyzeContext(context: ApplicationContext): Promise<{
    complexity: number;
    contextScore: number;
    recommendations: string[];
    urgentIssues: string[];
  }> {
    try {
      const complexity = this.calculateContextComplexity(context);
      const contextScore = this.calculateContextScore(context);
      const recommendations = this.generateRecommendations(context);
      const urgentIssues = this.identifyUrgentIssues(context);

      return {
        complexity,
        contextScore,
        recommendations,
        urgentIssues
      };
    } catch (error) {
      console.error("Context analysis error:", error);
      return {
        complexity: 0.5,
        contextScore: 0.5,
        recommendations: [],
        urgentIssues: []
      };
    }
  }

  /**
   * Calculate complexity based on elements and user actions
   */
  private calculateContextComplexity(context: ApplicationContext): number {
    let complexity = 0;

    // Element complexity
    const elementCount = context.elements.total.length;
    const elementTypeVariety = Object.keys(context.elements.types).length;

    complexity += Math.min(elementCount / 50, 0.4); // Max 0.4 for element count
    complexity += Math.min(elementTypeVariety / 10, 0.3); // Max 0.3 for variety

    // Interaction complexity
    const recentActions = context.user.recentActions.length;
    complexity += Math.min(recentActions / 20, 0.2); // Max 0.2 for recent actions

    // Session complexity
    complexity += Math.min(context.session.totalActions / 100, 0.1); // Max 0.1 for total actions

    return Math.min(complexity, 1);
  }

  /**
   * Calculate overall context quality score
   */
  private calculateContextScore(context: ApplicationContext): number {
    let score = 0.5; // Base score

    // Positive factors
    if (context.elements.selected.length > 0) score += 0.1;
    if (context.user.recentActions.length > 0) score += 0.1;
    if (context.viewport.camera.zoom > 0.5 && context.viewport.camera.zoom < 2) score += 0.1;
    if (context.session.successfulOperations > 0) score += 0.1;

    // Negative factors
    if (context.gcode && context.gcode.errors.length > 0) score -= 0.2;
    if (context.user.recentActions.filter(a => !a.success).length > 3) score -= 0.1;

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Generate contextual recommendations
   */
  private generateRecommendations(context: ApplicationContext): string[] {
    const recommendations: string[] = [];

    // Element-based recommendations
    if (context.elements.total.length === 0) {
      recommendations.push("Start by creating some basic elements to begin your design");
    } else if (context.elements.selected.length === 0 && context.elements.total.length > 5) {
      recommendations.push("Select elements to perform specific operations on them");
    }

    // Mode-specific recommendations
    if (context.page.section === "cad" && context.elements.total.length > 10) {
      recommendations.push("Consider grouping related elements for better organization");
    }

    if (context.page.section === "cam" && !context.gcode) {
      recommendations.push("Generate G-code to start machining preparation");
    }

    // Performance recommendations
    if (context.elements.total.length > 100) {
      recommendations.push("Consider using layers to organize complex designs");
    }

    return recommendations;
  }

  /**
   * Identify urgent issues that need attention
   */
  private identifyUrgentIssues(context: ApplicationContext): string[] {
    const issues: string[] = [];

    // G-code errors
    if (context.gcode && context.gcode.errors.length > 0) {
      issues.push(`G-code has ${context.gcode.errors.length} error(s) that need to be fixed`);
    }

    // Element issues
    if (context.elements.boundingBox) {
      const { min, max } = context.elements.boundingBox;
      const size = Math.max(max.x - min.x, max.y - min.y, max.z - min.z);
      if (size > 10000) {
        issues.push("Design size is very large, consider scaling down");
      }
    }

    // Session issues
    const failureRate =
      context.session.totalActions > 0
        ? (context.session.totalActions - context.session.successfulOperations) / context.session.totalActions
        : 0;

    if (failureRate > 0.3) {
      issues.push("High failure rate detected, consider reviewing your workflow");
    }

    return issues;
  }

  /**
   * Check if context is ready for specific operations
   */
  isContextReadyFor(context: ApplicationContext, operation: string): boolean {
    switch (operation) {
      case "cad_generation":
        return true; // Always ready for generation

      case "element_modification":
        return context.elements.selected.length > 0;

      case "design_analysis":
        return context.elements.total.length > 0;

      case "gcode_generation":
        return context.elements.total.length > 0 && context.page.section === "cam";

      case "gcode_optimization":
        return !!context.gcode && context.gcode.content.length > 0;

      default:
        return false;
    }
  }

  /**
   * Extract relevant context for specific AI operations
   */
  extractRelevantContext(context: ApplicationContext, operation: string): Record<string, any> {
    const baseContext = {
      elementCount: context.elements.total.length,
      selectedElementCount: context.elements.selected.length,
      currentSection: context.page.section,
      currentMode: context.page.mode
    };

    switch (operation) {
      case "cad_generation":
        return {
          ...baseContext,
          existingTypes: Object.keys(context.elements.types),
          workingMode: context.page.mode,
          recentActions: context.user.recentActions.slice(-5)
        };

      case "design_analysis":
        return {
          ...baseContext,
          elements: context.elements.total,
          boundingBox: context.elements.boundingBox,
          complexity: this.calculateContextComplexity(context)
        };

      case "gcode_operations":
        return {
          ...baseContext,
          gcode: context.gcode,
          hasErrors: context.gcode?.errors.length || 0,
          hasWarnings: context.gcode?.warnings.length || 0
        };

      default:
        return baseContext;
    }
  }
}
