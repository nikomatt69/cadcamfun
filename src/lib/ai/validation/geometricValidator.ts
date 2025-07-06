/**
 * Geometric Validation Engine for Engineering CAD Applications
 *
 * This module provides comprehensive geometric validation capabilities
 * for CAD elements with engineering analysis, manufacturing feasibility,
 * and quality assurance validation rules.
 *
 * @module GeometricValidator
 * @version 2.0.0
 */

import { Element } from "@/src/store/elementsStore";
import { EnhancedElement, ValidationResult } from "../parsers/advancedCADParser";

/**
 * Geometric validation rule interface for modular validation system
 */
export interface GeometricValidationRule {
  id: string;
  name: string;
  description: string;
  category: "dimension" | "interference" | "manufacturing" | "assembly" | "material" | "tolerance" | "safety";
  priority: "critical" | "high" | "medium" | "low";
  validate: (elements: EnhancedElement[]) => ValidationResult[];
  applicableTypes: string[]; // Element types this rule applies to
  standards: string[]; // Applicable engineering standards
}

/**
 * Manufacturing constraint interface for process-specific validation
 */
export interface ManufacturingConstraint {
  process: string;
  minFeatureSize: number;
  minWallThickness: number;
  maxAspectRatio: number;
  surfaceFinishCapability: string[];
  toleranceCapability: string[];
  materialCompatibility: string[];
}

/**
 * Interference detection result with detailed analysis
 */
export interface InterferenceResult {
  hasInterference: boolean;
  overlapVolume?: number;
  overlapArea?: number;
  interferenceType: "complete" | "partial" | "tangent" | "clearance";
  minimumClearance?: number;
  recommendedAction: string;
}

/**
 * Comprehensive set of geometric validation rules based on engineering standards
 */
