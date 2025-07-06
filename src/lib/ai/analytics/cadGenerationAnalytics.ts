/**
 * CAD Generation Analytics Engine for Quality Monitoring and Improvement
 *
 * This module provides comprehensive analytics capabilities for CAD generation,
 * including quality scoring, performance monitoring, user behavior analysis,
 * and continuous improvement recommendations based on engineering metrics.
 *
 * @module CADGenerationAnalytics
 * @version 2.0.0
 */

import { Element } from "@/src/store/elementsStore";
import { EnhancedElement, ValidationResult } from "../parsers/advancedCADParser";
import { AssemblyPlan } from "../assembly/assemblyEngine";
import { EngineeringContext } from "../context/contextEngine";

/**
 * Generation metrics with comprehensive quality assessment
 */
export interface GenerationMetrics {
  sessionId: string;
  timestamp: number;
  inputDescription: string;
  inputComplexity: ComplexityMetrics;
  outputElementCount: number;
  outputQuality: QualityMetrics;
  processingTime: number;
  modelUsed: string;
  validationResults: ValidationResult[];
  engineeringCompliance: ComplianceMetrics;
  userFeedback?: GenerationFeedback;
  qualityScore: number;
  improvementSuggestions: string[];
  costEstimate?: CostMetrics;
  manufacturabilityScore: number;
  designEfficiency: EfficiencyMetrics;
  contextUtilization: ContextMetrics;
}

/**
 * Input complexity analysis
 */
export interface ComplexityMetrics {
  textLength: number;
  technicalTerms: number;
  constraintCount: number;
  domainSpecificity: number; // 0-1 scale
  ambiguityLevel: number; // 0-1 scale
  engineeringDetail: number; // 0-1 scale
}

/**
 * Output quality assessment
 */
export interface QualityMetrics {
  geometricAccuracy: number; // 0-1 scale
  engineeringValidity: number; // 0-1 scale
  manufacturabilityScore: number; // 0-1 scale
  standardsCompliance: number; // 0-1 scale
  designCoherence: number; // 0-1 scale
  materialAppropriateness: number; // 0-1 scale
  toleranceConsistency: number; // 0-1 scale
  assemblyFeasibility: number; // 0-1 scale
}

/**
 * Engineering compliance assessment
 */
export interface ComplianceMetrics {
  standardsCompliance: number; // 0-1 scale
  manufacturingFeasibility: number; // 0-1 scale
  geometricAccuracy: number; // 0-1 scale
  materialAppropriateness: number; // 0-1 scale
  dimensionalConsistency: number; // 0-1 scale
  safetyCompliance: number; // 0-1 scale
  environmentalCompliance: number; // 0-1 scale
  costEffectiveness: number; // 0-1 scale
}

/**
 * User feedback structure
 */
export interface GenerationFeedback {
  overallRating: number; // 1-5 scale
  accuracyRating: number; // 1-5 scale
  usabilityRating: number; // 1-5 scale
  timeRating: number; // 1-5 scale
  comments: string;
  wouldRecommend: boolean;
  improvementAreas: string[];
  timestamp: number;
}

/**
 * Cost analysis metrics
 */
export interface CostMetrics {
  materialCost: number;
  manufacturingCost: number;
  toolingCost: number;
  laborCost: number;
  totalCost: number;
  currency: string;
  costPerElement: number;
  costEfficiencyRating: number; // 0-1 scale
}

/**
 * Design efficiency metrics
 */
export interface EfficiencyMetrics {
  materialUtilization: number; // 0-1 scale
  geometricOptimization: number; // 0-1 scale
  manufacturingEfficiency: number; // 0-1 scale
  assemblyEfficiency: number; // 0-1 scale
  overallEfficiency: number; // 0-1 scale
}

/**
 * Context utilization metrics
 */
export interface ContextMetrics {
  contextRecognition: number; // 0-1 scale
  domainKnowledgeApplication: number; // 0-1 scale
  constraintAdherence: number; // 0-1 scale
  standardsIntegration: number; // 0-1 scale
  contextEffectiveness: number; // 0-1 scale
}

/**
 * Performance trend analysis
 */
export interface PerformanceTrend {
  period: string;
  averageQualityScore: number;
  averageProcessingTime: number;
  successRate: number;
  userSatisfaction: number;
  improvementRate: number;
  topIssues: IssueFrequency[];
  recommendations: string[];
}

/**
 * Issue frequency tracking
 */
export interface IssueFrequency {
  issueType: string;
  frequency: number;
  severity: "low" | "medium" | "high" | "critical";
  trend: "increasing" | "stable" | "decreasing";
  resolution: string;
}

/**
 * User behavior analytics
 */
export interface UserBehaviorMetrics {
  userId: string;
  sessionCount: number;
  averageSessionDuration: number;
  preferredComplexity: string;
  commonDomains: string[];
  improvementRate: number;
  feedbackEngagement: number;
  expertiseLevel: "beginner" | "intermediate" | "advanced" | "expert";
}

/**
 * System performance metrics
 */
export interface SystemPerformanceMetrics {
  uptime: number; // percentage
  averageResponseTime: number; // milliseconds
  throughput: number; // requests per hour
  errorRate: number; // percentage
  resourceUtilization: ResourceUtilization;
  scalabilityMetrics: ScalabilityMetrics;
}

/**
 * Resource utilization tracking
 */
export interface ResourceUtilization {
  cpu: number; // percentage
  memory: number; // percentage
  storage: number; // percentage
  bandwidth: number; // Mbps
  aiModelLoad: number; // percentage
}

