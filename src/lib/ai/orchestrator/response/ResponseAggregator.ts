import { ApplicationContext, IntentAnalysis, OrchestratorResponse, ResponseArtifact } from "../UnifiedAIOrchestrator";
import { Element } from "@/src/store/elementsStore";

export class ResponseAggregator {
  /**
   * Enhance and aggregate responses from AI services
   */
  async enhanceResponse(
    response: OrchestratorResponse,
    context: ApplicationContext,
    intent: IntentAnalysis
  ): Promise<OrchestratorResponse> {
    try {
      // 1. Format and enhance content
      const enhancedContent = await this.enhanceContent(response.content, intent, context);

      // 2. Generate additional artifacts if needed
      const additionalArtifacts = await this.generateAdditionalArtifacts(response, intent, context);

      // 3. Generate contextual suggestions
      const contextualSuggestions = await this.generateContextualSuggestions(response, intent, context);

      // 4. Calculate enhanced metadata
      const enhancedMetadata = this.enhanceMetadata(response.metadata, intent, context);

      return {
        ...response,
        content: enhancedContent,
        artifacts: [...(response.artifacts || []), ...additionalArtifacts],
        suggestions: [...(response.suggestions || []), ...contextualSuggestions],
        metadata: enhancedMetadata
      };
    } catch (error) {
      console.error("Response enhancement error:", error);
      return response; // Return original response if enhancement fails
    }
  }

  /**
   * Enhance response content with formatting and context
   */
  private async enhanceContent(content: string, intent: IntentAnalysis, context: ApplicationContext): Promise<string> {
    let enhancedContent = content;

    // Add context-aware introduction if needed
    if (intent.contextDependency === "high" || intent.contextDependency === "critical") {
      enhancedContent = this.addContextualIntroduction(enhancedContent, intent, context);
    }

    // Format based on intent type
    enhancedContent = this.formatContentByIntent(enhancedContent, intent);

    // Add helpful tips or next steps
    enhancedContent = this.addNextSteps(enhancedContent, intent, context);

    return enhancedContent;
  }

  /**
   * Add contextual introduction to response
   */
  private addContextualIntroduction(content: string, intent: IntentAnalysis, context: ApplicationContext): string {
    const introductions = {
      create: "Based on your request, I've created the following: ",
      modify: "Here are the modifications as per your request: ",
      analyze: "Here's the analysis of your design/request: ",
      optimize: "I've optimized the design/G-code as follows: ",
      export: "The content is ready for export: ",
      learn: "Here's some information to help you: ",
      chat: "", // No specific intro for chat, direct response is fine
      generate: "Here's the generated content based on your request: " // Added generate intent
    };

    const intro = introductions[intent.primaryIntent] || "";
    return intro + content;
  }

  /**
   * Format content based on intent type
   */
  private formatContentByIntent(content: string, intent: IntentAnalysis): string {
    switch (intent.primaryIntent) {
      case "create":
        return this.formatCreationResponse(content);
      case "analyze":
        return this.formatAnalysisResponse(content);
      case "optimize":
        return this.formatOptimizationResponse(content);
      default:
        return content;
    }
  }

  /**
   * Format creation response with structure
   */
  private formatCreationResponse(content: string): string {
    // If content doesn't already have structure, add it
    if (!content.includes("##") && !content.includes("**")) {
      return `## ✨ Created Elements\n\n${content}\n\n### 📝 Notes\nElements have been generated based on your description. You can modify them further or add more elements to complete your design.`;
    }
    return content;
  }

  /**
   * Format analysis response with structure
   */
  private formatAnalysisResponse(content: string): string {
    if (!content.includes("##") && !content.includes("**")) {
      return `## 📊 Design Analysis\n\n${content}\n\n### 💡 Recommendations\nConsider applying the suggested improvements to enhance your design.`;
    }
    return content;
  }

  /**
   * Format optimization response with structure
   */
  private formatOptimizationResponse(content: string): string {
    if (!content.includes("##") && !content.includes("**")) {
      return `## ⚡ Optimization Results\n\n${content}\n\n### 🎯 Next Steps\nReview the optimizations and apply them to improve performance.`;
    }
    return content;
  }

