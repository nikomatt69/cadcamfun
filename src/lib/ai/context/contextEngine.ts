/**
 * Context Engine for Engineering-Aware CAD Generation
 *
 * This module provides advanced context analysis capabilities for CAD generation,
 * incorporating engineering domain knowledge, load analysis, material selection,
 * and manufacturing constraints to generate context-aware design solutions.
 *
 * @module ContextEngine
 * @version 2.0.0
 */

import { DesignIntent } from "../ai-new/intentAnalyzer";

/**
 * Comprehensive engineering context interface
 */
export interface EngineeringContext {
  domain: "mechanical" | "structural" | "automotive" | "aerospace" | "manufacturing" | "marine" | "energy";
  application: string;
  loadConditions: LoadCondition[];
  environmentalFactors: EnvironmentalFactor[];
  manufacturingConstraints: ManufacturingConstraint[];
  standards: EngineeringStandard[];
  materials: MaterialSpecification[];
  toleranceClass: "precision" | "fine" | "medium" | "coarse" | "rough";
  qualityRequirements: QualityRequirement[];
  safetyFactors: SafetyFactor[];
  operationalParameters: OperationalParameter[];
  costConstraints?: CostConstraint[];
  timeConstraints?: TimeConstraint[];
}

/**
 * Load condition specification with detailed analysis
 */
export interface LoadCondition {
  type: "static" | "dynamic" | "fatigue" | "impact" | "thermal" | "pressure" | "torsional";
  magnitude: number;
  unit: string;
  direction: "axial" | "radial" | "torsional" | "bending" | "combined" | "hydrostatic";
  frequency?: number; // Hz for dynamic loads
  duration: "continuous" | "intermittent" | "cyclic" | "shock";
  safety_factor: number;
  loadCase: string;
  criticality: "critical" | "important" | "normal";
}

/**
 * Environmental factor specification
 */
export interface EnvironmentalFactor {
  type: "temperature" | "humidity" | "corrosion" | "vibration" | "contamination" | "radiation";
  severity: "mild" | "moderate" | "severe" | "extreme";
  specification: string;
  protectionRequired: string[];
  standards: string[];
}

/**
 * Manufacturing constraint specification
 */
export interface ManufacturingConstraint {
  process: string;
  capability: ProcessCapability;
  limitations: string[];
  recommendations: string[];
  costImpact: "low" | "medium" | "high";
  leadTime: number; // days
}

/**
 * Process capability specification
 */
export interface ProcessCapability {
  minFeatureSize: number;
  maxFeatureSize: number;
  toleranceCapability: string[];
  surfaceFinishCapability: string[];
  materialCompatibility: string[];
  complexityRating: "simple" | "moderate" | "complex" | "very_complex";
}

/**
 * Engineering standard specification
 */
export interface EngineeringStandard {
  name: string;
  type: "dimensional" | "material" | "safety" | "quality" | "environmental" | "testing";
  applicability: string;
  mandatory: boolean;
  references: string[];
}

/**
 * Material specification with comprehensive properties
 */
export interface MaterialSpecification {
  name: string;
  grade: string;
  properties: MaterialProperties;
  availability: "standard" | "special_order" | "custom";
  cost: "low" | "medium" | "high" | "very_high";
  sustainability: SustainabilityData;
  applications: string[];
  limitations: string[];
}

/**
 * Material properties interface
 */
export interface MaterialProperties {
  yield: number; // MPa
  ultimate: number; // MPa
  density: number; // kg/m³
  elasticModulus: number; // GPa
  poissonRatio: number;
  thermalExpansion: number; // μm/m°C
  thermalConductivity: number; // W/mK
  specificHeat: number; // J/kgK
  hardness: string;
  fatigue: number; // MPa at 10^6 cycles
  fractureToughness?: number; // MPa√m
  corrosionResistance: string;
  weldability: string;
  machinability: string;
}

/**
 * Sustainability data interface
 */
export interface SustainabilityData {
  recyclability: number; // 0-100%
  carbonFootprint: number; // kg CO2 eq/kg
  renewableContent: number; // 0-100%
  endOfLifeOptions: string[];
}

/**
 * Quality requirement specification
 */
export interface QualityRequirement {
  type: "dimensional" | "surface" | "material" | "functional" | "aesthetic";
  specification: string;
  inspectionMethod: string;
  acceptanceCriteria: string;
  documentationRequired: boolean;
}

/**
 * Safety factor specification
 */
export interface SafetyFactor {
  application: string;
  factor: number;
  basis: string;
  standard: string;
  loadType: string;
}

/**
 * Operational parameter specification
 */