/**
 * Scalability metrics
 */
export interface ScalabilityMetrics {
  concurrentUsers: number;
  peakLoad: number;
  loadBalancing: number; // efficiency 0-1
  autoscaling: boolean;
  performanceImpact: number; // percentage
}

/**
 * Advanced CAD Generation Analytics Engine
 */
export class CADGenerationAnalytics {
  private static metrics: GenerationMetrics[] = [];
  private static userBehavior: Map<string, UserBehaviorMetrics> = new Map();
  private static performanceHistory: PerformanceTrend[] = [];
  private static systemMetrics: SystemPerformanceMetrics | null = null;

  /**
   * Tracks a complete CAD generation session with comprehensive analysis
   *
   * @param sessionId - Unique session identifier
   * @param inputDescription - User's input description
   * @param outputElements - Generated CAD elements
   * @param processingTime - Total processing time in milliseconds
   * @param modelUsed - AI model used for generation
   * @param validationResults - Validation results from quality checks
   * @param engineeringContext - Engineering context used
   * @param assemblyPlan - Generated assembly plan (if applicable)
   */
  static trackGeneration(
    sessionId: string,
    inputDescription: string,
    outputElements: EnhancedElement[],
    processingTime: number,
    modelUsed: string,
    validationResults: ValidationResult[],
    engineeringContext?: EngineeringContext,
    assemblyPlan?: AssemblyPlan
  ): void {
    console.log(`📊 Tracking generation analytics for session ${sessionId}`);

    const inputComplexity = this.analyzeInputComplexity(inputDescription, engineeringContext);
    const outputQuality = this.assessOutputQuality(outputElements, validationResults, assemblyPlan);
    const complianceMetrics = this.calculateComplianceMetrics(outputElements, validationResults, engineeringContext);
    const qualityScore = this.calculateOverallQualityScore(outputQuality, complianceMetrics);
    const manufacturabilityScore = this.assessManufacturability(outputElements, validationResults);
    const designEfficiency = this.calculateDesignEfficiency(outputElements, engineeringContext);
    const contextUtilization = this.assessContextUtilization(inputDescription, outputElements, engineeringContext);
    const improvementSuggestions = this.generateImprovementSuggestions(
      outputElements,
      validationResults,
      outputQuality,
      complianceMetrics
    );

    const metrics: GenerationMetrics = {
      sessionId,
      timestamp: Date.now(),
      inputDescription,
      inputComplexity,
      outputElementCount: outputElements.length,
      outputQuality,
      processingTime,
      modelUsed,
      validationResults,
      engineeringCompliance: complianceMetrics,
      qualityScore,
      improvementSuggestions,
      manufacturabilityScore,
      designEfficiency,
      contextUtilization,
      costEstimate: this.estimateGenerationCost(outputElements, assemblyPlan)
    };

    this.metrics.push(metrics);
    this.saveMetrics(metrics);
    this.updatePerformanceTrends();

    console.log(
      `✅ Analytics tracked - Quality Score: ${qualityScore.toFixed(2)}, Manufacturability: ${manufacturabilityScore.toFixed(2)}`
    );
  }

  /**
   * Analyzes input description complexity
   */
  private static analyzeInputComplexity(description: string, context?: EngineeringContext): ComplexityMetrics {
    const textLength = description.length;

    // Technical terms detection
    const technicalTerms = this.countTechnicalTerms(description);

    // Constraint analysis
    const constraintCount = this.countConstraints(description);

    // Domain specificity (0-1 scale)
    const domainSpecificity = this.assessDomainSpecificity(description, context);

    // Ambiguity level (0-1 scale, higher = more ambiguous)
    const ambiguityLevel = this.assessAmbiguity(description);

    // Engineering detail level (0-1 scale)
    const engineeringDetail = this.assessEngineeringDetail(description, context);

    return {
      textLength,
      technicalTerms,
      constraintCount,
      domainSpecificity,
      ambiguityLevel,
      engineeringDetail
    };
  }

  /**
   * Assesses output quality across multiple dimensions
   */
  private static assessOutputQuality(
    elements: EnhancedElement[],
    validationResults: ValidationResult[],
    assemblyPlan?: AssemblyPlan
  ): QualityMetrics {
    const geometricAccuracy = this.assessGeometricAccuracy(elements, validationResults);
    const engineeringValidity = this.assessEngineeringValidity(elements, validationResults);
    const manufacturabilityScore = this.assessManufacturability(elements, validationResults);
    const standardsCompliance = this.assessStandardsCompliance(elements, validationResults);
    const designCoherence = this.assessDesignCoherence(elements);
    const materialAppropriateness = this.assessMaterialAppropriateness(elements);
    const toleranceConsistency = this.assessToleranceConsistency(elements);
    const assemblyFeasibility = this.assessAssemblyFeasibility(elements, assemblyPlan);

    return {
      geometricAccuracy,
      engineeringValidity,
      manufacturabilityScore,
      standardsCompliance,
      designCoherence,
      materialAppropriateness,
      toleranceConsistency,
      assemblyFeasibility
    };
  }

