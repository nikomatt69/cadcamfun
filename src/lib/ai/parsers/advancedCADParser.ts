/**
 * Advanced CAD Parser for Precision Engineering Applications
 *
 * This module provides sophisticated parsing capabilities for CAD element generation
 * with engineering validation, geometric analysis, and manufacturing feasibility assessment.
 * The parser transforms AI-generated content into validated, engineering-compliant CAD elements.
 *
 * @module AdvancedCADParser
 * @version 2.0.0
 */

import { Element } from "@/src/store/elementsStore";
import { v4 as uuidv4 } from "uuid";

/**
 * Validation result interface for geometric and engineering validation
 */
export interface ValidationResult {
  elementId: string;
  type:
    | "dimension_warning"
    | "geometry_error"
    | "manufacturing_error"
    | "interference_error"
    | "material_warning"
    | "tolerance_error";
  message: string;
  severity: "critical" | "warning" | "suggestion";
  suggestedFix: string;
  affectedProperty?: string;
  recommendedValue?: any;
}

/**
 * Engineering properties interface for enhanced CAD elements
 */
export interface EngineeringProperties {
  tolerance: string;
  surfaceFinish: string;
  material: string;
  materialProperties?: MaterialProperties;
  manufacturingProcess: string[];
  criticalDimensions: string[];
  heatTreatment?: string;
  standardReferences?: string[];
  qualityClass?: string;
}

/**
 * Material properties interface with mechanical characteristics
 */
export interface MaterialProperties {
  density: number; // kg/m³
  elasticModulus: number; // MPa
  yieldStrength: number; // MPa
  ultimateStrength: number; // MPa
  poissonRatio: number;
  thermalExpansion: number; // μm/m°C
  thermalConductivity: number; // W/mK
  hardness?: string; // HRC, HB, etc.
}

/**
 * Enhanced CAD element interface extending base Element with engineering data
 */
export interface EnhancedElement extends Element {
  engineeringProperties?: EngineeringProperties;
  componentInfo?: {
    standardComponent?: string;
    variant?: string;
    standard?: string;
    specifications?: any;
  };
  assemblyInfo?: {
    relationships?: any[];
    fasteners?: any[];
  };
  validationStatus?: "valid" | "warning" | "error";
  validationMessages?: string[];
}

/**
 * Advanced CAD Parser with engineering validation and enhancement capabilities
 */
export class AdvancedCADParser {
  /**
   * Standard metric dimensions based on preferred number series (ISO 3)
   * These dimensions are optimized for manufacturing and tooling availability
   */
  private static readonly STANDARD_DIMENSIONS = [
    1, 1.2, 1.6, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200
  ];

  /**
   * Engineering material database with verified mechanical properties
   * Properties sourced from engineering handbooks and material standards
   */
  private static readonly MATERIAL_PROPERTIES: Record<string, MaterialProperties> = {
    "steel": {
      density: 7850,
      elasticModulus: 200000,
      yieldStrength: 235,
      ultimateStrength: 360,
      poissonRatio: 0.3,
      thermalExpansion: 11.5,
      thermalConductivity: 50,
      hardness: "HB 120"
    },
    "steel_s355": {
      density: 7850,
      elasticModulus: 200000,
      yieldStrength: 355,
      ultimateStrength: 510,
      poissonRatio: 0.3,
      thermalExpansion: 11.5,
      thermalConductivity: 50,
      hardness: "HB 150"
    },
    "aluminum": {
      density: 2700,
      elasticModulus: 70000,
      yieldStrength: 270,
      ultimateStrength: 310,
      poissonRatio: 0.33,
      thermalExpansion: 23.0,
      thermalConductivity: 167,
      hardness: "HB 95"
    },
    "aluminum_6061_t6": {
      density: 2700,
      elasticModulus: 69000,
      yieldStrength: 270,
      ultimateStrength: 310,
      poissonRatio: 0.33,
      thermalExpansion: 23.6,
      thermalConductivity: 167,
      hardness: "HB 95"
    },
    "stainless": {
      density: 8000,
      elasticModulus: 200000,
      yieldStrength: 310,
      ultimateStrength: 620,
      poissonRatio: 0.3,
      thermalExpansion: 17.0,
      thermalConductivity: 16,
      hardness: "HB 170"
    },
    "stainless_316l": {
      density: 8000,
      elasticModulus: 200000,
      yieldStrength: 310,
      ultimateStrength: 580,
      poissonRatio: 0.3,
      thermalExpansion: 16.0,
      thermalConductivity: 16,
      hardness: "HB 170"
    },
    "cast_iron": {
      density: 7200,
      elasticModulus: 100000,
      yieldStrength: 250,
      ultimateStrength: 350,
      poissonRatio: 0.27,
      thermalExpansion: 10.5,
      thermalConductivity: 52,
      hardness: "HB 180"
    },
    "brass": {
      density: 8500,
      elasticModulus: 105000,
      yieldStrength: 200,
      ultimateStrength: 380,
      poissonRatio: 0.34,
      thermalExpansion: 20.0,
      thermalConductivity: 120,
      hardness: "HB 60"
    }
  };