export interface OperationalParameter {
  parameter: string;
  value: number | string;
  unit: string;
  tolerance: string;
  criticality: "critical" | "important" | "normal";
}

/**
 * Cost constraint specification
 */
export interface CostConstraint {
  type: "material" | "manufacturing" | "total";
  target: number;
  currency: string;
  basis: "per_unit" | "per_kg" | "total_project";
  flexibility: "fixed" | "preferred" | "flexible";
}

/**
 * Time constraint specification
 */
export interface TimeConstraint {
  type: "design" | "prototype" | "production" | "delivery";
  duration: number;
  unit: "days" | "weeks" | "months";
  criticality: "critical" | "important" | "normal";
}

/**
 * Advanced Context Engine with domain expertise
 */
export class ContextEngine {
  /**
   * Analyzes user description to extract comprehensive engineering context
   *
   * @param description - User's design description
   * @param existingElements - Current CAD elements for context
   * @param projectInfo - Additional project information
   * @returns Comprehensive engineering context
   */
  static analyzeUserDescription(
    description: string,
    existingElements: any[] = [],
    projectInfo: any = {}
  ): EngineeringContext {
    const domain = this.detectDomain(description, existingElements);
    const application = this.extractApplication(description);
    const loadConditions = this.extractLoadConditions(description);
    const environmentalFactors = this.extractEnvironmentalFactors(description);
    const manufacturingConstraints = this.extractManufacturingConstraints(description, domain);
    const standards = this.identifyApplicableStandards(description, domain);
    const materials = this.suggestMaterials(description, domain, loadConditions, environmentalFactors);
    const toleranceClass = this.determineTolerance(description, domain);
    const qualityRequirements = this.extractQualityRequirements(description);
    const safetyFactors = this.determineSafetyFactors(loadConditions, domain);
    const operationalParameters = this.extractOperationalParameters(description);

    return {
      domain,
      application,
      loadConditions,
      environmentalFactors,
      manufacturingConstraints,
      standards,
      materials,
      toleranceClass,
      qualityRequirements,
      safetyFactors,
      operationalParameters,
      costConstraints: this.extractCostConstraints(description, projectInfo),
      timeConstraints: this.extractTimeConstraints(description, projectInfo)
    };
  }

  /**
   * Detects engineering domain based on description and context
   */
  private static detectDomain(description: string, existingElements: any[]): EngineeringContext["domain"] {
    const lowerDesc = description.toLowerCase();

    // Analyze keywords for domain classification
    const domainKeywords = {
      mechanical: [
        "gear",
        "bearing",
        "shaft",
        "coupling",
        "motor",
        "pump",
        "valve",
        "actuator",
        "transmission",
        "gearbox",
        "clutch",
        "brake",
        "spring",
        "damper",
        "mechanism"
      ],
      structural: [
        "beam",
        "column",
        "truss",
        "frame",
        "support",
        "bracket",
        "foundation",
        "connection",
        "joint",
        "weld",
        "bolt",
        "load",
        "stress",
        "deflection"
      ],
      automotive: [
        "engine",
        "transmission",
        "brake",
        "suspension",
        "chassis",
        "body",
        "differential",
        "axle",
        "steering",
        "exhaust",
        "cooling",
        "fuel"
      ],
      aerospace: [
        "wing",
        "fuselage",
        "landing gear",
        "turbine",
        "rotor",
        "propeller",
        "avionics",
        "flight",
        "altitude",
        "pressure",
        "weight",
        "aerodynamic"
      ],
      manufacturing: [
        "fixture",
        "jig",
        "tooling",
        "mold",
        "die",
        "cutting tool",
        "workpiece",
        "setup",
        "clamping",
        "positioning",
        "machining",
        "assembly"
      ],
      marine: [
        "hull",
        "propeller",
        "rudder",
        "deck",
        "ballast",
        "anchor",
        "marine",
        "seawater",
        "corrosion",
        "salt",
        "wave",
        "pressure"
      ],
      energy: [
        "turbine",
        "generator",
        "solar",
        "wind",
        "nuclear",
        "power",
        "energy",
        "electrical",
        "thermal",
        "renewable",
        "efficiency",
        "grid"
      ]
    };

    // Score each domain
    const domainScores: Record<string, number> = {};
    Object.entries(domainKeywords).forEach(([domain, keywords]) => {
      domainScores[domain] = keywords.filter(keyword => lowerDesc.includes(keyword)).length;
    });

    // Add context from existing elements
    existingElements.forEach(element => {
      const elementType = element.type?.toLowerCase() || "";
      const elementName = element.name?.toLowerCase() || "";

      if (elementType === "cylinder" && elementName.includes("shaft")) {
        domainScores.mechanical = (domainScores.mechanical || 0) + 2;
      }
      if (elementType === "cube" && (element.width || 0) > 100) {
        domainScores.structural = (domainScores.structural || 0) + 1;
      }
    });

    // Return domain with highest score
    const topDomain = Object.entries(domainScores).reduce((a, b) =>
      domainScores[a[0]] > domainScores[b[0]] ? a : b
    )[0] as EngineeringContext["domain"];

    return topDomain || "mechanical";
  }