  /**
   * Add helpful next steps to response
   */
  private addNextSteps(content: string, intent: IntentAnalysis, context: ApplicationContext): string {
    const nextSteps = this.generateNextSteps(intent, context);

    if (nextSteps.length > 0 && !content.includes("Next") && !content.includes("Prossimi")) {
      const stepsText = nextSteps.map(step => `• ${step}`).join("\n");
      content += `\n\n### 🚀 Suggested Next Steps\n${stepsText}`;
    }

    return content;
  }

  /**
   * Generate additional artifacts based on response and intent
   */
  private async generateAdditionalArtifacts(
    response: OrchestratorResponse,
    intent: IntentAnalysis,
    context: ApplicationContext
  ): Promise<ResponseArtifact[]> {
    const artifacts: ResponseArtifact[] = [];

    // Generate preview artifact for element creation
    if (intent.primaryIntent === "create" && response.success) {
      artifacts.push({
        id: `preview_${Date.now()}`,
        type: "preview",
        content: {
          elementCount: this.extractElementCount(response.content),
          previewType: "creation"
        },
        title: "3D Preview",
        description: "Preview of created elements"
      });
    }

    // Generate analysis artifact for analyze intent
    if (intent.primaryIntent === "analyze" && response.success) {
      artifacts.push({
        id: `analysis_${Date.now()}`,
        type: "analysis",
        content: {
          elementCount: context.elements.total.length,
          complexity: this.calculateComplexityScore(context),
          recommendations: this.extractRecommendations(response.content)
        },
        title: "Design Analysis Report",
        description: "Comprehensive analysis of your design"
      });
    }

    // Generate documentation artifact for complex operations
    if (intent.estimatedComplexity === "complex") {
      artifacts.push({
        id: `docs_${Date.now()}`,
        type: "documentation",
        content: {
          operation: intent.primaryIntent,
          complexity: intent.estimatedComplexity,
          documentation: this.generateOperationDocumentation(intent, context)
        },
        title: "Operation Documentation",
        description: "Detailed documentation for this operation"
      });
    }

    return artifacts;
  }

  /**
   * Generate contextual suggestions based on response and context
   */
  private async generateContextualSuggestions(
    response: OrchestratorResponse,
    intent: IntentAnalysis,
    context: ApplicationContext
  ): Promise<string[]> {
    const suggestions: string[] = [];

    // Intent-based suggestions
    switch (intent.primaryIntent) {
      case "create":
        suggestions.push(...this.getCreationSuggestions(context));
        break;
      case "modify":
        suggestions.push(...this.getModificationSuggestions(context));
        break;
      case "analyze":
        suggestions.push(...this.getAnalysisSuggestions(context));
        break;
      case "optimize":
        suggestions.push(...this.getOptimizationSuggestions(context));
        break;
    }

    // Context-based suggestions
    if (context.elements.total.length === 0) {
      suggestions.push("Start creating your first CAD element");
    } else if (context.elements.total.length > 20) {
      suggestions.push("Consider organizing elements into groups");
    }

    if (context.page.section === "cad" && context.elements.total.length > 5) {
      suggestions.push("Ready to generate G-code for manufacturing?");
    }

    return suggestions.slice(0, 3); // Limit to 3 suggestions
  }

  /**
   * Get creation-specific suggestions
   */
  private getCreationSuggestions(context: ApplicationContext): string[] {
    const suggestions = [];

    if (context.elements.total.length === 1) {
      suggestions.push("Add complementary elements to build your design");
    }

    if (context.elements.total.length > 0 && context.elements.selected.length === 0) {
      suggestions.push("Select elements to modify or group them");
    }

    suggestions.push("Use constraints and dimensions for precise modeling");

    return suggestions;
  }

  /**
   * Get modification-specific suggestions
   */
  private getModificationSuggestions(context: ApplicationContext): string[] {
    const suggestions = [];

    if (context.elements.selected.length > 1) {
      suggestions.push("Apply the same modification to all selected elements");
    }

    suggestions.push("Check element relationships after modification");
    suggestions.push("Validate design constraints are still met");

    return suggestions;
  }

  /**
   * Get analysis-specific suggestions
   */
  private getAnalysisSuggestions(context: ApplicationContext): string[] {
    const suggestions = [];

    suggestions.push("Apply recommended optimizations");
    suggestions.push("Run manufacturing feasibility check");

    if (Object.keys(context.elements.types).length > 3) {
      suggestions.push("Consider simplifying the design");
    }

    return suggestions;
  }