  /**
   * Standard tolerance classes based on ISO 286
   */
  private static readonly STANDARD_TOLERANCES = {
    "fine": ["±0.005", "±0.01", "H6", "g5", "h5"],
    "medium": ["±0.05", "±0.1", "H7", "g6", "h6"],
    "coarse": ["±0.2", "±0.5", "H8", "g7", "h7"]
  };

  /**
   * Parses AI-generated CAD response with comprehensive validation and enhancement
   *
   * @param response - Raw text response from AI model
   * @returns Enhanced parsing result with validation data
   */
  static async parseCADResponse(response: string): Promise<{
    elements: EnhancedElement[];
    validationResults: ValidationResult[];
    warnings: string[];
    suggestions: string[];
  }> {
    try {
      // Extract and parse base elements from response
      const baseElements = await this.extractElements(response);

      // Enhance elements with engineering properties
      const enhancedElements = await this.enhanceElementsWithEngineering(baseElements);

      // Perform comprehensive validation
      const validationResults = await this.validateGeometry(enhancedElements);

      // Generate actionable warnings and suggestions
      const warnings = await this.generateWarnings(enhancedElements, validationResults);
      const suggestions = await this.generateSuggestions(enhancedElements, validationResults);

      return {
        elements: enhancedElements,
        validationResults,
        warnings,
        suggestions
      };
    } catch (error) {
      console.error("Advanced CAD parsing failed:", error);
      throw new Error(`CAD parsing error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  /**
   * Extracts CAD elements from AI response text with multiple parsing strategies
   */
  private static async extractElements(response: string): Promise<Element[]> {
    // Strategy 1: Look for JSON code blocks
    const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/) || response.match(/```\n([\s\S]*?)\n```/);

    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch (error) {
        console.warn("JSON code block parsing failed, trying direct JSON extraction");
      }
    }

    // Strategy 2: Look for direct JSON arrays
    const directJsonMatch = response.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (directJsonMatch) {
      try {
        const parsed = JSON.parse(directJsonMatch[0]);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch (error) {
        console.warn("Direct JSON parsing failed, trying object extraction");
      }
    }

    // Strategy 3: Extract individual objects
    const objectMatches = response.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g);
    if (objectMatches) {
      const elements: Element[] = [];
      for (const match of objectMatches) {
        try {
          const parsed = JSON.parse(match);
          if (parsed.type) {
            // Basic validation for CAD element
            elements.push(parsed);
          }
        } catch (error) {
          console.warn("Individual object parsing failed:", match);
        }
      }
      if (elements.length > 0) return elements;
    }

    throw new Error("No valid CAD elements found in response");
  }

  /**
   * Enhances base elements with engineering properties and standardization
   */
  private static async enhanceElementsWithEngineering(elements: Element[]): Promise<EnhancedElement[]> {
    return elements.map(element => this.enhanceIndividualElement(element));
  }

  /**
   * Enhances individual element with engineering properties
   */
  private static enhanceIndividualElement(element: Element): EnhancedElement {
    // Normalize dimensions to standard values
    const normalizedElement = this.normalizeDimensions(element);

    // Determine appropriate material if not specified
    const material = this.determineMaterial(normalizedElement);

    // Generate engineering properties
    const engineeringProperties: EngineeringProperties = {
      tolerance: this.determineTolerance(normalizedElement),
      surfaceFinish: this.determineSurfaceFinish(normalizedElement),
      material: material,
      materialProperties: this.MATERIAL_PROPERTIES[material],
      manufacturingProcess: this.determineManufacturingProcess(normalizedElement, material),
      criticalDimensions: this.identifyCriticalDimensions(normalizedElement),
      standardReferences: this.identifyApplicableStandards(normalizedElement),
      qualityClass: this.determineQualityClass(normalizedElement)
    };

    // Add heat treatment if required
    if (material.includes("steel") && this.requiresHeatTreatment(normalizedElement)) {
      engineeringProperties.heatTreatment = "Normalize and temper to HB 180-220";
    }

    return {
      ...normalizedElement,
      id: normalizedElement.id || uuidv4(),
      engineeringProperties,
      validationStatus: "valid"
    };
  }

  /**
   * Normalizes element dimensions to standard metric values
   */
  private static normalizeDimensions(element: Element): Element {
    const normalized = { ...element };

    if (normalized.width) normalized.width = this.normalizeToStandard(normalized.width);
    if (normalized.height) normalized.height = this.normalizeToStandard(normalized.height);
    if (normalized.depth) normalized.depth = this.normalizeToStandard(normalized.depth);
    if (normalized.radius) normalized.radius = this.normalizeToStandard(normalized.radius);

    return normalized;
  }

  /**
   * Normalizes a dimension to the nearest standard value
   */
  private static normalizeToStandard(dimension: number): number {
    return this.STANDARD_DIMENSIONS.reduce((prev, curr) =>
      Math.abs(curr - dimension) < Math.abs(prev - dimension) ? curr : prev
    );
  }

  /**
   * Determines appropriate material based on element characteristics
   */
  private static determineMaterial(element: Element): string {
    // Use existing material if specified and valid
    if (element.material && this.MATERIAL_PROPERTIES[element.material]) {
      return element.material;
    }

    // Determine material based on application hints
    const elementType = element.type?.toLowerCase() || "";
    const elementName = element.name?.toLowerCase() || "";

    if (elementName.includes("bearing") || elementName.includes("shaft")) {
      return "steel_s355";
    }

    if (elementName.includes("housing") || elementName.includes("bracket")) {
      return "aluminum_6061_t6";
    }

    if (elementType === "cylinder" && (element.radius || 0) < 5) {
      return "steel"; // Small cylinders likely fasteners
    }

    if (elementType === "cube" && Math.max(element.width || 0, element.height || 0) > 100) {
      return "aluminum"; // Large structural elements
    }

    // Default to general purpose steel
    return "steel";
  }

  /**
   * Determines appropriate tolerance based on element function and size
   */
  private static determineTolerance(element: Element): string {
    const maxDimension = Math.max(
      element.width || 0,
      element.height || 0,
      element.depth || 0,
      (element.radius || 0) * 2
    );

    // Fine tolerance for small precision parts
    if (maxDimension < 20) {
      return "±0.02";
    }

    // Medium tolerance for general machining
    if (maxDimension < 100) {
      return "±0.1";
    }

    // Coarse tolerance for large structural parts
    return "±0.5";
  }

  /**
   * Determines surface finish requirements based on element function
   */
  private static determineSurfaceFinish(element: Element): string {
    const elementName = element.name?.toLowerCase() || "";
    const elementType = element.type?.toLowerCase() || "";

    if (elementName.includes("bearing") || elementName.includes("shaft")) {
      return "Ra 0.8";
    }

    if (elementType === "cylinder" && (element.radius || 0) < 10) {
      return "Ra 1.6"; // Likely precision component
    }

    return "Ra 3.2"; // General machining finish
  }

  /**
   * Determines manufacturing processes based on element geometry and material
   */
  private static determineManufacturingProcess(element: Element, material: string): string[] {
    const processes: string[] = [];
    const maxDimension = Math.max(element.width || 0, element.height || 0, element.depth || 0);

    // Primary manufacturing process
    if (element.type === "cylinder" && (element.radius || 0) < 5) {
      processes.push("machining", "turning");
    } else if (maxDimension > 200 && material.includes("steel")) {
      processes.push("welding", "cutting");
    } else if (maxDimension < 50) {
      processes.push("machining", "milling");
    } else {
      processes.push("machining");
    }

    // Secondary processes
    if (material.includes("steel")) {
      processes.push("heat_treatment");
    }

    if (element.name?.toLowerCase().includes("precision")) {
      processes.push("grinding", "inspection");
    }

    return processes;
  }

  /**
   * Identifies critical dimensions that require tight tolerances
   */
  private static identifyCriticalDimensions(element: Element): string[] {
    const critical: string[] = [];

    if (element.type === "cylinder" && element.radius) {
      critical.push(`diameter: Ø${element.radius * 2} H7`);
      if (element.height) {
        critical.push(`length: ${element.height} ±0.1`);
      }
    }

    if (element.type === "cube") {
      if (element.width) critical.push(`width: ${element.width} ±0.1`);
      if (element.height) critical.push(`height: ${element.height} ±0.1`);
      if (element.depth) critical.push(`depth: ${element.depth} ±0.1`);
    }

    return critical;
  }

  /**
   * Identifies applicable engineering standards
   */
  private static identifyApplicableStandards(element: Element): string[] {
    const standards: string[] = [];
    const elementName = element.name?.toLowerCase() || "";

    if (elementName.includes("bolt") || elementName.includes("screw")) {
      standards.push("ISO 4762", "DIN 912");
    }

    if (elementName.includes("bearing")) {
      standards.push("ISO 15:2011", "ABEC-1");
    }

    if (element.type === "cube" && (element.width || 0) > 100) {
      standards.push("ISO 2768-m"); // General tolerances
    }

    return standards;
  }

  /**
   * Determines quality class based on application requirements
   */
  private static determineQualityClass(element: Element): string {
    const maxDimension = Math.max(element.width || 0, element.height || 0, element.depth || 0);

    if (element.name?.toLowerCase().includes("precision") || maxDimension < 20) {
      return "Class 1"; // High precision
    }

    if (maxDimension < 100) {
      return "Class 2"; // Standard precision
    }

    return "Class 3"; // General purpose
  }

  /**
   * Determines if heat treatment is required
   */
  private static requiresHeatTreatment(element: Element): boolean {
    const elementName = element.name?.toLowerCase() || "";
    return (
      elementName.includes("shaft") ||
      elementName.includes("gear") ||
      elementName.includes("tool") ||
      (element.type === "cylinder" && (element.radius || 0) > 10)
    );
  }

  /**
   * Validates element geometry with comprehensive engineering analysis
   */
  private static async validateGeometry(elements: EnhancedElement[]): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    for (const element of elements) {
      // Dimensional validation
      results.push(...this.validateDimensions(element));

      // Material compatibility validation
      results.push(...this.validateMaterial(element));

      // Manufacturing feasibility validation
      results.push(...this.validateManufacturing(element));

      // Tolerance validation
      results.push(...this.validateTolerances(element));
    }

    // Cross-element validation (interference, compatibility)
    results.push(...this.validateElementInteractions(elements));

    return results;
  }

  /**
   * Validates element dimensions for manufacturing feasibility
   */
  private static validateDimensions(element: EnhancedElement): ValidationResult[] {
    const results: ValidationResult[] = [];

    // Minimum dimension validation
    const minDimensions = { width: 1, height: 1, depth: 1, radius: 0.5 };

    Object.entries(minDimensions).forEach(([property, minValue]) => {
      const elementValue = element[property as keyof Element] as number;
      if (elementValue && elementValue < minValue) {
        results.push({
          elementId: element.id,
          type: "dimension_warning",
          message: `${property} ${elementValue}mm is below minimum manufacturing capability (${minValue}mm)`,
          severity: "warning",
          suggestedFix: `Increase ${property} to minimum ${minValue}mm`,
          affectedProperty: property,
          recommendedValue: minValue
        });
      }
    });

    // Aspect ratio validation
    if (element.type === "cube" && element.width && element.height) {
      const aspectRatio = element.width / element.height;
      if (aspectRatio > 20 || aspectRatio < 0.05) {
        results.push({
          elementId: element.id,
          type: "geometry_error",
          message: `Extreme aspect ratio ${aspectRatio.toFixed(2)} may cause manufacturing issues`,
          severity: "warning",
          suggestedFix: "Consider adding ribs or changing proportions for structural stability",
          affectedProperty: "aspect_ratio",
          recommendedValue: "Between 0.1 and 10"
        });
      }
    }

    // Wall thickness validation for hollow parts
    if (element.type === "cylinder" && element.radius && element.height) {
      const wallThickness = element.radius * 0.1; // Assume 10% wall thickness
      if (wallThickness < 2) {
        results.push({
          elementId: element.id,
          type: "manufacturing_error",
          message: `Estimated wall thickness ${wallThickness.toFixed(1)}mm is below minimum (2mm)`,
          severity: "critical",
          suggestedFix: "Increase outer diameter or reduce inner diameter to achieve minimum wall thickness",
          affectedProperty: "wall_thickness",
          recommendedValue: 2
        });
      }
    }

    return results;
  }

  /**
   * Validates material selection and properties
   */
  private static validateMaterial(element: EnhancedElement): ValidationResult[] {
    const results: ValidationResult[] = [];

    if (!element.engineeringProperties?.material) {
      results.push({
        elementId: element.id,
        type: "material_warning",
        message: "No material specified, using default steel",
        severity: "warning",
        suggestedFix: "Specify appropriate material for application",
        affectedProperty: "material",
        recommendedValue: "steel"
      });
      return results;
    }

    const material = element.engineeringProperties.material;
    const materialProperties = this.MATERIAL_PROPERTIES[material];

    if (!materialProperties) {
      results.push({
        elementId: element.id,
        type: "material_warning",
        message: `Material '${material}' not found in database`,
        severity: "warning",
        suggestedFix: "Use standard engineering material with verified properties",
        affectedProperty: "material",
        recommendedValue: "steel"
      });
    }

    return results;
  }

  /**
   * Validates manufacturing process compatibility
   */
  private static validateManufacturing(element: EnhancedElement): ValidationResult[] {
    const results: ValidationResult[] = [];
    const processes = element.engineeringProperties?.manufacturingProcess || [];

    // Validate process compatibility with geometry
    if (processes.includes("machining")) {
      const minFeatureSize = Math.min(
        element.width || Infinity,
        element.height || Infinity,
        element.depth || Infinity,
        element.radius || Infinity
      );

      if (minFeatureSize < 0.5) {
        results.push({
          elementId: element.id,
          type: "manufacturing_error",
          message: `Feature size ${minFeatureSize}mm is below machining capability (0.5mm)`,
          severity: "critical",
          suggestedFix: "Increase minimum feature size or consider alternative manufacturing process",
          affectedProperty: "manufacturing_process",
          recommendedValue: "Consider EDM or micro-machining for small features"
        });
      }
    }

    return results;
  }

  /**
   * Validates tolerance specifications
   */
  private static validateTolerances(element: EnhancedElement): ValidationResult[] {
    const results: ValidationResult[] = [];
    const tolerance = element.engineeringProperties?.tolerance;

    if (!tolerance) {
      results.push({
        elementId: element.id,
        type: "tolerance_error",
        message: "No tolerance specification found",
        severity: "warning",
        suggestedFix: "Specify appropriate tolerance for manufacturing",
        affectedProperty: "tolerance",
        recommendedValue: "±0.1"
      });
    }

    return results;
  }

  /**
   * Validates interactions between multiple elements
   */
  private static validateElementInteractions(elements: EnhancedElement[]): ValidationResult[] {
    const results: ValidationResult[] = [];

    // Check for element interference
    for (let i = 0; i < elements.length; i++) {
      for (let j = i + 1; j < elements.length; j++) {
        const interference = this.checkInterference(elements[i], elements[j]);
        if (interference.hasInterference) {
          results.push({
            elementId: elements[i].id,
            type: "interference_error",
            message: `Element interferes with ${elements[j].id}`,
            severity: "critical",
            suggestedFix: "Adjust positions to eliminate interference or verify intentional assembly",
            affectedProperty: "position"
          });
        }
      }
    }

    return results;
  }

  /**
   * Checks for geometric interference between two elements
   */
  private static checkInterference(
    element1: EnhancedElement,
    element2: EnhancedElement
  ): {
    hasInterference: boolean;
    overlapVolume?: number;
  } {
    // Simplified interference check for basic shapes
    if (element1.type === "cube" && element2.type === "cube") {
      const box1 = this.getElementBoundingBox(element1);
      const box2 = this.getElementBoundingBox(element2);

      const hasInterference =
        box1.min.x < box2.max.x &&
        box1.max.x > box2.min.x &&
        box1.min.y < box2.max.y &&
        box1.max.y > box2.min.y &&
        box1.min.z < box2.max.z &&
        box1.max.z > box2.min.z;

      return { hasInterference };
    }

    // For other shapes, use distance-based approximation
    const distance = Math.sqrt(
      Math.pow(element1.x - element2.x, 2) + Math.pow(element1.y - element2.y, 2) + Math.pow(element1.z - element2.z, 2)
    );

    const radius1 = Math.max(element1.width || 0, element1.height || 0, element1.depth || 0) / 2;
    const radius2 = Math.max(element2.width || 0, element2.height || 0, element2.depth || 0) / 2;

    return { hasInterference: distance < radius1 + radius2 };
  }

  /**
   * Calculates bounding box for an element
   */
  private static getElementBoundingBox(element: Element) {
    const halfWidth = (element.width || 0) / 2;
    const halfHeight = (element.height || 0) / 2;
    const halfDepth = (element.depth || 0) / 2;

    return {
      min: {
        x: element.x - halfWidth,
        y: element.y - halfHeight,
        z: element.z - halfDepth
      },
      max: {
        x: element.x + halfWidth,
        y: element.y + halfHeight,
        z: element.z + halfDepth
      }
    };
  }

  /**
   * Generates actionable warnings from validation results
   */
  private static async generateWarnings(
    elements: EnhancedElement[],
    validationResults: ValidationResult[]
  ): Promise<string[]> {
    const warnings: string[] = [];

    const criticalCount = validationResults.filter(r => r.severity === "critical").length;
    const warningCount = validationResults.filter(r => r.severity === "warning").length;

    if (criticalCount > 0) {
      warnings.push(`${criticalCount} critical issues found that may prevent manufacturing`);
    }

    if (warningCount > 0) {
      warnings.push(`${warningCount} warnings found that may affect quality or cost`);
    }

    // Material consistency warning
    const materials = Array.from(new Set(elements.map(e => e.engineeringProperties?.material).filter(Boolean)));
    if (materials.length > 3) {
      warnings.push(`Using ${materials.length} different materials may increase assembly complexity`);
    }

    return warnings;
  }

  /**
   * Generates improvement suggestions based on analysis
   */
  private static async generateSuggestions(
    elements: EnhancedElement[],
    validationResults: ValidationResult[]
  ): Promise<string[]> {
    const suggestions: string[] = [];

    // Standardization suggestions
    const nonStandardDims = validationResults.filter(r => r.type === "dimension_warning").length;
    if (nonStandardDims > 0) {
      suggestions.push("Consider using standard metric dimensions for better tooling availability");
    }

    // Material optimization suggestions
    const steelElements = elements.filter(e => e.engineeringProperties?.material?.includes("steel")).length;
    const aluminumElements = elements.filter(e => e.engineeringProperties?.material?.includes("aluminum")).length;

    if (steelElements > 0 && aluminumElements > 0) {
      suggestions.push("Mixed steel and aluminum assembly requires galvanic corrosion prevention measures");
    }

    // Manufacturing optimization suggestions
    const machiningElements = elements.filter(e =>
      e.engineeringProperties?.manufacturingProcess?.includes("machining")
    ).length;

    if (machiningElements > elements.length * 0.8) {
      suggestions.push("Consider consolidating parts to reduce machining operations and assembly time");
    }

    return suggestions;
  }
}