export const GEOMETRIC_VALIDATION_RULES: GeometricValidationRule[] = [
  {
    id: "minimum_wall_thickness",
    name: "Minimum Wall Thickness Validation",
    description: "Ensures minimum wall thickness for structural integrity and manufacturing feasibility",
    category: "manufacturing",
    priority: "critical",
    applicableTypes: ["cube", "cylinder", "complex"],
    standards: ["ISO 2768", "ASME Y14.5"],
    validate: (elements: EnhancedElement[]) => {
      const results: ValidationResult[] = [];

      elements.forEach(element => {
        const minThickness = getMinimumWallThickness(element.engineeringProperties?.material || "steel");

        if (element.type === "cube") {
          const wallThickness = Math.min(
            element.width || Infinity,
            element.height || Infinity,
            element.depth || Infinity
          );

          if (wallThickness < minThickness) {
            results.push({
              elementId: element.id,
              type: "manufacturing_error",
              message: `Wall thickness ${wallThickness.toFixed(1)}mm is below minimum (${minThickness}mm) for ${element.engineeringProperties?.material || "steel"}`,
              severity: "critical",
              suggestedFix: `Increase minimum dimension to ${minThickness}mm or consider alternative manufacturing process`,
              affectedProperty: "wall_thickness",
              recommendedValue: minThickness
            });
          }
        }

        if (element.type === "cylinder" && element.radius && element.height) {
          // Estimate wall thickness for hollow cylinders
          const estimatedWallThickness = element.radius * 0.2; // Assume 20% wall thickness
          if (estimatedWallThickness < minThickness) {
            results.push({
              elementId: element.id,
              type: "manufacturing_error",
              message: `Estimated wall thickness ${estimatedWallThickness.toFixed(1)}mm may be insufficient for structural integrity`,
              severity: "warning",
              suggestedFix: `Consider solid cylinder or increase outer diameter to achieve minimum ${minThickness}mm wall thickness`,
              affectedProperty: "wall_thickness",
              recommendedValue: minThickness
            });
          }
        }
      });

      return results;
    }
  },

  {
    id: "interference_detection",
    name: "Element Interference Detection",
    description: "Detects geometric interference between CAD elements with detailed analysis",
    category: "interference",
    priority: "critical",
    applicableTypes: ["cube", "cylinder", "sphere", "complex"],
    standards: ["ISO 14405", "ASME Y14.5M"],
    validate: (elements: EnhancedElement[]) => {
      const results: ValidationResult[] = [];

      for (let i = 0; i < elements.length; i++) {
        for (let j = i + 1; j < elements.length; j++) {
          const interferenceResult = checkDetailedInterference(elements[i], elements[j]);

          if (interferenceResult.hasInterference) {
            const severity = interferenceResult.interferenceType === "complete" ? "critical" : "warning";

            results.push({
              elementId: elements[i].id,
              type: "interference_error",
              message: `${interferenceResult.interferenceType} interference detected with element ${elements[j].id}`,
              severity,
              suggestedFix: interferenceResult.recommendedAction,
              affectedProperty: "position"
            });
          } else if (interferenceResult.minimumClearance !== undefined && interferenceResult.minimumClearance < 0.5) {
            results.push({
              elementId: elements[i].id,
              type: "interference_error",
              message: `Insufficient clearance (${interferenceResult.minimumClearance.toFixed(2)}mm) with element ${elements[j].id}`,
              severity: "warning",
              suggestedFix: "Increase separation to minimum 0.5mm for assembly clearance",
              affectedProperty: "clearance",
              recommendedValue: 0.5
            });
          }
        }
      }

      return results;
    }
  },

  {
    id: "standard_dimensions",
    name: "Standard Dimension Validation",
    description: "Validates use of standard metric dimensions for manufacturing efficiency",
    category: "dimension",
    priority: "medium",
    applicableTypes: ["cube", "cylinder", "sphere"],
    standards: ["ISO 3", "DIN 323"],
    validate: (elements: EnhancedElement[]) => {
      const results: ValidationResult[] = [];
      const PREFERRED_DIMENSIONS = [
        1, 1.2, 1.6, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200
      ];

      elements.forEach(element => {
        const dimensions = [
          { name: "width", value: element.width },
          { name: "height", value: element.height },
          { name: "depth", value: element.depth },
          { name: "radius", value: element.radius },
          { name: "diameter", value: element.radius ? element.radius * 2 : undefined }
        ].filter(dim => dim.value !== undefined) as Array<{ name: string; value: number }>;

        dimensions.forEach(dimension => {
          const nearestStandard = PREFERRED_DIMENSIONS.reduce((prev, curr) =>
            Math.abs(curr - dimension.value) < Math.abs(prev - dimension.value) ? curr : prev
          );

          const deviation = Math.abs(dimension.value - nearestStandard);
          const percentDeviation = (deviation / dimension.value) * 100;

          if (percentDeviation > 10 && deviation > 0.5) {
            results.push({
              elementId: element.id,
              type: "dimension_warning",
              message: `${dimension.name} ${dimension.value}mm deviates from preferred dimension ${nearestStandard}mm by ${deviation.toFixed(1)}mm`,
              severity: "suggestion",
              suggestedFix: `Consider using standard dimension ${nearestStandard}mm for better tooling availability and cost efficiency`,
              affectedProperty: dimension.name,
              recommendedValue: nearestStandard
            });
          }
        });
      });

      return results;
    }
  },

  {
    id: "manufacturing_feasibility",
    name: "Manufacturing Feasibility Analysis",
    description: "Validates element geometry against manufacturing process capabilities",
    category: "manufacturing",
    priority: "high",
    applicableTypes: ["cube", "cylinder", "complex"],
    standards: ["ISO 2768", "ASME B89.3.1"],
    validate: (elements: EnhancedElement[]) => {
      const results: ValidationResult[] = [];

      elements.forEach(element => {
        const manufacturingProcesses = element.engineeringProperties?.manufacturingProcess || ["machining"];

        manufacturingProcesses.forEach(process => {
          const constraints = getManufacturingConstraints(process);

          // Check minimum feature size
          const minFeature = getMinimumFeatureSize(element);
          if (minFeature < constraints.minFeatureSize) {
            results.push({
              elementId: element.id,
              type: "manufacturing_error",
              message: `Minimum feature size ${minFeature.toFixed(2)}mm is below ${process} capability (${constraints.minFeatureSize}mm)`,
              severity: "critical",
              suggestedFix: `Increase feature size or consider alternative process like EDM or micro-machining`,
              affectedProperty: "feature_size",
              recommendedValue: constraints.minFeatureSize
            });
          }

          // Check aspect ratio
          const aspectRatio = getAspectRatio(element);
          if (aspectRatio > constraints.maxAspectRatio) {
            results.push({
              elementId: element.id,
              type: "manufacturing_error",
              message: `Aspect ratio ${aspectRatio.toFixed(1)} exceeds ${process} capability (${constraints.maxAspectRatio})`,
              severity: "warning",
              suggestedFix: "Consider adding support ribs or changing geometry for manufacturing stability",
              affectedProperty: "aspect_ratio",
              recommendedValue: constraints.maxAspectRatio
            });
          }

          // Check material compatibility
          const material = element.engineeringProperties?.material || "steel";
          if (!constraints.materialCompatibility.includes(material)) {
            results.push({
              elementId: element.id,
              type: "material_warning",
              message: `Material ${material} may not be optimal for ${process}`,
              severity: "warning",
              suggestedFix: `Consider materials: ${constraints.materialCompatibility.join(", ")} for better ${process} results`,
              affectedProperty: "material"
            });
          }
        });
      });

      return results;
    }
  },

  {
    id: "tolerance_validation",
    name: "Engineering Tolerance Validation",
    description: "Validates tolerance specifications against manufacturing capabilities and standards",
    category: "tolerance",
    priority: "high",
    applicableTypes: ["cube", "cylinder", "sphere", "complex"],
    standards: ["ISO 286", "ASME B4.1"],
    validate: (elements: EnhancedElement[]) => {
      const results: ValidationResult[] = [];

      elements.forEach(element => {
        const tolerance = element.engineeringProperties?.tolerance;
        const manufacturingProcesses = element.engineeringProperties?.manufacturingProcess || ["machining"];

        if (!tolerance) {
          results.push({
            elementId: element.id,
            type: "tolerance_error",
            message: "No tolerance specification found - required for manufacturing",
            severity: "critical",
            suggestedFix: "Specify appropriate tolerance based on function and manufacturing process",
            affectedProperty: "tolerance",
            recommendedValue: "±0.1"
          });
          return;
        }

        // Validate tolerance achievability
        manufacturingProcesses.forEach(process => {
          const constraints = getManufacturingConstraints(process);
          const toleranceValue = parseToleranceValue(tolerance);

          if (toleranceValue !== null && !constraints.toleranceCapability.includes(tolerance)) {
            const achievableTolerance = getAchievableTolerance(toleranceValue, process);

            if (Math.abs(toleranceValue) < achievableTolerance) {
              results.push({
                elementId: element.id,
                type: "tolerance_error",
                message: `Tolerance ${tolerance} may be too tight for ${process} (typical capability: ±${achievableTolerance}mm)`,
                severity: "warning",
                suggestedFix: `Consider relaxing tolerance to ±${achievableTolerance}mm or upgrading to precision ${process}`,
                affectedProperty: "tolerance",
                recommendedValue: `±${achievableTolerance}`
              });
            }
          }
        });

        // Validate ISO tolerance designations
        if (tolerance.match(/^[A-Z]\d+$/) || tolerance.match(/^[a-z]\d+$/)) {
          const isValid = validateISOTolerance(tolerance);
          if (!isValid) {
            results.push({
              elementId: element.id,
              type: "tolerance_error",
              message: `Invalid ISO tolerance designation: ${tolerance}`,
              severity: "warning",
              suggestedFix: "Use valid ISO 286 tolerance designation (e.g., H7, g6, h6)",
              affectedProperty: "tolerance"
            });
          }
        }
      });

      return results;
    }
  },

  {
    id: "assembly_clearance",
    name: "Assembly Clearance Validation",
    description: "Ensures adequate clearance for assembly operations and tool access",
    category: "assembly",
    priority: "high",
    applicableTypes: ["cube", "cylinder", "sphere", "complex"],
    standards: ["ISO 14405", "ASME Y14.5"],
    validate: (elements: EnhancedElement[]) => {
      const results: ValidationResult[] = [];

      // Check for assembly access clearances
      elements.forEach((element, index) => {
        const surroundingElements = elements.filter((_, i) => i !== index);

        // Check if element is surrounded and has insufficient access
        const clearances = surroundingElements.map(other => calculateClearance(element, other));
        const minClearance = Math.min(...clearances);

        if (minClearance < 5) {
          // Minimum 5mm for basic tool access
          results.push({
            elementId: element.id,
            type: "manufacturing_error",
            message: `Insufficient assembly clearance (${minClearance.toFixed(1)}mm) for tool access`,
            severity: "warning",
            suggestedFix: "Increase clearance to minimum 5mm for standard tooling access",
            affectedProperty: "assembly_clearance",
            recommendedValue: 5
          });
        }

        // Check for fastener access if element has mounting features
        if (element.name?.toLowerCase().includes("mount") || element.name?.toLowerCase().includes("flange")) {
          const fastenerClearance = calculateFastenerClearance(element, surroundingElements);
          if (fastenerClearance && fastenerClearance < 15) {
            // Minimum 15mm for wrench access
            results.push({
              elementId: element.id,
              type: "manufacturing_error",
              message: `Insufficient clearance (${fastenerClearance.toFixed(1)}mm) for fastener installation`,
              severity: "critical",
              suggestedFix: "Provide minimum 15mm clearance around fastener locations for tool access",
              affectedProperty: "fastener_clearance",
              recommendedValue: 15
            });
          }
        }
      });

      return results;
    }
  },

  {
    id: "structural_integrity",
    name: "Structural Integrity Analysis",
    description: "Basic structural validation for load-bearing components",
    category: "safety",
    priority: "critical",
    applicableTypes: ["cube", "cylinder", "structural"],
    standards: ["EN 1993", "AISC 360"],
    validate: (elements: EnhancedElement[]) => {
      const results: ValidationResult[] = [];

      elements.forEach(element => {
        const material = element.engineeringProperties?.material || "steel";
        const materialProps = getMaterialProperties(material);

        if (!materialProps) {
          results.push({
            elementId: element.id,
            type: "material_warning",
            message: `Unknown material properties for ${material} - cannot verify structural adequacy`,
            severity: "warning",
            suggestedFix: "Specify material with known properties for structural analysis",
            affectedProperty: "material"
          });
          return;
        }

        // Check slenderness ratio for compression members
        if (element.type === "cube" && element.height && element.width) {
          const slendernessRatio = element.height / Math.min(element.width, element.depth || element.width);

          if (slendernessRatio > 200) {
            results.push({
              elementId: element.id,
              type: "manufacturing_error",
              message: `High slenderness ratio (${slendernessRatio.toFixed(1)}) may cause buckling under compression`,
              severity: "critical",
              suggestedFix: "Add lateral bracing or increase cross-sectional dimensions",
              affectedProperty: "slenderness_ratio",
              recommendedValue: 200
            });
          }
        }

        // Check minimum section modulus for bending members
        if (element.type === "cube" && element.width && element.height) {
          const sectionModulus = (element.width * Math.pow(element.height, 2)) / 6;
          const minimumRequired = 1000; // mm³ - arbitrary minimum for demonstration

          if (sectionModulus < minimumRequired) {
            results.push({
              elementId: element.id,
              type: "manufacturing_error",
              message: `Section modulus ${sectionModulus.toFixed(0)}mm³ may be insufficient for bending loads`,
              severity: "warning",
              suggestedFix: "Increase cross-sectional dimensions or add reinforcement",
              affectedProperty: "section_modulus",
              recommendedValue: minimumRequired
            });
          }
        }
      });

      return results;
    }
  }
];