  /**
   * Extracts specific application from description
   */
  private static extractApplication(description: string): string {
    const applicationPatterns = [
      { pattern: /for (.+?) application/i, index: 1 },
      { pattern: /used in (.+?) systems?/i, index: 1 },
      { pattern: /designed for (.+?) environment/i, index: 1 },
      { pattern: /(.+?) component/i, index: 1 },
      { pattern: /(.+?) assembly/i, index: 1 }
    ];

    for (const { pattern, index } of applicationPatterns) {
      const match = description.match(pattern);
      if (match && match[index]) {
        return match[index].trim();
      }
    }

    return "General purpose application";
  }

  /**
   * Extracts load conditions from description
   */
  private static extractLoadConditions(description: string): LoadCondition[] {
    const conditions: LoadCondition[] = [];
    const lowerDesc = description.toLowerCase();

    // Load magnitude patterns
    const loadPatterns = [
      { pattern: /(\d+(?:\.\d+)?)\s*n(?:ewton)?s?\s+(?:load|force)/gi, unit: "N", type: "static" },
      { pattern: /(\d+(?:\.\d+)?)\s*kn\s+(?:load|force)/gi, unit: "kN", type: "static" },
      { pattern: /(\d+(?:\.\d+)?)\s*kg\s+(?:load|weight)/gi, unit: "kg", type: "static" },
      { pattern: /(\d+(?:\.\d+)?)\s*mpa\s+(?:stress|pressure)/gi, unit: "MPa", type: "static" },
      { pattern: /(\d+(?:\.\d+)?)\s*rpm/gi, unit: "RPM", type: "dynamic" },
      { pattern: /(\d+(?:\.\d+)?)\s*hz/gi, unit: "Hz", type: "dynamic" }
    ];

    loadPatterns.forEach(({ pattern, unit, type }) => {
      let match;
      while ((match = pattern.exec(description)) !== null) {
        const magnitude = parseFloat(match[1]);

        // Determine direction from context
        let direction: LoadCondition["direction"] = "axial";
        if (lowerDesc.includes("bending")) direction = "bending";
        else if (lowerDesc.includes("torsion") || lowerDesc.includes("twist")) direction = "torsional";
        else if (lowerDesc.includes("radial")) direction = "radial";

        // Determine safety factor
        let safety_factor = 2.0; // Default
        if (type === "dynamic") safety_factor = 4.0;
        if (lowerDesc.includes("critical") || lowerDesc.includes("safety")) safety_factor = 6.0;

        conditions.push({
          type: type as LoadCondition["type"],
          magnitude,
          unit,
          direction,
          duration: type === "dynamic" ? "continuous" : "intermittent",
          safety_factor,
          loadCase: `${type} ${unit} load`,
          criticality: lowerDesc.includes("critical") ? "critical" : "normal"
        });
      }
    });

    // Add default load condition if none found
    if (conditions.length === 0) {
      conditions.push({
        type: "static",
        magnitude: 1000,
        unit: "N",
        direction: "axial",
        duration: "continuous",
        safety_factor: 2.0,
        loadCase: "General service load",
        criticality: "normal"
      });
    }

    return conditions;
  }

