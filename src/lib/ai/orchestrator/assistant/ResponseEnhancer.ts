import { ApplicationContext, IntentAnalysis, OrchestratorResponse } from "../UnifiedAIOrchestrator";
import { promptTemplates } from "../../ai-new/promptTemplates"; // Import prompt templates

export class ResponseEnhancer {
  /**
   * Enhance response with context-aware improvements
   */
  async enhanceResponse(
    response: OrchestratorResponse,
    context: ApplicationContext,
    intent: IntentAnalysis
  ): Promise<OrchestratorResponse> {
    try {
      // 1. Enhance content formatting
      const formattedContent = await this.enhanceContentFormatting(response.content, intent, context);

      // 2. Add contextual metadata
      const enhancedMetadata = this.enhanceMetadata(response.metadata, context, intent);

      // 3. Generate contextual suggestions
      const contextualSuggestions = await this.generateContextualSuggestions(response, context, intent);

      // 4. Add proactive recommendations
      const proactiveRecommendations = await this.generateProactiveRecommendations(context, intent);

      // 5. Enhance artifacts
      const enhancedArtifacts = await this.enhanceArtifacts(response.artifacts || [], context, intent);

      // 6. Add quality indicators
      const qualityIndicators = this.calculateQualityIndicators(response, context, intent);

      return {
        ...response,
        content: formattedContent,
        suggestions: [...(response.suggestions || []), ...contextualSuggestions, ...proactiveRecommendations].slice(
          0,
          5
        ), // Limit to 5 suggestions
        artifacts: enhancedArtifacts,
        metadata: {
          ...enhancedMetadata,
          qualityScore: qualityIndicators.overall,
          relevanceScore: qualityIndicators.relevance,
          usabilityScore: qualityIndicators.usability
        }
      };
    } catch (error) {
      console.error("Error enhancing response:", error);
      return response; // Return original if enhancement fails
    }
  }

  /**
   * Enhance content formatting based on intent and user preferences
   */
  private async enhanceContentFormatting(
    content: string,
    intent: IntentAnalysis,
    context: ApplicationContext
  ): Promise<string> {
    let enhancedContent = content;

    // Add intent-specific formatting
    enhancedContent = this.addIntentBasedFormatting(enhancedContent, intent, context); // Pass context

    // Add skill-level appropriate formatting
    enhancedContent = this.addSkillLevelFormatting(enhancedContent, context.user.skillLevel);

    // Add context-aware enhancements
    enhancedContent = this.addContextualEnhancements(enhancedContent, context, intent);

    // Add interactive elements
    enhancedContent = this.addInteractiveElements(enhancedContent, intent, context);

    return enhancedContent;
  }

  /**
   * Add intent-based formatting
   */
  private addIntentBasedFormatting(content: string, intent: IntentAnalysis, context: ApplicationContext): string {
    const formatters = {
      create: (text: string) => this.formatCreationResponse(text, context),
      modify: (text: string) => this.formatModificationResponse(text),
      analyze: (text: string) => this.formatAnalysisResponse(text, context),
      optimize: (text: string) => this.formatOptimizationResponse(text, context),
      export: (text: string) => this.formatExportResponse(text),
      learn: (text: string) => this.formatEducationalResponse(text),
      chat: (text: string) => this.formatChatResponse(text),
      generate: (text: string) => this.formatCreationResponse(text, context)
    };

    const formatter = formatters[intent.primaryIntent];
    return formatter ? formatter(content) : content;
  }

  /**
   * Format creation responses
   */
  private formatCreationResponse(content: string, context: ApplicationContext): string {
    if (content.includes("##") || content.includes("**")) {
      return content; // Already formatted
    }
    // Use prompt template for richer formatting
    const template = promptTemplates.textToCAD.user
      .replace("{{description}}", "Elements generated from your request")
      .replace(
        "Generate a complete array of CAD elements that form this model. Each element must include all required properties for its type. Format your response ONLY as a valid JSON array without any explanations or commentary.",
        ""
      );

    return `## ✨ Element Creation

${template}

${content}

### 📋 Next Steps
- Review the generated elements
- Adjust properties if needed
- Add more elements to complete your design
- Apply materials and colors`;
  }