  /**
   * Calculates comprehensive compliance metrics
   */
  private static calculateComplianceMetrics(
    elements: EnhancedElement[],
    validationResults: ValidationResult[],
    context?: EngineeringContext
  ): ComplianceMetrics {
    const totalElements = elements.length;

    // Standards compliance
    const elementsWithStandards = elements.filter(
      e =>
        e.engineeringProperties?.standardReferences?.length && e.engineeringProperties?.standardReferences?.length > 0
    ).length;
    const standardsCompliance = totalElements > 0 ? elementsWithStandards / totalElements : 0;

    // Manufacturing feasibility
    const manufacturingErrors = validationResults.filter(
      r => r.type === "manufacturing_error" && r.severity === "critical"
    ).length;
    const manufacturingFeasibility = Math.max(0, 1 - manufacturingErrors / Math.max(totalElements, 1));

    // Geometric accuracy
    const geometricErrors = validationResults.filter(r => r.type === "geometry_error").length;
    const geometricAccuracy = Math.max(0, 1 - geometricErrors / Math.max(totalElements, 1));

    // Material appropriateness
    const elementsWithMaterials = elements.filter(
      e => e.material && e.engineeringProperties?.materialProperties
    ).length;
    const materialAppropriateness = totalElements > 0 ? elementsWithMaterials / totalElements : 0;

    // Dimensional consistency
    const elementsWithTolerances = elements.filter(e => e.engineeringProperties?.tolerance).length;
    const dimensionalConsistency = totalElements > 0 ? elementsWithTolerances / totalElements : 0;

    // Safety compliance
    const safetyIssues = validationResults.filter(r => r.type.includes("safety") || r.severity === "critical").length;
    const safetyCompliance = Math.max(0, 1 - safetyIssues / Math.max(totalElements, 1));

    // Environmental compliance
    const environmentalCompliance = this.assessEnvironmentalCompliance(elements, context);

    // Cost effectiveness
    const costEffectiveness = this.assessCostEffectiveness(elements);

    return {
      standardsCompliance,
      manufacturingFeasibility,
      geometricAccuracy,
      materialAppropriateness,
      dimensionalConsistency,
      safetyCompliance,
      environmentalCompliance,
      costEffectiveness
    };
  }

  /**
   * Calculates overall quality score with weighted factors
   */
  private static calculateOverallQualityScore(quality: QualityMetrics, compliance: ComplianceMetrics): number {
    const weights = {
      // Quality metrics weights
      geometricAccuracy: 0.15,
      engineeringValidity: 0.2,
      manufacturabilityScore: 0.15,
      standardsCompliance: 0.1,
      designCoherence: 0.1,
      materialAppropriateness: 0.1,
      toleranceConsistency: 0.1,
      assemblyFeasibility: 0.1
    };

    const qualityScore =
      quality.geometricAccuracy * weights.geometricAccuracy +
      quality.engineeringValidity * weights.engineeringValidity +
      quality.manufacturabilityScore * weights.manufacturabilityScore +
      quality.standardsCompliance * weights.standardsCompliance +
      quality.designCoherence * weights.designCoherence +
      quality.materialAppropriateness * weights.materialAppropriateness +
      quality.toleranceConsistency * weights.toleranceConsistency +
      quality.assemblyFeasibility * weights.assemblyFeasibility;

    // Apply compliance adjustments
    const complianceAverage =
      (compliance.standardsCompliance +
        compliance.manufacturingFeasibility +
        compliance.geometricAccuracy +
        compliance.materialAppropriateness +
        compliance.dimensionalConsistency +
        compliance.safetyCompliance +
        compliance.environmentalCompliance +
        compliance.costEffectiveness) /
      8;

    // Final score is weighted average of quality and compliance
    return qualityScore * 0.7 + complianceAverage * 0.3;
  }

  /**
   * Generates actionable improvement suggestions
   */
  private static generateImprovementSuggestions(
    elements: EnhancedElement[],
    validationResults: ValidationResult[],
    quality: QualityMetrics,
    compliance: ComplianceMetrics
  ): string[] {
    const suggestions: string[] = [];

    // Quality-based suggestions
    if (quality.geometricAccuracy < 0.8) {
      suggestions.push("Improve geometric precision by using standard dimensions and better tolerance specifications");
    }

    if (quality.manufacturabilityScore < 0.7) {
      suggestions.push("Enhance manufacturability by considering production constraints and process capabilities");
    }

    if (quality.standardsCompliance < 0.6) {
      suggestions.push(
        "Increase standards compliance by referencing appropriate engineering standards (ISO, DIN, ANSI)"
      );
    }

    if (quality.designCoherence < 0.7) {
      suggestions.push(
        "Improve design coherence by ensuring consistent material selection and dimensional relationships"
      );
    }

    // Compliance-based suggestions
    if (compliance.materialAppropriateness < 0.6) {
      suggestions.push("Select materials more appropriate for the intended application and environmental conditions");
    }

    if (compliance.safetyCompliance < 0.8) {
      suggestions.push("Address safety concerns by incorporating appropriate safety factors and design margins");
    }

    if (compliance.costEffectiveness < 0.6) {
      suggestions.push(
        "Optimize design for cost effectiveness by considering material costs and manufacturing complexity"
      );
    }

    // Validation-based suggestions
    const criticalIssues = validationResults.filter(r => r.severity === "critical").length;
    if (criticalIssues > 0) {
      suggestions.push(`Resolve ${criticalIssues} critical validation issues before proceeding to manufacturing`);
    }

    // Element-specific suggestions
    const elementsWithoutEngProps = elements.filter(e => !e.engineeringProperties).length;
    if (elementsWithoutEngProps > 0) {
      suggestions.push("Add complete engineering properties to all elements for better quality assessment");
    }

    return suggestions.slice(0, 5); // Limit to top 5 suggestions
  }