  /**
   * Extracts environmental factors from description
   */
  private static extractEnvironmentalFactors(description: string): EnvironmentalFactor[] {
    const factors: EnvironmentalFactor[] = [];
    const lowerDesc = description.toLowerCase();

    const environmentalIndicators = {
      temperature: {
        keywords: ["temperature", "hot", "cold", "thermal", "heat", "cooling"],
        patterns: [/(-?\d+(?:\.\d+)?)\s*°?c/gi, /(-?\d+(?:\.\d+)?)\s*degrees?/gi]
      },
      corrosion: {
        keywords: ["corrosion", "rust", "oxidation", "salt", "seawater", "chemical", "acid"],
        patterns: [/salt\s+water/gi, /corrosive\s+environment/gi]
      },
      vibration: {
        keywords: ["vibration", "shake", "oscillation", "dynamic", "resonance"],
        patterns: [/(\d+(?:\.\d+)?)\s*hz\s+vibration/gi]
      },
      contamination: {
        keywords: ["dust", "dirt", "contamination", "particles", "clean", "sterile"],
        patterns: [/clean\s+room/gi, /sterile\s+environment/gi]
      }
    };

    Object.entries(environmentalIndicators).forEach(([factorType, { keywords, patterns }]) => {
      const hasKeyword = keywords.some(keyword => lowerDesc.includes(keyword));
      const hasPattern = patterns.some(pattern => pattern.test(description));

      if (hasKeyword || hasPattern) {
        let severity: EnvironmentalFactor["severity"] = "moderate";
        if (lowerDesc.includes("extreme") || lowerDesc.includes("severe")) severity = "severe";
        else if (lowerDesc.includes("mild") || lowerDesc.includes("light")) severity = "mild";

        factors.push({
          type: factorType as EnvironmentalFactor["type"],
          severity,
          specification: this.extractEnvironmentalSpec(description, factorType),
          protectionRequired: this.determineProtectionRequired(factorType, severity),
          standards: this.getEnvironmentalStandards(factorType)
        });
      }
    });

    return factors;
  }

  /**
   * Extracts manufacturing constraints from description and domain
   */
  private static extractManufacturingConstraints(
    description: string,
    domain: EngineeringContext["domain"]
  ): ManufacturingConstraint[] {
    const constraints: ManufacturingConstraint[] = [];
    const lowerDesc = description.toLowerCase();

    const processKeywords = {
      machining: ["machining", "milling", "turning", "drilling", "cnc"],
      casting: ["casting", "molding", "foundry", "sand casting", "investment casting"],
      welding: ["welding", "fabrication", "weld", "joint", "assembly"],
      forging: ["forging", "forged", "hot forming", "cold forming"],
      additive: ["3d printing", "additive", "printed", "layered", "selective laser"]
    };

    // Detect processes mentioned
    const detectedProcesses: string[] = [];
    Object.entries(processKeywords).forEach(([process, keywords]) => {
      if (keywords.some(keyword => lowerDesc.includes(keyword))) {
        detectedProcesses.push(process);
      }
    });

    // Add domain-typical processes if none detected
    if (detectedProcesses.length === 0) {
      switch (domain) {
        case "mechanical":
          detectedProcesses.push("machining");
          break;
        case "structural":
          detectedProcesses.push("welding", "machining");
          break;
        case "automotive":
          detectedProcesses.push("machining", "casting");
          break;
        case "aerospace":
          detectedProcesses.push("machining", "additive");
          break;
        default:
          detectedProcesses.push("machining");
      }
    }

    // Generate constraints for each process
    detectedProcesses.forEach(process => {
      constraints.push({
        process,
        capability: this.getProcessCapability(process),
        limitations: this.getProcessLimitations(process),
        recommendations: this.getProcessRecommendations(process, domain),
        costImpact: this.getProcessCostImpact(process),
        leadTime: this.getProcessLeadTime(process)
      });
    });

    return constraints;
  }

  /**
   * Identifies applicable engineering standards
   */
  private static identifyApplicableStandards(
    description: string,
    domain: EngineeringContext["domain"]
  ): EngineeringStandard[] {
    const standards: EngineeringStandard[] = [];
    const lowerDesc = description.toLowerCase();

    // Domain-specific standards
    const domainStandards = {
      mechanical: [
        { name: "ISO 286-1", type: "dimensional", applicability: "Tolerances and fits" },
        { name: "ISO 2768", type: "dimensional", applicability: "General tolerances" },
        { name: "ISO 4762", type: "dimensional", applicability: "Socket head cap screws" },
        { name: "ASME Y14.5", type: "dimensional", applicability: "GD&T specifications" }
      ],
      structural: [
        { name: "EN 1993", type: "material", applicability: "Steel structures design" },
        { name: "AISC 360", type: "material", applicability: "Steel construction" },
        { name: "AWS D1.1", type: "quality", applicability: "Structural welding" },
        { name: "ISO 5817", type: "quality", applicability: "Welding quality levels" }
      ],
      automotive: [
        { name: "ISO/TS 16949", type: "quality", applicability: "Automotive quality management" },
        { name: "SAE J403", type: "material", applicability: "Steel chemical compositions" },
        { name: "FMVSS", type: "safety", applicability: "Motor vehicle safety standards" }
      ],
      aerospace: [
        { name: "AS9100", type: "quality", applicability: "Aerospace quality management" },
        { name: "RTCA DO-160", type: "environmental", applicability: "Environmental conditions" },
        { name: "MIL-STD-810", type: "environmental", applicability: "Environmental test methods" }
      ]
    };

    // Add domain-specific standards
    const applicableStandards = domainStandards[domain as keyof typeof domainStandards] || domainStandards.mechanical;
    applicableStandards.forEach(standard => {
      standards.push({
        ...standard,
        mandatory: standard.type === "safety",
        references: [`${standard.name} - ${standard.applicability}`]
      } as EngineeringStandard);
    });

    // Add standards mentioned in description
    const mentionedStandards = ["ISO", "DIN", "ANSI", "ASME", "AWS", "ASTM", "BS", "JIS", "EN"];

    mentionedStandards.forEach(standardPrefix => {
      if (lowerDesc.includes(standardPrefix.toLowerCase())) {
        standards.push({
          name: `${standardPrefix} Referenced`,
          type: "dimensional",
          applicability: "User specified standard",
          mandatory: true,
          references: [`Referenced in user description`]
        });
      }
    });

    return standards;
  }