  /**
   * Format modification responses
   */
  private formatModificationResponse(content: string): string {
    if (content.includes("##") || content.includes("**")) {
      return content; // Already formatted
    }

    return `## 🔧 Element Modification

${content}

### ✅ Verification
- Check element relationships
- Validate design constraints
- Ensure manufacturing feasibility`;
  }

  /**
   * Format analysis responses
   */
  private formatAnalysisResponse(content: string, context: ApplicationContext): string {
    if (content.includes("##") || content.includes("**")) {
      return content; // Already formatted
    }
    const template = promptTemplates.designAnalysis.user
      .replace("{{elements}}", `Analyzed ${context.elements.total.length} elements`)
      .replace(
        "Provide suggestions in the following categories... Format your response as JSON with an array of suggestions.",
        ""
      );

    return `## 📊 Design Analysis

${template}

${content}

### 💡 Recommendations
Review the analysis results and consider implementing the suggested improvements for optimal design performance.`;
  }

  /**
   * Format optimization responses
   */
  private formatOptimizationResponse(content: string, context: ApplicationContext): string {
    if (content.includes("##") || content.includes("**")) {
      return content; // Already formatted
    }
    let template = "";
    if (context.gcode) {
      template = promptTemplates.gcodeOptimization.user
        .replace("{{machineType}}", "current machine")
        .replace("{{material}}", "current material")
        .replace("{{gcode}}", `Optimized ${context.gcode.lines} lines of G-code`)
        .replace(
          "Consider these specific constraints and goals... Provide the optimized G-code along with specific improvements made and estimated benefits...",
          ""
        );
    } else {
      template = `Optimized ${context.elements.total.length} design elements.`;
    }

    return `## ⚡ Optimization Results

${template}

${content}

### 🎯 Impact Assessment
Compare the optimized version with the original to validate improvements.`;
  }

  /**
   * Format export responses
   */
  private formatExportResponse(content: string): string {
    if (content.includes("##") || content.includes("**")) {
      return content; // Already formatted
    }

    return `## 💾 Export Guidance

${content}

### 🔍 Quality Check
- Verify file integrity
- Check format compatibility
- Validate exported geometry`;
  }

  /**
   * Format educational responses
   */
  private formatEducationalResponse(content: string): string {
    if (content.includes("##") || content.includes("**")) {
      return content; // Already formatted
    }

    return `## 📚 Learning Guide

${content}

### 🚀 Practice Suggestions
Try applying these concepts in your current project to reinforce your understanding.`;
  }

  /**
   * Format chat responses
   */
  private formatChatResponse(content: string): string {
    // Keep chat responses more casual
    return content;
  }

  /**
   * Add skill-level appropriate formatting
   */
  private addSkillLevelFormatting(content: string, skillLevel: ApplicationContext["user"]["skillLevel"]): string {
    switch (skillLevel) {
      case "beginner":
        return this.addBeginnerEnhancements(content);
      case "expert":
        return this.addExpertEnhancements(content);
      default:
        return content;
    }
  }

  /**
   * Add beginner-friendly enhancements
   */
  private addBeginnerEnhancements(content: string): string {
    // Add helpful tips and explanations
    if (!content.includes("💡 **Tip:**")) {
      content +=
        "\n\n💡 **Tip:** Take your time to understand each step. You can always ask for clarification if something is unclear.";
    }

    return content;
  }

  /**
   * Add expert-level enhancements
   */
  private addExpertEnhancements(content: string): string {
    // Add advanced considerations
    if (!content.includes("🔬 **Advanced:**")) {
      content +=
        "\n\n🔬 **Advanced:** Consider performance implications and optimization opportunities for production-scale applications.";
    }

    return content;
  }

  /**
   * Add contextual enhancements
   */
  private addContextualEnhancements(content: string, context: ApplicationContext, intent: IntentAnalysis): string {
    let enhanced = content;

    // Add context-specific information
    if (context.elements.total.length > 0 && intent.contextDependency === "high") {
      enhanced += `\n\n🔗 **Context:** This operation considers your current ${context.elements.total.length} elements and their relationships.`;
    }

    // Add session context
    if (context.session.totalActions > 20) {
      enhanced += `\n\n📈 **Session Progress:** ${context.session.successfulOperations}/${context.session.totalActions} successful operations in this session.`;
    }

    // Add warnings for potential issues
    if (context.gcode && context.gcode.errors.length > 0) {
      enhanced += `\n\n⚠️ **Warning:** Your G-code has ${context.gcode.errors.length} error(s) that should be addressed.`;
    }

    return enhanced;
  }