  /**
   * Estimates cost metrics for generation
   */
  private static estimateGenerationCost(elements: EnhancedElement[], assemblyPlan?: AssemblyPlan): CostMetrics {
    let materialCost = 0;
    let manufacturingCost = 0;
    let toolingCost = 0;
    let laborCost = 0;

    // Material cost estimation
    elements.forEach(element => {
      const volume = this.calculateElementVolume(element);
      const density = element.engineeringProperties?.materialProperties?.density || 7850; // kg/m³
      const mass = (volume * density) / 1e9; // Convert mm³ to m³ then to kg
      const materialRate = this.getMaterialCostRate(element.engineeringProperties?.material || "steel");
      materialCost += mass * materialRate;
    });

    // Manufacturing cost estimation
    elements.forEach(element => {
      const processes = element.engineeringProperties?.manufacturingProcess || ["machining"];
      processes.forEach(process => {
        manufacturingCost += this.getProcessCost(process, element);
      });
    });

    // Assembly cost from assembly plan
    if (assemblyPlan) {
      laborCost = assemblyPlan.timeEstimate.laborCost;
      toolingCost = assemblyPlan.costEstimate.tooling;
    }

    const totalCost = materialCost + manufacturingCost + toolingCost + laborCost;
    const costPerElement = elements.length > 0 ? totalCost / elements.length : 0;
    const costEfficiencyRating = this.calculateCostEfficiency(totalCost, elements.length);

    return {
      materialCost,
      manufacturingCost,
      toolingCost,
      laborCost,
      totalCost,
      currency: "USD",
      costPerElement,
      costEfficiencyRating
    };
  }

  /**
   * Calculates design efficiency metrics
   */
  private static calculateDesignEfficiency(
    elements: EnhancedElement[],
    context?: EngineeringContext
  ): EfficiencyMetrics {
    const materialUtilization = this.calculateMaterialUtilization(elements);
    const geometricOptimization = this.assessGeometricOptimization(elements);
    const manufacturingEfficiency = this.assessManufacturingEfficiency(elements);
    const assemblyEfficiency = this.assessAssemblyEfficiency(elements);

    const overallEfficiency =
      (materialUtilization + geometricOptimization + manufacturingEfficiency + assemblyEfficiency) / 4;

    return {
      materialUtilization,
      geometricOptimization,
      manufacturingEfficiency,
      assemblyEfficiency,
      overallEfficiency
    };
  }

  /**
   * Assesses context utilization effectiveness
   */
  private static assessContextUtilization(
    inputDescription: string,
    elements: EnhancedElement[],
    context?: EngineeringContext
  ): ContextMetrics {
    if (!context) {
      return {
        contextRecognition: 0,
        domainKnowledgeApplication: 0,
        constraintAdherence: 0,
        standardsIntegration: 0,
        contextEffectiveness: 0
      };
    }

    const contextRecognition = this.assessContextRecognition(inputDescription, context);
    const domainKnowledgeApplication = this.assessDomainKnowledgeApplication(elements, context);
    const constraintAdherence = this.assessConstraintAdherence(elements, context);
    const standardsIntegration = this.assessStandardsIntegration(elements, context);

    const contextEffectiveness =
      (contextRecognition + domainKnowledgeApplication + constraintAdherence + standardsIntegration) / 4;

    return {
      contextRecognition,
      domainKnowledgeApplication,
      constraintAdherence,
      standardsIntegration,
      contextEffectiveness
    };
  }

  /**
   * Records user feedback for continuous improvement
   */
  static recordUserFeedback(sessionId: string, feedback: GenerationFeedback): void {
    const metrics = this.metrics.find(m => m.sessionId === sessionId);
    if (metrics) {
      metrics.userFeedback = feedback;
      this.updatePerformanceTrends();
      console.log(`📝 User feedback recorded for session ${sessionId}: ${feedback.overallRating}/5 stars`);
    }
  }

  /**
   * Tracks user behavior patterns
   */
  static trackUserBehavior(
    userId: string,
    sessionData: {
      sessionDuration: number;
      complexity: string;
      domain: string;
      success: boolean;
    }
  ): void {
    let userMetrics = this.userBehavior.get(userId);

    if (!userMetrics) {
      userMetrics = {
        userId,
        sessionCount: 0,
        averageSessionDuration: 0,
        preferredComplexity: sessionData.complexity,
        commonDomains: [],
        improvementRate: 0,
        feedbackEngagement: 0,
        expertiseLevel: "beginner"
      };
    }

    // Update metrics
    userMetrics.sessionCount++;
    userMetrics.averageSessionDuration =
      (userMetrics.averageSessionDuration * (userMetrics.sessionCount - 1) + sessionData.sessionDuration) /
      userMetrics.sessionCount;

    // Update domain preferences
    if (!userMetrics.commonDomains.includes(sessionData.domain)) {
      userMetrics.commonDomains.push(sessionData.domain);
    }

    // Update expertise level based on usage patterns
    userMetrics.expertiseLevel = this.determineExpertiseLevel(userMetrics);

    this.userBehavior.set(userId, userMetrics);
  }