  /**
   * Suggests appropriate materials based on context
   */
  private static suggestMaterials(
    description: string,
    domain: EngineeringContext["domain"],
    loadConditions: LoadCondition[],
    environmentalFactors: EnvironmentalFactor[]
  ): MaterialSpecification[] {
    const materials: MaterialSpecification[] = [];

    // Base material selection by domain
    const domainMaterials = {
      mechanical: ["Steel S355JR", "Aluminum 6061-T6", "Stainless Steel 316L"],
      structural: ["Steel S235JR", "Steel S355JR", "Aluminum 6082-T6"],
      automotive: ["Steel HSLA", "Aluminum 5182", "Cast Iron"],
      aerospace: ["Aluminum 7075-T6", "Titanium Ti-6Al-4V", "Steel 4340"],
      manufacturing: ["Tool Steel D2", "Steel P20", "Hardened Steel"],
      marine: ["Stainless Steel 316L", "Aluminum 5083", "Bronze"],
      energy: ["Stainless Steel 347", "Inconel 625", "Steel P91"]
    };

    const suggestedMaterials = domainMaterials[domain] || domainMaterials.mechanical;

    // Refine based on load conditions
    const maxLoad = Math.max(...loadConditions.map(lc => lc.magnitude));
    const hasDynamicLoads = loadConditions.some(lc => lc.type === "dynamic" || lc.type === "fatigue");
    const hasHighTemp = environmentalFactors.some(ef => ef.type === "temperature" && ef.severity === "severe");
    const hasCorrosion = environmentalFactors.some(ef => ef.type === "corrosion");

    suggestedMaterials.forEach(materialName => {
      const material = this.getMaterialSpecification(materialName);

      // Check suitability
      let suitabilityScore = 100;

      if (maxLoad > material.properties.yield * 0.5) {
        suitabilityScore -= 20; // High stress application
      }

      if (hasDynamicLoads && material.properties.fatigue < maxLoad * 0.3) {
        suitabilityScore -= 30;
      }

      if (hasCorrosion && material.properties.corrosionResistance === "Poor") {
        suitabilityScore -= 40;
      }

      if (hasHighTemp && !materialName.includes("Stainless") && !materialName.includes("Titanium")) {
        suitabilityScore -= 25;
      }

      if (suitabilityScore > 50) {
        materials.push(material);
      }
    });

    return materials.slice(0, 5); // Top 5 materials
  }

  /**
   * Determines tolerance class based on description and domain
   */
  private static determineTolerance(
    description: string,
    domain: EngineeringContext["domain"]
  ): EngineeringContext["toleranceClass"] {
    const lowerDesc = description.toLowerCase();

    if (lowerDesc.includes("precision") || lowerDesc.includes("tight") || lowerDesc.includes("accurate")) {
      return "precision";
    }

    if (lowerDesc.includes("fine") || domain === "aerospace") {
      return "fine";
    }

    if (lowerDesc.includes("rough") || lowerDesc.includes("approximate")) {
      return "rough";
    }

    if (domain === "structural" || lowerDesc.includes("general")) {
      return "coarse";
    }

    return "medium"; // Default for most applications
  }