  /**
   * Add interactive elements
   */
  private addInteractiveElements(content: string, intent: IntentAnalysis, context: ApplicationContext): string {
    let enhanced = content;

    // Add quick action suggestions
    const quickActions = this.getQuickActions(intent, context);
    if (quickActions.length > 0) {
      enhanced += `\n\n### 🚀 Quick Actions\n${quickActions.map(action => `- ${action}`).join("\n")}`;
    }

    return enhanced;
  }

  /**
   * Get quick actions based on context
   */
  private getQuickActions(intent: IntentAnalysis, context: ApplicationContext): string[] {
    const actions: string[] = [];

    switch (intent.primaryIntent) {
      case "create":
        actions.push("Add materials to the new elements");
        actions.push("Create complementary elements");
        if (context.elements.total.length > 5) {
          actions.push("Organize elements into groups");
        }
        break;

      case "analyze":
        actions.push("Apply recommended optimizations");
        actions.push("Export analysis report");
        break;

      case "optimize":
        actions.push("Compare before/after metrics");
        actions.push("Test optimized version");
        break;
    }

    return actions.slice(0, 3);
  }

  /**
   * Enhance response metadata
   */
  private enhanceMetadata(
    metadata: OrchestratorResponse["metadata"],
    context: ApplicationContext,
    intent: IntentAnalysis
  ): OrchestratorResponse["metadata"] {
    return {
      ...metadata,
      enhancementApplied: true,
      userSkillLevel: context.user.skillLevel,
      contextComplexity: this.calculateContextComplexity(context),
      intentConfidence: intent.confidence,
      responseQuality: this.assessResponseQuality(metadata),
      recommendations: this.generateMetadataRecommendations(context, intent)
    };
  }

  /**
   * Generate contextual suggestions
   */
  private async generateContextualSuggestions(
    response: OrchestratorResponse,
    context: ApplicationContext,
    intent: IntentAnalysis
  ): Promise<string[]> {
    const suggestions: string[] = [];

    // Intent-based suggestions
    switch (intent.primaryIntent) {
      case "create":
        if (context.elements.total.length === 1) {
          suggestions.push("Add complementary elements to build your design");
        }
        break;

      case "analyze":
        suggestions.push("Export the analysis results for documentation");
        break;

      case "optimize":
        suggestions.push("Compare performance metrics with the original");
        break;
    }

    // Context-based suggestions
    if (context.page.section === "cad" && context.elements.total.length > 5) {
      suggestions.push("Consider switching to CAM mode for manufacturing preparation");
    }

    if (context.user.preferences.autoSuggestions && suggestions.length < 2) {
      suggestions.push("Enable workflow optimization for better productivity");
    }

    return suggestions.slice(0, 3);
  }

  /**
   * Generate proactive recommendations
   */
  private async generateProactiveRecommendations(
    context: ApplicationContext,
    intent: IntentAnalysis
  ): Promise<string[]> {
    const recommendations: string[] = [];

    // Performance recommendations
    if (context.elements.total.length > 50) {
      recommendations.push("Consider using layers to organize complex designs");
    }

    // Quality recommendations
    const successRate =
      context.session.totalActions > 0 ? context.session.successfulOperations / context.session.totalActions : 1;

    if (successRate < 0.8) {
      recommendations.push("Review recent operations for potential improvements");
    }

    // Workflow recommendations
    if (context.user.workingStyle === "efficiency-focused" && intent.estimatedComplexity === "complex") {
      recommendations.push("Break complex tasks into smaller steps for better efficiency");
    }

    return recommendations.slice(0, 2);
  }

  /**
   * Enhance artifacts with additional metadata
   */
  private async enhanceArtifacts(
    artifacts: NonNullable<OrchestratorResponse["artifacts"]>,
    context: ApplicationContext,
    intent: IntentAnalysis
  ): Promise<OrchestratorResponse["artifacts"]> {
    if (!artifacts || artifacts.length === 0) {
      return artifacts;
    }

    return artifacts.map(artifact => ({
      ...artifact,
      metadata: {
        ...artifact.metadata,
        contextRelevance: this.calculateArtifactRelevance(artifact, context),
        userSkillLevel: context.user.skillLevel,
        timestamp: Date.now(),
        intentType: intent.primaryIntent
      },
      enhancedDescription: this.enhanceArtifactDescription(artifact, context)
    }));
  }