/**
 * Manufacturing constraints database for different processes
 */
const MANUFACTURING_CONSTRAINTS: Record<string, ManufacturingConstraint> = {
  "machining": {
    process: "machining",
    minFeatureSize: 0.5,
    minWallThickness: 2.0,
    maxAspectRatio: 10,
    surfaceFinishCapability: ["Ra 6.3", "Ra 3.2", "Ra 1.6", "Ra 0.8"],
    toleranceCapability: ["±0.1", "±0.05", "H7", "h6", "g6"],
    materialCompatibility: ["steel", "aluminum", "brass", "stainless"]
  },
  "precision_machining": {
    process: "precision_machining",
    minFeatureSize: 0.1,
    minWallThickness: 1.0,
    maxAspectRatio: 15,
    surfaceFinishCapability: ["Ra 1.6", "Ra 0.8", "Ra 0.4", "Ra 0.2"],
    toleranceCapability: ["±0.05", "±0.02", "±0.01", "H6", "h5", "g5"],
    materialCompatibility: ["steel", "aluminum", "brass", "stainless", "titanium"]
  },
  "casting": {
    process: "casting",
    minFeatureSize: 2.0,
    minWallThickness: 3.0,
    maxAspectRatio: 5,
    surfaceFinishCapability: ["Ra 25", "Ra 12.5", "Ra 6.3"],
    toleranceCapability: ["±0.5", "±0.2", "IT12", "IT11"],
    materialCompatibility: ["cast_iron", "steel", "aluminum", "brass"]
  },
  "welding": {
    process: "welding",
    minFeatureSize: 3.0,
    minWallThickness: 2.0,
    maxAspectRatio: 20,
    surfaceFinishCapability: ["Ra 12.5", "Ra 6.3", "Ra 3.2"],
    toleranceCapability: ["±1.0", "±0.5", "±0.2"],
    materialCompatibility: ["steel", "stainless", "aluminum"]
  },
  "additive_manufacturing": {
    process: "additive_manufacturing",
    minFeatureSize: 0.4,
    minWallThickness: 0.8,
    maxAspectRatio: 50,
    surfaceFinishCapability: ["Ra 25", "Ra 12.5", "Ra 6.3"],
    toleranceCapability: ["±0.2", "±0.1", "±0.05"],
    materialCompatibility: ["steel", "aluminum", "titanium", "plastic"]
  }
};