  /**
   * Extracts quality requirements from description
   */
  private static extractQualityRequirements(description: string): QualityRequirement[] {
    const requirements: QualityRequirement[] = [];
    const lowerDesc = description.toLowerCase();

    const qualityIndicators = {
      dimensional: ["tolerance", "dimension", "accuracy", "precision"],
      surface: ["finish", "roughness", "surface", "smooth"],
      material: ["strength", "hardness", "composition", "grade"],
      functional: ["performance", "operation", "function", "reliability"],
      aesthetic: ["appearance", "color", "finish", "visual"]
    };

    Object.entries(qualityIndicators).forEach(([type, keywords]) => {
      if (keywords.some(keyword => lowerDesc.includes(keyword))) {
        requirements.push({
          type: type as QualityRequirement["type"],
          specification: this.extractQualitySpec(description, type),
          inspectionMethod: this.getInspectionMethod(type),
          acceptanceCriteria: this.getAcceptanceCriteria(type),
          documentationRequired: type === "material" || lowerDesc.includes("certified")
        });
      }
    });

    return requirements;
  }

  /**
   * Determines safety factors based on load conditions and domain
   */
  private static determineSafetyFactors(
    loadConditions: LoadCondition[],
    domain: EngineeringContext["domain"]
  ): SafetyFactor[] {
    const factors: SafetyFactor[] = [];

    const domainFactors = {
      mechanical: { static: 2.0, dynamic: 4.0, fatigue: 6.0 },
      structural: { static: 2.5, dynamic: 4.0, fatigue: 8.0 },
      automotive: { static: 2.0, dynamic: 3.0, fatigue: 10.0 },
      aerospace: { static: 4.0, dynamic: 6.0, fatigue: 12.0 },
      manufacturing: { static: 3.0, dynamic: 5.0, fatigue: 8.0 }
    };

    const currentFactors = domainFactors[domain as keyof typeof domainFactors] || domainFactors.mechanical;

    loadConditions.forEach(condition => {
      const factorKey = condition.type === "static" ? "static" : condition.type === "dynamic" ? "dynamic" : "fatigue";

      factors.push({
        application: condition.loadCase,
        factor: currentFactors[factorKey as keyof typeof currentFactors],
        basis: `${domain} engineering practice`,
        standard: this.getSafetyStandard(domain),
        loadType: condition.type
      });
    });

    return factors;
  }

  /**
   * Extracts operational parameters from description
   */
  private static extractOperationalParameters(description: string): OperationalParameter[] {
    const parameters: OperationalParameter[] = [];

    const parameterPatterns = [
      {
        pattern: /(\d+(?:\.\d+)?)\s*rpm/gi,
        parameter: "Rotational Speed",
        unit: "RPM",
        tolerance: "±5%"
      },
      {
        pattern: /(\d+(?:\.\d+)?)\s*°c/gi,
        parameter: "Operating Temperature",
        unit: "°C",
        tolerance: "±5°C"
      },
      {
        pattern: /(\d+(?:\.\d+)?)\s*bar/gi,
        parameter: "Pressure",
        unit: "bar",
        tolerance: "±0.1 bar"
      },
      {
        pattern: /(\d+(?:\.\d+)?)\s*mm\/min/gi,
        parameter: "Feed Rate",
        unit: "mm/min",
        tolerance: "±10%"
      }
    ];

    parameterPatterns.forEach(({ pattern, parameter, unit, tolerance }) => {
      let match;
      while ((match = pattern.exec(description)) !== null) {
        parameters.push({
          parameter,
          value: parseFloat(match[1]),
          unit,
          tolerance,
          criticality: "normal"
        });
      }
    });

    return parameters;
  }