  /**
   * Calculate quality indicators
   */
  private calculateQualityIndicators(
    response: OrchestratorResponse,
    context: ApplicationContext,
    intent: IntentAnalysis
  ): { overall: number; relevance: number; usability: number } {
    // Overall quality based on various factors
    let overall = response.metadata.confidenceScore;

    // Adjust for context relevance
    if (intent.contextDependency === "high" && context.elements.total.length > 0) {
      overall *= 1.1;
    }

    // Adjust for completeness
    if (response.artifacts && response.artifacts.length > 0) {
      overall *= 1.05;
    }

    if (response.suggestions && response.suggestions.length > 0) {
      overall *= 1.05;
    }

    // Relevance score
    const relevance = Math.min(1, response.metadata.contextRelevance * intent.confidence);

    // Usability score based on user context
    let usability = 0.8; // Base usability

    if (context.user.skillLevel === "beginner" && response.content.includes("step")) {
      usability += 0.1;
    }

    if (context.user.preferences.responseStyle === "detailed" && response.content.length > 200) {
      usability += 0.1;
    }

    return {
      overall: Math.min(1, overall),
      relevance: Math.min(1, relevance),
      usability: Math.min(1, usability)
    };
  }

  /**
   * Calculate context complexity
   */
  private calculateContextComplexity(context: ApplicationContext): number {
    let complexity = 0;

    // Element complexity
    complexity += Math.min(context.elements.total.length / 50, 0.4);

    // Type variety
    complexity += Math.min(Object.keys(context.elements.types).length / 10, 0.3);

    // G-code complexity
    if (context.gcode) {
      complexity += Math.min(context.gcode.lines / 1000, 0.2);
    }

    // Session complexity
    complexity += Math.min(context.session.totalActions / 100, 0.1);

    return Math.min(1, complexity);
  }

  /**
   * Assess response quality
   */
  private assessResponseQuality(metadata: OrchestratorResponse["metadata"]): number {
    let quality = metadata.confidenceScore;

    // Adjust for processing time (faster is often better for user experience)
    if (metadata.processingTimeMs < 5000) {
      quality += 0.05;
    } else if (metadata.processingTimeMs > 15000) {
      quality -= 0.05;
    }

    // Adjust for service reliability
    if (!metadata.fallbackUsed) {
      quality += 0.05;
    }

    return Math.max(0, Math.min(1, quality));
  }

  /**
   * Generate metadata recommendations
   */
  private generateMetadataRecommendations(context: ApplicationContext, intent: IntentAnalysis): string[] {
    const recommendations: string[] = [];

    if (intent.confidence < 0.7) {
      recommendations.push("Consider rephrasing your request for better accuracy");
    }

    if (context.user.skillLevel === "beginner" && intent.estimatedComplexity === "complex") {
      recommendations.push("Break down complex operations into simpler steps");
    }

    return recommendations;
  }

  /**
   * Calculate artifact relevance to context
   */
  private calculateArtifactRelevance(
    artifact: NonNullable<OrchestratorResponse["artifacts"]>[0],
    context: ApplicationContext
  ): number {
    let relevance = 0.5; // Base relevance

    // Type-based relevance
    if (artifact.type === "elements" && context.page.section === "cad") {
      relevance += 0.3;
    }

    if (artifact.type === "gcode" && context.page.section === "cam") {
      relevance += 0.3;
    }

    if (artifact.type === "analysis" && context.elements.total.length > 0) {
      relevance += 0.2;
    }

    return Math.min(1, relevance);
  }

  /**
   * Enhance artifact description
   */
  private enhanceArtifactDescription(
    artifact: NonNullable<OrchestratorResponse["artifacts"]>[0],
    context: ApplicationContext
  ): string {
    let enhanced = artifact.description;

    // Add context-specific information
    if (artifact.type === "elements" && context.elements.total.length > 0) {
      enhanced += ` (Compatible with your current ${context.elements.total.length} elements)`;
    }

    // Add usage hints
    if (context.user.skillLevel === "beginner") {
      enhanced += " - Click to apply to your design";
    }

    return enhanced;
  }
}