/**
 * Main geometric validation engine
 */
export class GeometricValidator {
  /**
   * Validates all elements using the complete rule set
   *
   * @param elements - Array of enhanced CAD elements to validate
   * @param selectedRules - Optional array of rule IDs to apply (all rules if not specified)
   * @returns Comprehensive validation results
   */
  static validateElements(elements: EnhancedElement[], selectedRules?: string[]): ValidationResult[] {
    let allResults: ValidationResult[] = [];

    // Filter rules if specific rules are requested
    const rulesToApply = selectedRules
      ? GEOMETRIC_VALIDATION_RULES.filter(rule => selectedRules.includes(rule.id))
      : GEOMETRIC_VALIDATION_RULES;

    // Apply each validation rule
    rulesToApply.forEach(rule => {
      try {
        // Filter elements applicable to this rule
        const applicableElements = elements.filter(
          element =>
            rule.applicableTypes.includes("all") ||
            rule.applicableTypes.includes(element.type) ||
            rule.applicableTypes.some(type => element.type.includes(type))
        );

        if (applicableElements.length > 0) {
          const results = rule.validate(applicableElements);
          allResults = allResults.concat(results);
        }
      } catch (error) {
        console.error(`Validation rule ${rule.id} failed:`, error);

        // Add system error to results
        allResults.push({
          elementId: "system",
          type: "manufacturing_error",
          message: `Validation rule ${rule.name} encountered an error: ${error instanceof Error ? error.message : "Unknown error"}`,
          severity: "warning",
          suggestedFix: "Review element data and retry validation"
        });
      }
    });

    return allResults;
  }