  /**
   * Gets comprehensive generation statistics
   */
  static getGenerationStatistics(): {
    totalGenerations: number;
    averageQualityScore: number;
    averageProcessingTime: number;
    averageManufacturabilityScore: number;
    successRate: number;
    topIssues: IssueFrequency[];
    improvementSuggestions: string[];
    performanceTrends: PerformanceTrend;
    userEngagement: any;
    systemHealth: any;
  } {
    if (this.metrics.length === 0) {
      return this.getEmptyStatistics();
    }

    const totalGenerations = this.metrics.length;
    const averageQualityScore = this.metrics.reduce((sum, m) => sum + m.qualityScore, 0) / totalGenerations;
    const averageProcessingTime = this.metrics.reduce((sum, m) => sum + m.processingTime, 0) / totalGenerations;
    const averageManufacturabilityScore =
      this.metrics.reduce((sum, m) => sum + m.manufacturabilityScore, 0) / totalGenerations;

    // Success rate based on quality threshold
    const successfulGenerations = this.metrics.filter(m => m.qualityScore > 0.7).length;
    const successRate = successfulGenerations / totalGenerations;

    // Analyze top issues
    const topIssues = this.analyzeTopIssues();

    // Generate improvement suggestions
    const improvementSuggestions = this.generateSystemImprovementSuggestions();

    // Performance trends
    const performanceTrends = this.calculatePerformanceTrends();

    // User engagement metrics
    const userEngagement = this.calculateUserEngagement();

    // System health
    const systemHealth = this.getSystemHealth();

    return {
      totalGenerations,
      averageQualityScore,
      averageProcessingTime,
      averageManufacturabilityScore,
      successRate,
      topIssues,
      improvementSuggestions,
      performanceTrends,
      userEngagement,
      systemHealth
    };
  }

  /**
   * Generates system-level improvement suggestions
   */
  private static generateSystemImprovementSuggestions(): string[] {
    const suggestions: string[] = [];

    if (this.metrics.length === 0) return suggestions;

    const avgQuality = this.metrics.reduce((sum, m) => sum + m.qualityScore, 0) / this.metrics.length;
    const avgProcessingTime = this.metrics.reduce((sum, m) => sum + m.processingTime, 0) / this.metrics.length;

    if (avgQuality < 0.8) {
      suggestions.push("Enhance AI model training with more engineering-specific datasets");
      suggestions.push("Improve prompt templates for better engineering context integration");
    }

    if (avgProcessingTime > 10000) {
      // 10 seconds
      suggestions.push("Optimize AI model performance for faster response times");
      suggestions.push("Implement caching strategies for common design patterns");
    }

    const lowManufacturabilityCount = this.metrics.filter(m => m.manufacturabilityScore < 0.6).length;
    if (lowManufacturabilityCount > this.metrics.length * 0.3) {
      suggestions.push("Strengthen manufacturability validation rules and constraints");
      suggestions.push("Integrate more manufacturing process knowledge into generation logic");
    }

    return suggestions;
  }