  /**
   * Generates enhanced prompt with comprehensive context
   */
  static generateEnhancedPromptWithContext(basePrompt: string, context: EngineeringContext): string {
    let enhancedPrompt = basePrompt;

    // Add engineering context header
    enhancedPrompt += `\n\n=== ENGINEERING CONTEXT ANALYSIS ===`;
    enhancedPrompt += `\nDomain: ${context.domain.toUpperCase()}`;
    enhancedPrompt += `\nApplication: ${context.application}`;
    enhancedPrompt += `\nTolerance Class: ${context.toleranceClass.toUpperCase()}`;

    // Add load conditions
    if (context.loadConditions.length > 0) {
      enhancedPrompt += `\n\nLOAD CONDITIONS:`;
      context.loadConditions.forEach((load, index) => {
        enhancedPrompt += `\n${index + 1}. ${load.type.toUpperCase()} LOAD: ${load.magnitude} ${load.unit}`;
        enhancedPrompt += `\n   - Direction: ${load.direction}`;
        enhancedPrompt += `\n   - Safety Factor: ${load.safety_factor}`;
        enhancedPrompt += `\n   - Criticality: ${load.criticality}`;
      });
    }

    // Add material recommendations
    if (context.materials.length > 0) {
      enhancedPrompt += `\n\nRECOMMENDED MATERIALS:`;
      context.materials.slice(0, 3).forEach((material, index) => {
        enhancedPrompt += `\n${index + 1}. ${material.name} (${material.grade})`;
        enhancedPrompt += `\n   - Yield Strength: ${material.properties.yield} MPa`;
        enhancedPrompt += `\n   - Density: ${material.properties.density} kg/m³`;
        enhancedPrompt += `\n   - Applications: ${material.applications.join(", ")}`;
      });
    }

    // Add manufacturing constraints
    if (context.manufacturingConstraints.length > 0) {
      enhancedPrompt += `\n\nMANUFACTURING CONSTRAINTS:`;
      context.manufacturingConstraints.forEach((constraint, index) => {
        enhancedPrompt += `\n${index + 1}. ${constraint.process.toUpperCase()}:`;
        enhancedPrompt += `\n   - Min Feature Size: ${constraint.capability.minFeatureSize}mm`;
        enhancedPrompt += `\n   - Tolerance Capability: ${constraint.capability.toleranceCapability.join(", ")}`;
        enhancedPrompt += `\n   - Surface Finish: ${constraint.capability.surfaceFinishCapability.join(", ")}`;
        enhancedPrompt += `\n   - Lead Time: ${constraint.leadTime} days`;
      });
    }

    // Add environmental factors
    if (context.environmentalFactors.length > 0) {
      enhancedPrompt += `\n\nENVIRONMENTAL FACTORS:`;
      context.environmentalFactors.forEach((factor, index) => {
        enhancedPrompt += `\n${index + 1}. ${factor.type.toUpperCase()}: ${factor.severity} severity`;
        enhancedPrompt += `\n   - Specification: ${factor.specification}`;
        enhancedPrompt += `\n   - Protection Required: ${factor.protectionRequired.join(", ")}`;
      });
    }

    // Add applicable standards
    if (context.standards.length > 0) {
      enhancedPrompt += `\n\nAPPLICABLE STANDARDS:`;
      context.standards.slice(0, 5).forEach((standard, index) => {
        const mandatory = standard.mandatory ? " (MANDATORY)" : " (Recommended)";
        enhancedPrompt += `\n${index + 1}. ${standard.name}${mandatory}`;
        enhancedPrompt += `\n   - ${standard.applicability}`;
      });
    }

    // Add design directives
    enhancedPrompt += `\n\n=== DESIGN DIRECTIVES ===`;
    enhancedPrompt += `\n- Apply ${context.toleranceClass} tolerance requirements throughout design`;
    enhancedPrompt += `\n- Ensure compatibility with ${context.manufacturingConstraints.map(c => c.process).join(" and ")} processes`;
    enhancedPrompt += `\n- Design for ${context.domain} engineering standards and best practices`;
    enhancedPrompt += `\n- Include appropriate safety margins based on criticality assessment`;
    enhancedPrompt += `\n- Consider full product lifecycle including maintenance and serviceability`;

    // Add quality requirements
    if (context.qualityRequirements.length > 0) {
      enhancedPrompt += `\n- Incorporate quality requirements: ${context.qualityRequirements.map(q => q.type).join(", ")}`;
    }

    enhancedPrompt += `\n\nGenerate CAD elements that fully comply with this comprehensive engineering context.`;

    return enhancedPrompt;
  }

  // Helper methods (simplified implementations)
  private static extractEnvironmentalSpec(description: string, factorType: string): string {
    // Simplified environmental specification extraction
    return `${factorType} environment as described in user requirements`;
  }

  private static determineProtectionRequired(factorType: string, severity: string): string[] {
    const protectionMap: Record<string, Record<string, string[]>> = {
      "corrosion": {
        "mild": ["coating"],
        "moderate": ["stainless steel", "coating"],
        "severe": ["stainless steel", "cathodic protection"],
        "extreme": ["exotic alloys", "environmental enclosure"]
      },
      "temperature": {
        "mild": ["standard materials"],
        "moderate": ["heat treatment"],
        "severe": ["high-temperature alloys"],
        "extreme": ["ceramic coatings", "cooling systems"]
      }
    };
    return protectionMap[factorType]?.[severity] || ["standard protection"];
  }

  private static getEnvironmentalStandards(factorType: string): string[] {
    const standardsMap: Record<string, string[]> = {
      "temperature": ["ISO 3205", "ASTM D648"],
      "corrosion": ["ISO 9223", "ASTM B117"],
      "vibration": ["ISO 2041", "MIL-STD-810"]
    };
    return standardsMap[factorType] || [];
  }