  /**
   * Categorizes validation results by severity and type
   *
   * @param results - Validation results to categorize
   * @returns Categorized results for prioritized handling
   */
  static categorizeResults(results: ValidationResult[]): {
    critical: ValidationResult[];
    warnings: ValidationResult[];
    suggestions: ValidationResult[];
    byCategory: Record<string, ValidationResult[]>;
    byElement: Record<string, ValidationResult[]>;
  } {
    const critical = results.filter(r => r.severity === "critical");
    const warnings = results.filter(r => r.severity === "warning");
    const suggestions = results.filter(r => r.severity === "suggestion");

    // Group by category
    const byCategory: Record<string, ValidationResult[]> = {};
    results.forEach(result => {
      const category = result.type.split("_")[0]; // Extract base category
      if (!byCategory[category]) byCategory[category] = [];
      byCategory[category].push(result);
    });

    // Group by element
    const byElement: Record<string, ValidationResult[]> = {};
    results.forEach(result => {
      if (!byElement[result.elementId]) byElement[result.elementId] = [];
      byElement[result.elementId].push(result);
    });

    return {
      critical,
      warnings,
      suggestions,
      byCategory,
      byElement
    };
  }

  /**
   * Generates a validation report with recommendations
   *
   * @param elements - Validated elements
   * @param results - Validation results
   * @returns Comprehensive validation report
   */
  static generateValidationReport(
    elements: EnhancedElement[],
    results: ValidationResult[]
  ): {
    summary: string;
    overallScore: number;
    recommendations: string[];
    detailedFindings: any[];
    passedRules: string[];
    failedRules: string[];
  } {
    const categorized = this.categorizeResults(results);
    const totalRules = GEOMETRIC_VALIDATION_RULES.length;
    const passedRules = GEOMETRIC_VALIDATION_RULES.filter(
      rule => !results.some(result => result.type.includes(rule.category))
    ).map(rule => rule.name);
    const failedRules = GEOMETRIC_VALIDATION_RULES.filter(rule =>
      results.some(result => result.type.includes(rule.category))
    ).map(rule => rule.name);

    // Calculate overall score (0-100)
    const criticalPenalty = categorized.critical.length * 20;
    const warningPenalty = categorized.warnings.length * 5;
    const suggestionPenalty = categorized.suggestions.length * 1;
    const overallScore = Math.max(0, 100 - criticalPenalty - warningPenalty - suggestionPenalty);

    // Generate summary
    const summary =
      `Validation completed for ${elements.length} elements. ` +
      `${categorized.critical.length} critical issues, ` +
      `${categorized.warnings.length} warnings, ` +
      `${categorized.suggestions.length} suggestions. ` +
      `Overall quality score: ${overallScore}/100.`;

    // Generate recommendations
    const recommendations: string[] = [];

    if (categorized.critical.length > 0) {
      recommendations.push(`Address ${categorized.critical.length} critical issues before manufacturing`);
    }

    if (categorized.warnings.length > 3) {
      recommendations.push("Consider design review to address multiple warnings");
    }

    if (Object.keys(categorized.byCategory).includes("manufacturing")) {
      recommendations.push("Review manufacturing processes and capabilities");
    }

    if (Object.keys(categorized.byCategory).includes("tolerance")) {
      recommendations.push("Verify tolerance specifications with manufacturing team");
    }

    // Detailed findings
    const detailedFindings = Object.entries(categorized.byElement).map(([elementId, elementResults]) => {
      const element = elements.find(e => e.id === elementId);
      return {
        elementId,
        elementName: element?.name || element?.type || "Unknown",
        issueCount: elementResults.length,
        criticalCount: elementResults.filter(r => r.severity === "critical").length,
        issues: elementResults
      };
    });

    return {
      summary,
      overallScore,
      recommendations,
      detailedFindings,
      passedRules,
      failedRules
    };
  }
}