  /**
   * Get optimization-specific suggestions
   */
  private getOptimizationSuggestions(context: ApplicationContext): string[] {
    const suggestions = [];

    suggestions.push("Test the optimized version");
    suggestions.push("Compare performance metrics");

    if (context.gcode) {
      suggestions.push("Simulate the toolpath before machining");
    }

    return suggestions;
  }

  /**
   * Enhance response metadata
   */
  private enhanceMetadata(
    metadata: OrchestratorResponse["metadata"],
    intent: IntentAnalysis,
    context: ApplicationContext
  ): OrchestratorResponse["metadata"] {
    return {
      ...metadata,
      contextRelevance: this.calculateContextRelevance(intent, context),
      userExperience: this.calculateUserExperience(intent, context),
      actionableItems: this.countActionableItems(intent, context)
    };
  }

  /**
   * Calculate context relevance score
   */
  private calculateContextRelevance(intent: IntentAnalysis, context: ApplicationContext): number {
    let relevance = intent.confidence;

    // Boost for context-dependent operations
    if (intent.contextDependency === "critical") relevance += 0.2;
    if (intent.contextDependency === "high") relevance += 0.1;

    // Boost for well-matched context
    if (intent.primaryIntent === "modify" && context.elements.selected.length > 0) relevance += 0.1;
    if (intent.primaryIntent === "analyze" && context.elements.total.length > 0) relevance += 0.1;

    return Math.min(1, relevance);
  }

  /**
   * Calculate user experience score
   */
  private calculateUserExperience(intent: IntentAnalysis, context: ApplicationContext): number {
    let score = 0.7; // Base score

    // Positive factors
    if (context.session.successfulOperations > 0) score += 0.1;
    if (intent.confidence > 0.8) score += 0.1;
    if (intent.estimatedComplexity === "simple") score += 0.1;

    return Math.min(1, score);
  }

  /**
   * Count actionable items in the response
   */
  private countActionableItems(intent: IntentAnalysis, context: ApplicationContext): number {
    return intent.suggestedActions.length + (intent.targetElements?.length || 0);
  }

  /**
   * Generate next steps based on intent and context
   */
  private generateNextSteps(intent: IntentAnalysis, context: ApplicationContext): string[] {
    const steps: string[] = [];

    switch (intent.primaryIntent) {
      case "create":
        if (context.elements.total.length < 5) {
          steps.push("Add more elements to complete your design");
        }
        steps.push("Apply materials and colors to elements");
        break;

      case "modify":
        steps.push("Review the changes and adjust if needed");
        steps.push("Check for design constraints violations");
        break;

      case "analyze":
        steps.push("Apply recommended improvements");
        steps.push("Re-analyze after making changes");
        break;

      case "optimize":
        steps.push("Test the optimized version");
        steps.push("Compare before and after metrics");
        break;

      case "export":
        steps.push("Choose your preferred export format");
        steps.push("Verify exported file integrity");
        break;
    }

    return steps;
  }

  /**
   * Helper methods for artifact generation
   */
  private extractElementCount(content: string): number {
    const match = content.match(/(\d+)\s+elements?/i);
    return match ? parseInt(match[1]) : 0;
  }

  private calculateComplexityScore(context: ApplicationContext): number {
    const elementCount = context.elements.total.length;
    const typeVariety = Object.keys(context.elements.types).length;
    return Math.min(1, elementCount * 0.02 + typeVariety * 0.1);
  }

  private extractRecommendations(content: string): string[] {
    const recommendations: string[] = [];
    const lines = content.split("\n");

    for (const line of lines) {
      if (line.includes("recommend") || line.includes("suggest") || line.includes("•")) {
        recommendations.push(line.trim());
      }
    }

    return recommendations.slice(0, 5); // Limit to 5 recommendations
  }

  private generateOperationDocumentation(intent: IntentAnalysis, context: ApplicationContext): string {
    return `
## Operation: ${intent.primaryIntent}
- **Complexity**: ${intent.estimatedComplexity}
- **Estimated Time**: ${intent.timeToComplete} seconds
- **Context Dependency**: ${intent.contextDependency}
- **Elements Involved**: ${context.elements.total.length}
- **Services Used**: ${intent.requiredServices.join(", ")}

### Notes
This operation was performed with ${intent.confidence * 100}% confidence based on the current context.
    `.trim();
  }
}