  private static getProcessCapability(process: string): ProcessCapability {
    const capabilities: Record<string, ProcessCapability> = {
      "machining": {
        minFeatureSize: 0.5,
        maxFeatureSize: 2000,
        toleranceCapability: ["±0.1", "±0.05", "H7", "h6"],
        surfaceFinishCapability: ["Ra 6.3", "Ra 3.2", "Ra 1.6"],
        materialCompatibility: ["steel", "aluminum", "stainless"],
        complexityRating: "moderate"
      },
      "casting": {
        minFeatureSize: 2.0,
        maxFeatureSize: 5000,
        toleranceCapability: ["±0.5", "±0.2", "IT11"],
        surfaceFinishCapability: ["Ra 25", "Ra 12.5"],
        materialCompatibility: ["cast_iron", "aluminum", "bronze"],
        complexityRating: "complex"
      }
    };
    return capabilities[process] || capabilities["machining"];
  }

  private static getProcessLimitations(process: string): string[] {
    const limitations: Record<string, string[]> = {
      "machining": ["Limited complex internal geometries", "Tool access requirements"],
      "casting": ["Draft angles required", "Undercuts difficult"],
      "welding": ["Distortion possible", "Heat affected zones"],
      "additive": ["Layer resolution limits", "Support structures needed"]
    };
    return limitations[process] || [];
  }

  private static getProcessRecommendations(process: string, domain: string): string[] {
    return [`Optimize design for ${process}`, `Consider ${domain} best practices`];
  }

  private static getProcessCostImpact(process: string): "low" | "medium" | "high" {
    const costMap: Record<string, "low" | "medium" | "high"> = {
      "machining": "medium",
      "casting": "low",
      "welding": "low",
      "additive": "high"
    };
    return costMap[process] || "medium";
  }

  private static getProcessLeadTime(process: string): number {
    const leadTimes: Record<string, number> = {
      "machining": 5,
      "casting": 15,
      "welding": 3,
      "additive": 2
    };
    return leadTimes[process] || 7;
  }

  private static getMaterialSpecification(materialName: string): MaterialSpecification {
    // Simplified material specification - in production, use comprehensive database
    const baseSpec: MaterialSpecification = {
      name: materialName,
      grade: "Standard",
      properties: {
        yield: 235,
        ultimate: 360,
        density: 7850,
        elasticModulus: 200,
        poissonRatio: 0.3,
        thermalExpansion: 11.5,
        thermalConductivity: 50,
        specificHeat: 460,
        hardness: "HB 120",
        fatigue: 180,
        corrosionResistance: "Fair",
        weldability: "Good",
        machinability: "Good"
      },
      availability: "standard",
      cost: "medium",
      sustainability: {
        recyclability: 95,
        carbonFootprint: 2.5,
        renewableContent: 0,
        endOfLifeOptions: ["recycling", "reuse"]
      },
      applications: ["General engineering"],
      limitations: ["Corrosion in wet environments"]
    };

    // Customize based on material name
    if (materialName.includes("Aluminum")) {
      baseSpec.properties.density = 2700;
      baseSpec.properties.yield = 270;
      baseSpec.properties.corrosionResistance = "Good";
    }

    if (materialName.includes("Stainless")) {
      baseSpec.properties.yield = 310;
      baseSpec.properties.corrosionResistance = "Excellent";
      baseSpec.cost = "high";
    }

    return baseSpec;
  }

  private static extractQualitySpec(description: string, type: string): string {
    return `${type} quality as specified in user requirements`;
  }

  private static getInspectionMethod(type: string): string {
    const methods: Record<string, string> = {
      "dimensional": "CMM measurement",
      "surface": "Surface roughness tester",
      "material": "Material testing certificate",
      "functional": "Performance testing",
      "aesthetic": "Visual inspection"
    };
    return methods[type] || "Standard inspection";
  }

  private static getAcceptanceCriteria(type: string): string {
    const criteria: Record<string, string> = {
      "dimensional": "Within specified tolerances",
      "surface": "Ra values per specification",
      "material": "Certified material properties",
      "functional": "Meets performance requirements",
      "aesthetic": "Acceptable appearance per standards"
    };
    return criteria[type] || "Per engineering specification";
  }

  private static getSafetyStandard(domain: string): string {
    const standards: Record<string, string> = {
      "mechanical": "ISO 12100",
      "structural": "EN 1990",
      "automotive": "ISO 26262",
      "aerospace": "SAE ARP4761"
    };
    return standards[domain] || "ISO 12100";
  }

  private static extractCostConstraints(description: string, projectInfo: any): CostConstraint[] | undefined {
    // Simplified cost constraint extraction
    return undefined;
  }

  private static extractTimeConstraints(description: string, projectInfo: any): TimeConstraint[] | undefined {
    // Simplified time constraint extraction
    return undefined;
  }
}