// Helper functions for validation rules

function getMinimumWallThickness(material: string): number {
  const minimumThickness: Record<string, number> = {
    "steel": 2.0,
    "aluminum": 3.0,
    "stainless": 2.0,
    "cast_iron": 4.0,
    "plastic": 1.5,
    "brass": 2.5
  };

  return minimumThickness[material] || minimumThickness["steel"];
}

function checkDetailedInterference(element1: EnhancedElement, element2: EnhancedElement): InterferenceResult {
  // Simplified interference detection - in production, use proper 3D geometry libraries
  const distance = Math.sqrt(
    Math.pow(element1.x - element2.x, 2) + Math.pow(element1.y - element2.y, 2) + Math.pow(element1.z - element2.z, 2)
  );

  const radius1 = getElementRadius(element1);
  const radius2 = getElementRadius(element2);
  const combinedRadius = radius1 + radius2;

  if (distance < combinedRadius * 0.5) {
    return {
      hasInterference: true,
      interferenceType: "complete",
      recommendedAction: "Relocate elements to eliminate interference"
    };
  } else if (distance < combinedRadius * 0.8) {
    return {
      hasInterference: true,
      interferenceType: "partial",
      recommendedAction: "Adjust positions to provide adequate clearance"
    };
  } else if (distance < combinedRadius * 1.1) {
    return {
      hasInterference: false,
      interferenceType: "clearance",
      minimumClearance: distance - combinedRadius,
      recommendedAction: "Verify clearance is adequate for application"
    };
  } else {
    return {
      hasInterference: false,
      interferenceType: "clearance",
      minimumClearance: distance - combinedRadius,
      recommendedAction: "Clearance is adequate"
    };
  }
}