  /**
   * Analyzes most frequent issues across generations
   */
  private static analyzeTopIssues(): IssueFrequency[] {
    const issueMap = new Map<string, { count: number; severities: string[] }>();

    this.metrics.forEach(metric => {
      metric.validationResults.forEach(result => {
        const key = result.type;
        const existing = issueMap.get(key) || { count: 0, severities: [] };
        existing.count++;
        existing.severities.push(result.severity);
        issueMap.set(key, existing);
      });
    });

    return Array.from(issueMap.entries())
      .map(([issueType, data]) => ({
        issueType,
        frequency: data.count,
        severity: this.determinePredominantSeverity(data.severities),
        trend: "stable" as const, // Simplified - would need historical data
        resolution: this.getIssueResolution(issueType)
      }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 10);
  }

  // Helper methods (simplified implementations)
  private static countTechnicalTerms(description: string): number {
    const technicalTerms = [
      "tolerance",
      "material",
      "steel",
      "aluminum",
      "machining",
      "welding",
      "assembly",
      "bearing",
      "shaft",
      "bolt",
      "screw",
      "thread",
      "surface",
      "finish",
      "heat",
      "treatment",
      "hardness",
      "strength",
      "pressure"
    ];

    const lowerDesc = description.toLowerCase();
    return technicalTerms.filter(term => lowerDesc.includes(term)).length;
  }

  private static countConstraints(description: string): number {
    const constraintKeywords = [
      "must",
      "should",
      "cannot",
      "required",
      "minimum",
      "maximum",
      "limit",
      "constraint",
      "specification",
      "standard"
    ];

    const lowerDesc = description.toLowerCase();
    return constraintKeywords.filter(keyword => lowerDesc.includes(keyword)).length;
  }

  private static assessDomainSpecificity(description: string, context?: EngineeringContext): number {
    if (!context) return 0.5;

    const domainKeywords = {
      mechanical: ["gear", "bearing", "shaft", "motor"],
      structural: ["beam", "column", "load", "stress"],
      automotive: ["engine", "brake", "suspension"],
      aerospace: ["wing", "turbine", "flight"]
    };

    const keywords = domainKeywords[context.domain as keyof typeof domainKeywords] || [];
    const lowerDesc = description.toLowerCase();
    const matches = keywords.filter(keyword => lowerDesc.includes(keyword)).length;

    return Math.min(matches / Math.max(keywords.length, 1), 1);
  }

  private static assessAmbiguity(description: string): number {
    const ambiguousTerms = ["some", "several", "many", "few", "large", "small", "good", "bad", "appropriate"];
    const lowerDesc = description.toLowerCase();
    const ambiguousCount = ambiguousTerms.filter(term => lowerDesc.includes(term)).length;

    return Math.min(ambiguousCount / 10, 1); // Normalize to 0-1
  }

  private static assessEngineeringDetail(description: string, context?: EngineeringContext): number {
    const detailIndicators = [
      /\d+\s*mm/,
      /\d+\s*cm/,
      /\d+\s*m/, // Dimensions
      /±\d+/,
      /\d+\s*mpa/,
      /\d+\s*n/, // Tolerances and forces
      /ra\s*\d+/,
      /h\d+/,
      /g\d+/, // Surface finish and tolerances
      /iso\s*\d+/,
      /din\s*\d+/,
      /ansi/ // Standards
    ];

    const matches = detailIndicators.filter(pattern => pattern.test(description.toLowerCase())).length;
    return Math.min(matches / detailIndicators.length, 1);
  }

  private static assessGeometricAccuracy(elements: EnhancedElement[], validationResults: ValidationResult[]): number {
    const geometricErrors = validationResults.filter(
      r => r.type.includes("geometry") || r.type.includes("dimension")
    ).length;

    return Math.max(0, 1 - geometricErrors / Math.max(elements.length, 1));
  }

  private static assessEngineeringValidity(elements: EnhancedElement[], validationResults: ValidationResult[]): number {
    const elementsWithEngProps = elements.filter(e => e.engineeringProperties).length;
    const validityScore = elements.length > 0 ? elementsWithEngProps / elements.length : 0;

    const engineeringErrors = validationResults.filter(
      r => r.type.includes("material") || r.type.includes("tolerance") || r.type.includes("manufacturing")
    ).length;

    const errorPenalty = engineeringErrors / Math.max(elements.length, 1);

    return Math.max(0, validityScore - errorPenalty);
  }

  private static assessManufacturability(elements: EnhancedElement[], validationResults: ValidationResult[]): number {
    const manufacturingErrors = validationResults.filter(r => r.type === "manufacturing_error").length;

    const criticalErrors = validationResults.filter(
      r => r.type === "manufacturing_error" && r.severity === "critical"
    ).length;

    const errorScore = 1 - manufacturingErrors / Math.max(elements.length, 1);
    const criticalPenalty = criticalErrors * 0.2;

    return Math.max(0, errorScore - criticalPenalty);
  }

  private static assessStandardsCompliance(elements: EnhancedElement[], validationResults: ValidationResult[]): number {
    const elementsWithStandards = elements.filter(
      e =>
        e.engineeringProperties?.standardReferences?.length && e.engineeringProperties?.standardReferences?.length > 0
    ).length;

    return elements.length > 0 ? elementsWithStandards / elements.length : 0;
  }

  private static assessDesignCoherence(elements: EnhancedElement[]): number {
    if (elements.length <= 1) return 1;

    // Check material consistency
    const materials = elements.map(e => e.engineeringProperties?.material).filter(Boolean);
    const uniqueMaterials = Array.from(new Set(materials));
    const materialConsistency = materials.length > 0 ? 1 - (uniqueMaterials.length - 1) / materials.length : 1;

    // Check dimensional consistency
    const dimensions = elements.map(e => Math.max(e.width || 0, e.height || 0, e.depth || 0));
    const avgDimension = dimensions.reduce((a, b) => a + b, 0) / dimensions.length;
    const dimensionalVariation =
      dimensions.reduce((sum, dim) => sum + Math.abs(dim - avgDimension), 0) / dimensions.length;
    const dimensionalConsistency = Math.max(0, 1 - dimensionalVariation / avgDimension);

    return (materialConsistency + dimensionalConsistency) / 2;
  }

  private static assessMaterialAppropriateness(elements: EnhancedElement[]): number {
    const elementsWithMaterials = elements.filter(
      e => e.engineeringProperties?.material && e.engineeringProperties?.materialProperties
    ).length;

    return elements.length > 0 ? elementsWithMaterials / elements.length : 0;
  }

  private static assessToleranceConsistency(elements: EnhancedElement[]): number {
    const elementsWithTolerances = elements.filter(e => e.engineeringProperties?.tolerance).length;

    return elements.length > 0 ? elementsWithTolerances / elements.length : 0;
  }

  private static assessAssemblyFeasibility(elements: EnhancedElement[], assemblyPlan?: AssemblyPlan): number {
    if (!assemblyPlan || elements.length <= 1) return 1;

    // Simple assessment based on assembly plan quality
    const hasProperSequence = assemblyPlan.sequence.length > 0;
    const hasFasteners = assemblyPlan.fasteners.length > 0;
    const hasInstructions = assemblyPlan.instructions.length > 0;

    const features = [hasProperSequence, hasFasteners, hasInstructions];
    return features.filter(Boolean).length / features.length;
  }

  private static assessEnvironmentalCompliance(elements: EnhancedElement[], context?: EngineeringContext): number {
    // Simplified environmental compliance assessment
    if (!context?.environmentalFactors || context.environmentalFactors.length === 0) {
      return 0.8; // Default good score if no environmental factors specified
    }

    // Check if materials are appropriate for environmental conditions
    let compliance = 1.0;

    context.environmentalFactors.forEach(factor => {
      if (factor.type === "corrosion" && factor.severity === "severe") {
        const stainlessElements = elements.filter(e => e.engineeringProperties?.material?.includes("stainless")).length;
        const complianceRatio = elements.length > 0 ? stainlessElements / elements.length : 0;
        compliance = Math.min(compliance, complianceRatio);
      }
    });

    return compliance;
  }

  private static assessCostEffectiveness(elements: EnhancedElement[]): number {
    // Simplified cost effectiveness assessment
    const expensiveMaterials = elements.filter(
      e =>
        e.engineeringProperties?.material?.includes("titanium") ||
        e.engineeringProperties?.material?.includes("inconel")
    ).length;

    const costPenalty = expensiveMaterials / Math.max(elements.length, 1);
    return Math.max(0, 1 - costPenalty * 0.5);
  }

  private static calculateElementVolume(element: EnhancedElement): number {
    if (element.type === "cube") {
      return (element.width || 10) * (element.height || 10) * (element.depth || 10);
    } else if (element.type === "cylinder") {
      const radius = element.radius || 5;
      const height = element.height || 10;
      return Math.PI * radius * radius * height;
    } else if (element.type === "sphere") {
      const radius = element.radius || 5;
      return (4 / 3) * Math.PI * radius * radius * radius;
    }
    return 1000; // Default volume
  }

  private static getMaterialCostRate(material: string): number {
    const rates: Record<string, number> = {
      "steel": 0.8,
      "aluminum": 1.5,
      "stainless": 3.0,
      "titanium": 25.0,
      "brass": 5.0
    };

    for (const [key, rate] of Object.entries(rates)) {
      if (material.toLowerCase().includes(key)) {
        return rate;
      }
    }

    return rates.steel;
  }

  private static getProcessCost(process: string, element: EnhancedElement): number {
    const baseCosts: Record<string, number> = {
      "machining": 15,
      "welding": 8,
      "casting": 5,
      "forging": 12,
      "additive_manufacturing": 20
    };

    const volume = this.calculateElementVolume(element);
    const volumeFactor = Math.max(1, volume / 1000); // Scale by volume

    return (baseCosts[process] || 10) * volumeFactor;
  }

  private static calculateCostEfficiency(totalCost: number, elementCount: number): number {
    // Simplified cost efficiency calculation
    const costPerElement = elementCount > 0 ? totalCost / elementCount : totalCost;

    // Assume $50 per element is efficient, $200+ is inefficient
    if (costPerElement <= 50) return 1.0;
    if (costPerElement >= 200) return 0.2;

    return Math.max(0.2, 1.0 - (costPerElement - 50) / 150);
  }

  private static calculateMaterialUtilization(elements: EnhancedElement[]): number {
    // Simplified material utilization - higher score for more standard materials
    const standardMaterials = ["steel", "aluminum", "stainless"];
    const standardElements = elements.filter(e =>
      standardMaterials.some(mat => e.engineeringProperties?.material?.toLowerCase().includes(mat))
    ).length;

    return elements.length > 0 ? standardElements / elements.length : 0;
  }

  private static assessGeometricOptimization(elements: EnhancedElement[]): number {
    // Simplified geometric optimization - check for standard dimensions
    const standardDimensions = [10, 15, 20, 25, 30, 40, 50, 63, 80, 100];

    let optimizedElements = 0;
    elements.forEach(element => {
      const dimensions = [element.width, element.height, element.depth, element.radius].filter(Boolean);
      const isOptimized = dimensions.some(dim => standardDimensions.some(std => Math.abs(dim - std) < 1));
      if (isOptimized) optimizedElements++;
    });

    return elements.length > 0 ? optimizedElements / elements.length : 0;
  }

  private static assessManufacturingEfficiency(elements: EnhancedElement[]): number {
    // Simplified manufacturing efficiency - favor common processes
    const efficientProcesses = ["machining", "welding", "casting"];

    let efficientElements = 0;
    elements.forEach(element => {
      const processes = element.engineeringProperties?.manufacturingProcess || [];
      const hasEfficientProcess = processes.some(proc => efficientProcesses.includes(proc));
      if (hasEfficientProcess) efficientElements++;
    });

    return elements.length > 0 ? efficientElements / elements.length : 0;
  }

  private static assessAssemblyEfficiency(elements: EnhancedElement[]): number {
    // Simplified assembly efficiency - fewer elements generally more efficient
    if (elements.length <= 3) return 1.0;
    if (elements.length <= 10) return 0.8;
    if (elements.length <= 20) return 0.6;
    return 0.4;
  }

  private static assessContextRecognition(description: string, context: EngineeringContext): number {
    const domainTerms = {
      mechanical: ["gear", "bearing", "shaft", "motor", "pump"],
      structural: ["beam", "column", "load", "stress", "support"],
      automotive: ["engine", "brake", "suspension", "transmission"],
      aerospace: ["wing", "turbine", "flight", "pressure", "altitude"]
    };

    const relevantTerms = domainTerms[context.domain as keyof typeof domainTerms] || [];
    const lowerDesc = description.toLowerCase();
    const recognizedTerms = relevantTerms.filter(term => lowerDesc.includes(term)).length;

    return relevantTerms.length > 0 ? recognizedTerms / relevantTerms.length : 0;
  }

  private static assessDomainKnowledgeApplication(elements: EnhancedElement[], context: EngineeringContext): number {
    // Check if generated elements match domain expectations
    const domainAppropriate = elements.filter(element => {
      const material = element.engineeringProperties?.material?.toLowerCase() || "";

      switch (context.domain) {
        case "aerospace":
          return material.includes("aluminum") || material.includes("titanium");
        case "marine":
          return material.includes("stainless") || material.includes("bronze");
        case "automotive":
          return material.includes("steel") || material.includes("aluminum");
        default:
          return true; // Default to appropriate
      }
    }).length;

    return elements.length > 0 ? domainAppropriate / elements.length : 0;
  }

  private static assessConstraintAdherence(elements: EnhancedElement[], context: EngineeringContext): number {
    // Simplified constraint adherence assessment
    if (context.manufacturingConstraints.length === 0) return 1.0;

    let adherenceScore = 0;
    elements.forEach(element => {
      const processes = element.engineeringProperties?.manufacturingProcess || [];
      const contextProcesses = context.manufacturingConstraints.map(c => c.process);
      const hasMatchingProcess = processes.some(proc => contextProcesses.includes(proc));
      if (hasMatchingProcess) adherenceScore++;
    });

    return elements.length > 0 ? adherenceScore / elements.length : 0;
  }

  private static assessStandardsIntegration(elements: EnhancedElement[], context: EngineeringContext): number {
    const elementsWithStandards = elements.filter(
      e =>
        e.engineeringProperties?.standardReferences?.length && e.engineeringProperties?.standardReferences?.length > 0
    ).length;

    return elements.length > 0 ? elementsWithStandards / elements.length : 0;
  }

  private static updatePerformanceTrends(): void {
    // Update performance trends (simplified implementation)
    const recentMetrics = this.metrics.slice(-100); // Last 100 generations

    if (recentMetrics.length > 0) {
      const avgQuality = recentMetrics.reduce((sum, m) => sum + m.qualityScore, 0) / recentMetrics.length;
      const avgTime = recentMetrics.reduce((sum, m) => sum + m.processingTime, 0) / recentMetrics.length;
      const successRate = recentMetrics.filter(m => m.qualityScore > 0.7).length / recentMetrics.length;

      const feedback = recentMetrics.filter(m => m.userFeedback).map(m => m.userFeedback!);
      const userSatisfaction =
        feedback.length > 0 ? feedback.reduce((sum, f) => sum + f.overallRating, 0) / feedback.length / 5 : 0.5;

      this.performanceHistory.push({
        period: new Date().toISOString().slice(0, 10),
        averageQualityScore: avgQuality,
        averageProcessingTime: avgTime,
        successRate,
        userSatisfaction,
        improvementRate: 0, // Would calculate from historical data
        topIssues: this.analyzeTopIssues().slice(0, 3),
        recommendations: this.generateSystemImprovementSuggestions().slice(0, 3)
      });
    }
  }

  private static saveMetrics(metrics: GenerationMetrics): void {
    // In production, save to database
    try {
      localStorage.setItem(`cad-metrics-${metrics.sessionId}`, JSON.stringify(metrics));
    } catch (error) {
      console.warn("Could not save metrics to localStorage:", error);
    }
  }

  private static determineExpertiseLevel(userMetrics: UserBehaviorMetrics): UserBehaviorMetrics["expertiseLevel"] {
    if (userMetrics.sessionCount >= 100) return "expert";
    if (userMetrics.sessionCount >= 50) return "advanced";
    if (userMetrics.sessionCount >= 10) return "intermediate";
    return "beginner";
  }

  private static getEmptyStatistics() {
    return {
      totalGenerations: 0,
      averageQualityScore: 0,
      averageProcessingTime: 0,
      averageManufacturabilityScore: 0,
      successRate: 0,
      topIssues: [],
      improvementSuggestions: [],
      performanceTrends: {
        period: new Date().toISOString().slice(0, 10),
        averageQualityScore: 0,
        averageProcessingTime: 0,
        successRate: 0,
        userSatisfaction: 0,
        improvementRate: 0,
        topIssues: [],
        recommendations: []
      },
      userEngagement: {},
      systemHealth: {}
    };
  }

  private static determinePredominantSeverity(severities: string[]): IssueFrequency["severity"] {
    if (severities.includes("critical")) return "critical";
    if (severities.includes("warning")) return "high";
    return "medium";
  }

  private static getIssueResolution(issueType: string): string {
    const resolutions: Record<string, string> = {
      "dimension_warning": "Use standard dimensions and validate tolerances",
      "manufacturing_error": "Review manufacturing constraints and processes",
      "material_warning": "Verify material selection for application",
      "geometry_error": "Check geometric relationships and constraints",
      "tolerance_error": "Specify appropriate tolerances for manufacturing"
    };

    return resolutions[issueType] || "Review design requirements and constraints";
  }

  private static calculatePerformanceTrends(): PerformanceTrend {
    const recent = this.performanceHistory.slice(-30); // Last 30 periods

    if (recent.length === 0) {
      return {
        period: "No data",
        averageQualityScore: 0,
        averageProcessingTime: 0,
        successRate: 0,
        userSatisfaction: 0,
        improvementRate: 0,
        topIssues: [],
        recommendations: []
      };
    }

    const latest = recent[recent.length - 1];
    return latest;
  }

  private static calculateUserEngagement(): any {
    return {
      totalUsers: this.userBehavior.size,
      activeUsers: Array.from(this.userBehavior.values()).filter(u => u.sessionCount > 0).length,
      expertUsers: Array.from(this.userBehavior.values()).filter(u => u.expertiseLevel === "expert").length,
      averageSessionsPerUser:
        Array.from(this.userBehavior.values()).reduce((sum, u) => sum + u.sessionCount, 0) /
        Math.max(this.userBehavior.size, 1)
    };
  }

  private static getSystemHealth(): any {
    return {
      status: "healthy",
      uptime: 99.5,
      responseTime: 2500,
      errorRate: 0.01,
      lastCheck: Date.now()
    };
  }
}