function getElementRadius(element: EnhancedElement): number {
  if (element.radius) return element.radius;
  if (element.width && element.height) {
    return Math.max(element.width, element.height, element.depth || 0) / 2;
  }
  return 10; // Default radius
}

function getManufacturingConstraints(process: string): ManufacturingConstraint {
  return MANUFACTURING_CONSTRAINTS[process] || MANUFACTURING_CONSTRAINTS["machining"];
}

function getMinimumFeatureSize(element: EnhancedElement): number {
  const dimensions = [element.width, element.height, element.depth, element.radius].filter(
    dim => dim !== undefined && dim > 0
  ) as number[];

  return dimensions.length > 0 ? Math.min(...dimensions) : 1;
}

function getAspectRatio(element: EnhancedElement): number {
  const dimensions = [element.width || 1, element.height || 1, element.depth || 1];

  const maxDim = Math.max(...dimensions);
  const minDim = Math.min(...dimensions);

  return maxDim / minDim;
}

function parseToleranceValue(tolerance: string): number | null {
  const match = tolerance.match(/±(\d*\.?\d+)/);
  return match ? parseFloat(match[1]) : null;
}

function getAchievableTolerance(requestedTolerance: number, process: string): number {
  const capabilities: Record<string, number> = {
    "machining": 0.1,
    "precision_machining": 0.02,
    "casting": 0.5,
    "welding": 0.5,
    "additive_manufacturing": 0.2
  };

  return capabilities[process] || 0.1;
}

function validateISOTolerance(tolerance: string): boolean {
  // Simplified ISO tolerance validation
  const validPatterns = [
    /^[A-Z]\d+$/, // Hole tolerances (H7, H8, etc.)
    /^[a-z]\d+$/ // Shaft tolerances (h6, g6, etc.)
  ];

  return validPatterns.some(pattern => pattern.test(tolerance));
}

function calculateClearance(element1: EnhancedElement, element2: EnhancedElement): number {
  // Simplified clearance calculation
  const distance = Math.sqrt(
    Math.pow(element1.x - element2.x, 2) + Math.pow(element1.y - element2.y, 2) + Math.pow(element1.z - element2.z, 2)
  );

  const radius1 = getElementRadius(element1);
  const radius2 = getElementRadius(element2);

  return Math.max(0, distance - radius1 - radius2);
}

function calculateFastenerClearance(element: EnhancedElement, surroundingElements: EnhancedElement[]): number {
  // Simplified fastener clearance calculation
  if (surroundingElements.length === 0) return 50; // Plenty of clearance

  const clearances = surroundingElements.map(other => calculateClearance(element, other));
  return Math.min(...clearances);
}

function getMaterialProperties(material: string): any {
  // Simplified material properties lookup
  const properties: Record<string, any> = {
    "steel": { yieldStrength: 235, density: 7850 },
    "aluminum": { yieldStrength: 270, density: 2700 },
    "stainless": { yieldStrength: 310, density: 8000 }
  };

  return properties[material];
}
