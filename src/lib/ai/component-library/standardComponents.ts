/**
 * Standard Component Library for Engineering CAD Applications
 *
 * This module provides a comprehensive library of standard engineering components
 * with verified specifications, dimensional data, and application guidelines.
 * Components are sourced from international standards and industry best practices.
 *
 * @module StandardComponents
 * @version 2.0.0
 */

import { Element } from "@/src/store/elementsStore";
import { v4 as uuidv4 } from "uuid";

/**
 * Standard component interface with comprehensive specifications
 */
export interface StandardComponent {
  id: string;
  name: string;
  category: "fastener" | "bearing" | "gear" | "structural" | "hydraulic" | "sealing" | "electrical";
  standard: string;
  description: string;
  variants: ComponentVariant[];
  defaultProperties: ElementProperties;
  constraints: GeometricConstraint[];
  applications: string[];
  manufacturer?: string;
  certifications?: string[];
}

/**
 * Component variant with specific dimensional and material specifications
 */
export interface ComponentVariant {
  size: string;
  dimensions: Record<string, number>;
  material: string;
  weight: number;
  description: string;
  partNumber?: string;
  cost?: number;
  availability?: "standard" | "special_order" | "custom";
  leadTime?: number; // days
}

/**
 * Element properties specific to standard components
 */
export interface ElementProperties {
  color: string;
  material: string;
  surfaceFinish: string;
  tolerance?: string;
  strength?: string;
  temperature?: string;
  corrosionResistance?: string;
}

/**
 * Geometric constraints for component integration
 */
export interface GeometricConstraint {
  type: "clearance_hole" | "interference_fit" | "transition_fit" | "shaft_fit" | "housing_fit" | "thread_engagement";
  value: number | string;
  description: string;
  tolerance?: string;
  referenceStandard?: string;
}

/**
 * Comprehensive library of standard engineering components
 * Based on international standards including ISO, DIN, ANSI, and JIS
 */
export const STANDARD_COMPONENTS: StandardComponent[] = [
  {
    id: "hex_bolt_iso4762",
    name: "Socket Head Cap Screw",
    category: "fastener",
    standard: "ISO 4762",
    description: "High-strength socket head cap screw with hexagonal socket drive",
    applications: ["Machine assembly", "Precision fixtures", "High-stress applications"],
    variants: [
      {
        size: "M6x20",
        dimensions: {
          diameter: 6,
          length: 20,
          headDiameter: 10,
          headHeight: 6,
          socketSize: 5,
          threadPitch: 1.0
        },
        material: "Steel 12.9",
        weight: 0.015,
        description: "M6×20 socket head cap screw, steel grade 12.9",
        partNumber: "ISO4762-M6x20-12.9",
        availability: "standard",
        leadTime: 1
      },
      {
        size: "M8x25",
        dimensions: {
          diameter: 8,
          length: 25,
          headDiameter: 13,
          headHeight: 8,
          socketSize: 6,
          threadPitch: 1.25
        },
        material: "Steel 12.9",
        weight: 0.035,
        description: "M8×25 socket head cap screw, steel grade 12.9",
        partNumber: "ISO4762-M8x25-12.9",
        availability: "standard",
        leadTime: 1
      },
      {
        size: "M10x30",
        dimensions: {
          diameter: 10,
          length: 30,
          headDiameter: 16,
          headHeight: 10,
          socketSize: 8,
          threadPitch: 1.5
        },
        material: "Steel 12.9",
        weight: 0.065,
        description: "M10×30 socket head cap screw, steel grade 12.9",
        partNumber: "ISO4762-M10x30-12.9",
        availability: "standard",
        leadTime: 1
      },
      {
        size: "M12x40",
        dimensions: {
          diameter: 12,
          length: 40,
          headDiameter: 18,
          headHeight: 12,
          socketSize: 10,
          threadPitch: 1.75
        },
        material: "Steel 12.9",
        weight: 0.125,
        description: "M12×40 socket head cap screw, steel grade 12.9",
        partNumber: "ISO4762-M12x40-12.9",
        availability: "standard",
        leadTime: 1
      }
    ],
    defaultProperties: {
      color: "#A0A0A0",
      material: "Steel 12.9",
      surfaceFinish: "Black oxide",
      tolerance: "6g",
      strength: "1220 MPa tensile",
      temperature: "-50°C to +300°C",
      corrosionResistance: "Limited, requires coating"
    },
    constraints: [
      {
        type: "clearance_hole",
        value: 6.6,
        description: "Clearance hole diameter for M6 bolt",
        tolerance: "H11",
        referenceStandard: "ISO 4762"
      },
      {
        type: "thread_engagement",
        value: 9,
        description: "Minimum thread engagement for M6 in steel",
        tolerance: "±0.5",
        referenceStandard: "ISO 898-1"
      }
    ]
  },

  {
    id: "deep_groove_bearing_6000",
    name: "Deep Groove Ball Bearing",
    category: "bearing",
    standard: "ISO 15:2011",
    description: "Single row deep groove ball bearing for radial and limited axial loads",
    applications: ["Electric motors", "Gearboxes", "General machinery", "Automotive"],
    variants: [
      {
        size: "6000",
        dimensions: {
          innerDiameter: 10,
          outerDiameter: 26,
          width: 8,
          chamfer: 0.6,
          sealType: 0
        },
        material: "Bearing steel AISI 52100",
        weight: 0.019,
        description: "6000 series deep groove ball bearing, open type",
        partNumber: "6000-2RS1",
        availability: "standard",
        leadTime: 2
      },
      {
        size: "6001",
        dimensions: {
          innerDiameter: 12,
          outerDiameter: 28,
          width: 8,
          chamfer: 0.6,
          sealType: 0
        },
        material: "Bearing steel AISI 52100",
        weight: 0.022,
        description: "6001 series deep groove ball bearing, open type",
        partNumber: "6001-2RS1",
        availability: "standard",
        leadTime: 2
      },
      {
        size: "6004",
        dimensions: {
          innerDiameter: 20,
          outerDiameter: 42,
          width: 12,
          chamfer: 1.0,
          sealType: 0
        },
        material: "Bearing steel AISI 52100",
        weight: 0.069,
        description: "6004 series deep groove ball bearing, open type",
        partNumber: "6004-2RS1",
        availability: "standard",
        leadTime: 2
      },
      {
        size: "6205",
        dimensions: {
          innerDiameter: 25,
          outerDiameter: 52,
          width: 15,
          chamfer: 1.5,
          sealType: 0
        },
        material: "Bearing steel AISI 52100",
        weight: 0.128,
        description: "6205 series deep groove ball bearing, sealed type",
        partNumber: "6205-2RS1",
        availability: "standard",
        leadTime: 1
      }
    ],
    defaultProperties: {
      color: "#C0C0C0",
      material: "Bearing steel AISI 52100",
      surfaceFinish: "Ra 0.2 μm",
      tolerance: "P6",
      strength: "2100 MPa Hertzian stress",
      temperature: "-40°C to +120°C",
      corrosionResistance: "Limited, requires lubrication"
    },
    constraints: [
      {
        type: "shaft_fit",
        value: "h6",
        description: "Shaft tolerance for bearing inner race",
        referenceStandard: "ISO 286-2"
      },
      {
        type: "housing_fit",
        value: "H7",
        description: "Housing tolerance for bearing outer race",
        referenceStandard: "ISO 286-2"
      }
    ]
  },

  {
    id: "o_ring_metric",
    name: "Metric O-Ring",
    category: "sealing",
    standard: "ISO 3601-1",
    description: "Metric O-ring for static and dynamic sealing applications",
    applications: ["Hydraulic systems", "Pneumatic systems", "Rotating equipment", "Static seals"],
    variants: [
      {
        size: "10x2",
        dimensions: {
          innerDiameter: 10,
          crossSection: 2,
          outerDiameter: 14,
          grooveWidth: 2.4,
          grooveDepth: 1.5
        },
        material: "NBR 70 Shore A",
        weight: 0.001,
        description: "10mm ID × 2mm cross-section NBR O-ring",
        partNumber: "OR-10x2-NBR70",
        availability: "standard",
        leadTime: 3
      },
      {
        size: "15x2",
        dimensions: {
          innerDiameter: 15,
          crossSection: 2,
          outerDiameter: 19,
          grooveWidth: 2.4,
          grooveDepth: 1.5
        },
        material: "NBR 70 Shore A",
        weight: 0.002,
        description: "15mm ID × 2mm cross-section NBR O-ring",
        partNumber: "OR-15x2-NBR70",
        availability: "standard",
        leadTime: 3
      },
      {
        size: "20x3",
        dimensions: {
          innerDiameter: 20,
          crossSection: 3,
          outerDiameter: 26,
          grooveWidth: 3.6,
          grooveDepth: 2.4
        },
        material: "NBR 70 Shore A",
        weight: 0.004,
        description: "20mm ID × 3mm cross-section NBR O-ring",
        partNumber: "OR-20x3-NBR70",
        availability: "standard",
        leadTime: 3
      }
    ],
    defaultProperties: {
      color: "#2F2F2F",
      material: "NBR (Nitrile)",
      surfaceFinish: "Molded finish",
      tolerance: "AS568 Class 2",
      strength: "70 Shore A hardness",
      temperature: "-40°C to +120°C",
      corrosionResistance: "Excellent with oils and fuels"
    },
    constraints: [
      {
        type: "clearance_hole",
        value: 2.4,
        description: "O-ring groove width for 2mm cross-section",
        tolerance: "±0.1",
        referenceStandard: "ISO 3601-1"
      }
    ]
  },

  {
    id: "dowel_pin_iso2338",
    name: "Parallel Dowel Pin",
    category: "fastener",
    standard: "ISO 2338",
    description: "Hardened steel parallel dowel pin for precise positioning",
    applications: ["Precision fixtures", "Die alignment", "Jig construction", "Assembly positioning"],
    variants: [
      {
        size: "6x20",
        dimensions: {
          diameter: 6,
          length: 20,
          chamfer: 0.2,
          tolerance: 0
        },
        material: "Steel 1.4034 hardened",
        weight: 0.018,
        description: "6mm × 20mm hardened steel dowel pin",
        partNumber: "ISO2338-6x20-H",
        availability: "standard",
        leadTime: 2
      },
      {
        size: "8x25",
        dimensions: {
          diameter: 8,
          length: 25,
          chamfer: 0.3,
          tolerance: 0
        },
        material: "Steel 1.4034 hardened",
        weight: 0.031,
        description: "8mm × 25mm hardened steel dowel pin",
        partNumber: "ISO2338-8x25-H",
        availability: "standard",
        leadTime: 2
      },
      {
        size: "10x30",
        dimensions: {
          diameter: 10,
          length: 30,
          chamfer: 0.4,
          tolerance: 0
        },
        material: "Steel 1.4034 hardened",
        weight: 0.059,
        description: "10mm × 30mm hardened steel dowel pin",
        partNumber: "ISO2338-10x30-H",
        availability: "standard",
        leadTime: 2
      }
    ],
    defaultProperties: {
      color: "#B0B0B0",
      material: "Hardened steel 1.4034",
      surfaceFinish: "Ground and polished",
      tolerance: "H7",
      strength: "HRC 58-62",
      temperature: "-40°C to +400°C",
      corrosionResistance: "Good with proper lubrication"
    },
    constraints: [
      {
        type: "interference_fit",
        value: "H7/m6",
        description: "Interference fit for dowel pin holes",
        tolerance: "H7",
        referenceStandard: "ISO 286-2"
      }
    ]
  },

  {
    id: "steel_angle_equal",
    name: "Equal Angle Steel",
    category: "structural",
    standard: "EN 10056-1",
    description: "Hot-rolled equal angle steel section for structural applications",
    applications: ["Building frames", "Structural bracing", "Machine bases", "Support brackets"],
    variants: [
      {
        size: "L25x25x3",
        dimensions: {
          legLength: 25,
          thickness: 3,
          rootRadius: 3.5,
          toeRadius: 1.5,
          momentOfInertia: 1.12
        },
        material: "Steel S235JR",
        weight: 1.12, // kg/m
        description: "25×25×3mm equal angle steel, S235JR grade",
        partNumber: "EN10056-L25x25x3-S235JR",
        availability: "standard",
        leadTime: 5
      },
      {
        size: "L40x40x4",
        dimensions: {
          legLength: 40,
          thickness: 4,
          rootRadius: 6.0,
          toeRadius: 2.0,
          momentOfInertia: 4.47
        },
        material: "Steel S235JR",
        weight: 2.42, // kg/m
        description: "40×40×4mm equal angle steel, S235JR grade",
        partNumber: "EN10056-L40x40x4-S235JR",
        availability: "standard",
        leadTime: 5
      },
      {
        size: "L50x50x5",
        dimensions: {
          legLength: 50,
          thickness: 5,
          rootRadius: 7.0,
          toeRadius: 2.5,
          momentOfInertia: 9.61
        },
        material: "Steel S235JR",
        weight: 3.77, // kg/m
        description: "50×50×5mm equal angle steel, S235JR grade",
        partNumber: "EN10056-L50x50x5-S235JR",
        availability: "standard",
        leadTime: 5
      }
    ],
    defaultProperties: {
      color: "#8B4513",
      material: "Steel S235JR",
      surfaceFinish: "Hot-rolled scale",
      tolerance: "Class C (±2mm)",
      strength: "235 MPa yield strength",
      temperature: "-40°C to +400°C",
      corrosionResistance: "Requires protective coating"
    },
    constraints: [
      {
        type: "clearance_hole",
        value: 13,
        description: "Standard bolt hole for M12 in angle steel",
        tolerance: "+1.0",
        referenceStandard: "EN 1090-2"
      }
    ]
  }
];

/**
 * Component Library Service for intelligent component selection and integration
 */
export class ComponentLibraryService {
  /**
   * Finds compatible standard components based on application requirements
   *
   * @param elementType - Type of element needed
   * @param dimensions - Required dimensional specifications
   * @param application - Intended application context
   * @param material - Preferred material specification
   * @returns Array of compatible standard components
   */
  static findCompatibleComponents(
    elementType: string,
    dimensions: Record<string, number>,
    application: string = "",
    material: string = ""
  ): StandardComponent[] {
    const compatibleComponents = STANDARD_COMPONENTS.filter(component => {
      // Primary category matching
      if (elementType.includes("fastener") && component.category === "fastener") {
        return this.checkFastenerCompatibility(component, dimensions, application);
      }

      if (elementType.includes("bearing") && component.category === "bearing") {
        return this.checkBearingCompatibility(component, dimensions, application);
      }

      if (elementType.includes("seal") && component.category === "sealing") {
        return this.checkSealingCompatibility(component, dimensions, application);
      }

      if (elementType.includes("structural") && component.category === "structural") {
        return this.checkStructuralCompatibility(component, dimensions, application);
      }

      // General dimensional compatibility
      return this.checkDimensionalCompatibility(component, dimensions);
    });

    // Sort by relevance and availability
    return compatibleComponents.sort((a, b) => {
      const scoreA = this.calculateCompatibilityScore(a, dimensions, application, material);
      const scoreB = this.calculateCompatibilityScore(b, dimensions, application, material);
      return scoreB - scoreA;
    });
  }

  /**
   * Generates a standard component element with complete specifications
   *
   * @param componentId - Standard component identifier
   * @param variant - Specific variant size designation
   * @param position - 3D position for element placement
   * @param orientation - Optional orientation specification
   * @returns Enhanced CAD element with component specifications
   */
  static generateComponentWithStandards(
    componentId: string,
    variant: string,
    position: { x: number; y: number; z: number },
    orientation?: { x: number; y: number; z: number }
  ): Element {
    const component = STANDARD_COMPONENTS.find(c => c.id === componentId);
    const selectedVariant = component?.variants.find(v => v.size === variant);

    if (!component || !selectedVariant) {
      throw new Error(`Component ${componentId} variant ${variant} not found in standard library`);
    }

    const elementType = this.mapComponentTypeToElementType(component.category);
    const elementDimensions = this.mapVariantDimensionsToElement(selectedVariant, component.category);

    const element: Element = {
      id: uuidv4() as string,
      layerId: uuidv4() as string,
      type: elementType,
      name: `${component.name} ${variant}`,
      ...position,
      ...elementDimensions,
      ...component.defaultProperties,
      rotation: orientation || { x: 0, y: 0, z: 0 },
      componentInfo: {
        standardComponent: component.id,
        variant: variant,
        standard: component.standard,
        specifications: selectedVariant
      },
      engineeringProperties: {
        tolerance: component.defaultProperties.tolerance || "±0.1",
        surfaceFinish: component.defaultProperties.surfaceFinish,
        material: selectedVariant.material,
        manufacturingProcess: this.determineManufacturingProcess(component.category),
        criticalDimensions: this.extractCriticalDimensions(selectedVariant, component.category),
        standardReferences: [component.standard],
        qualityClass: this.determineQualityClass(component.category)
      }
    };

    return element;
  }

  /**
   * Suggests component combinations for complete assemblies
   *
   * @param primaryComponent - Main component requirement
   * @param assemblyType - Type of assembly needed
   * @returns Array of complementary component suggestions
   */
  static suggestComponentCombinations(
    primaryComponent: StandardComponent,
    assemblyType: "bolted" | "bearing" | "sealed" | "structural"
  ): StandardComponent[] {
    const suggestions: StandardComponent[] = [];

    switch (assemblyType) {
      case "bolted":
        if (primaryComponent.category === "fastener") {
          // Suggest washers, nuts, and thread locker
          suggestions.push(...this.findWashersForBolt(primaryComponent));
          suggestions.push(...this.findNutsForBolt(primaryComponent));
        }
        break;

      case "bearing":
        if (primaryComponent.category === "bearing") {
          // Suggest seals, retaining rings, and lubrication
          suggestions.push(...this.findSealsForBearing(primaryComponent));
          suggestions.push(...this.findRetainingRings(primaryComponent));
        }
        break;

      case "sealed":
        if (primaryComponent.category === "sealing") {
          // Suggest backup rings and groove specifications
          suggestions.push(...this.findBackupRings(primaryComponent));
        }
        break;

      case "structural":
        if (primaryComponent.category === "structural") {
          // Suggest connection hardware and bracing
          suggestions.push(...this.findConnectionHardware(primaryComponent));
        }
        break;
    }

    return suggestions;
  }

  /**
   * Validates component selection against application requirements
   */
  static validateComponentSelection(
    component: StandardComponent,
    variant: ComponentVariant,
    applicationRequirements: {
      maxLoad?: number;
      maxSpeed?: number;
      temperature?: number;
      environment?: string;
      precision?: string;
    }
  ): { isValid: boolean; warnings: string[]; suggestions: string[] } {
    const warnings: string[] = [];
    const suggestions: string[] = [];
    let isValid = true;

    // Temperature validation
    if (applicationRequirements.temperature) {
      const tempRange = this.parseTemperatureRange(component.defaultProperties.temperature || "");
      if (applicationRequirements.temperature < tempRange.min || applicationRequirements.temperature > tempRange.max) {
        warnings.push(
          `Operating temperature ${applicationRequirements.temperature}°C is outside component range ${component.defaultProperties.temperature}`
        );
        isValid = false;
      }
    }

    // Load validation for bearings
    if (component.category === "bearing" && applicationRequirements.maxLoad) {
      const loadCapacity = this.estimateLoadCapacity(variant);
      if (applicationRequirements.maxLoad > loadCapacity) {
        warnings.push(`Applied load ${applicationRequirements.maxLoad}N exceeds estimated capacity ${loadCapacity}N`);
        suggestions.push("Consider larger bearing size or different bearing type");
        isValid = false;
      }
    }

    // Speed validation for bearings
    if (component.category === "bearing" && applicationRequirements.maxSpeed) {
      const speedLimit = this.estimateSpeedLimit(variant);
      if (applicationRequirements.maxSpeed > speedLimit) {
        warnings.push(
          `Operating speed ${applicationRequirements.maxSpeed} RPM exceeds recommended limit ${speedLimit} RPM`
        );
        suggestions.push("Consider high-speed bearing design or lubrication system");
      }
    }

    // Environment validation
    if (applicationRequirements.environment) {
      const envCompatibility = this.checkEnvironmentalCompatibility(component, applicationRequirements.environment);
      if (!envCompatibility.isCompatible) {
        warnings.push(`Component may not be suitable for ${applicationRequirements.environment} environment`);
        suggestions.push(...envCompatibility.suggestions);
      }
    }

    return { isValid, warnings, suggestions };
  }

  /**
   * Maps component category to appropriate CAD element type
   */
  private static mapComponentTypeToElementType(category: string): string {
    const mapping: Record<string, string> = {
      "fastener": "cylinder",
      "bearing": "cylinder",
      "gear": "cylinder",
      "structural": "cube",
      "sealing": "torus",
      "hydraulic": "cylinder",
      "electrical": "cube"
    };
    return mapping[category] || "cube";
  }

  /**
   * Maps variant dimensions to element properties
   */
  private static mapVariantDimensionsToElement(variant: ComponentVariant, category: string): Partial<Element> {
    const dimensions: Partial<Element> = {};

    switch (category) {
      case "fastener":
        dimensions.radius = (variant.dimensions.diameter || 6) / 2;
        dimensions.height = variant.dimensions.length || 20;
        dimensions.width = variant.dimensions.diameter || 6;
        dimensions.depth = variant.dimensions.diameter || 6;
        break;

      case "bearing":
        dimensions.radius = (variant.dimensions.outerDiameter || 26) / 2;
        dimensions.height = variant.dimensions.width || 8;
        dimensions.width = variant.dimensions.outerDiameter || 26;
        dimensions.depth = variant.dimensions.outerDiameter || 26;
        break;

      case "sealing":
        dimensions.radius = (variant.dimensions.outerDiameter || 14) / 2;
        dimensions.height = variant.dimensions.crossSection || 2;
        dimensions.width = variant.dimensions.outerDiameter || 14;
        dimensions.depth = variant.dimensions.outerDiameter || 14;
        break;

      case "structural":
        dimensions.width = variant.dimensions.legLength || 25;
        dimensions.height = variant.dimensions.legLength || 25;
        dimensions.depth = variant.dimensions.thickness || 3;
        break;

      default:
        dimensions.width = 20;
        dimensions.height = 20;
        dimensions.depth = 10;
    }

    return dimensions;
  }

  /**
   * Determines manufacturing process based on component category
   */
  private static determineManufacturingProcess(category: string): string[] {
    const processMapping: Record<string, string[]> = {
      "fastener": ["cold_heading", "thread_rolling", "heat_treatment"],
      "bearing": ["turning", "grinding", "heat_treatment", "assembly"],
      "sealing": ["molding", "vulcanization", "trimming"],
      "structural": ["hot_rolling", "cutting", "punching"],
      "hydraulic": ["machining", "assembly", "testing"],
      "electrical": ["molding", "assembly", "testing"]
    };

    return processMapping[category] || ["machining"];
  }

  /**
   * Extracts critical dimensions from variant specifications
   */
  private static extractCriticalDimensions(variant: ComponentVariant, category: string): string[] {
    const critical: string[] = [];

    switch (category) {
      case "fastener":
        if (variant.dimensions.diameter) {
          critical.push(`thread diameter: M${variant.dimensions.diameter} 6g`);
        }
        if (variant.dimensions.length) {
          critical.push(`length: ${variant.dimensions.length} ±0.5`);
        }
        break;

      case "bearing":
        if (variant.dimensions.innerDiameter) {
          critical.push(`bore: Ø${variant.dimensions.innerDiameter} H7`);
        }
        if (variant.dimensions.outerDiameter) {
          critical.push(`OD: Ø${variant.dimensions.outerDiameter} h6`);
        }
        break;

      case "sealing":
        if (variant.dimensions.innerDiameter) {
          critical.push(`ID: Ø${variant.dimensions.innerDiameter} ±0.1`);
        }
        if (variant.dimensions.crossSection) {
          critical.push(`cross-section: ${variant.dimensions.crossSection} ±0.1`);
        }
        break;
    }

    return critical;
  }

  /**
   * Determines quality class based on component category
   */
  private static determineQualityClass(category: string): string {
    const qualityMapping: Record<string, string> = {
      "fastener": "ISO 898-1",
      "bearing": "ABEC-1",
      "sealing": "AS568 Class 2",
      "structural": "EN 10056",
      "hydraulic": "ISO 1219",
      "electrical": "IEC 60529"
    };

    return qualityMapping[category] || "General Purpose";
  }

  /**
   * Checks fastener compatibility with application requirements
   */
  private static checkFastenerCompatibility(
    component: StandardComponent,
    dimensions: Record<string, number>,
    application: string
  ): boolean {
    // Check if any variant matches dimensional requirements
    return component.variants.some(variant => {
      if (dimensions.diameter && Math.abs(variant.dimensions.diameter - dimensions.diameter) > 0.5) {
        return false;
      }
      if (dimensions.length && Math.abs(variant.dimensions.length - dimensions.length) > 2) {
        return false;
      }
      return true;
    });
  }

  /**
   * Checks bearing compatibility with application requirements
   */
  private static checkBearingCompatibility(
    component: StandardComponent,
    dimensions: Record<string, number>,
    application: string
  ): boolean {
    return component.variants.some(variant => {
      if (dimensions.innerDiameter && Math.abs(variant.dimensions.innerDiameter - dimensions.innerDiameter) > 0.1) {
        return false;
      }
      if (dimensions.outerDiameter && Math.abs(variant.dimensions.outerDiameter - dimensions.outerDiameter) > 0.5) {
        return false;
      }
      return true;
    });
  }

  /**
   * Checks sealing compatibility with application requirements
   */
  private static checkSealingCompatibility(
    component: StandardComponent,
    dimensions: Record<string, number>,
    application: string
  ): boolean {
    return component.variants.some(variant => {
      if (dimensions.innerDiameter && Math.abs(variant.dimensions.innerDiameter - dimensions.innerDiameter) > 0.2) {
        return false;
      }
      return true;
    });
  }

  /**
   * Checks structural compatibility with application requirements
   */
  private static checkStructuralCompatibility(
    component: StandardComponent,
    dimensions: Record<string, number>,
    application: string
  ): boolean {
    return component.variants.some(variant => {
      const legLength = variant.dimensions.legLength || variant.dimensions.width || 0;
      if (dimensions.width && Math.abs(legLength - dimensions.width) > 5) {
        return false;
      }
      return true;
    });
  }

  /**
   * Checks general dimensional compatibility
   */
  private static checkDimensionalCompatibility(
    component: StandardComponent,
    dimensions: Record<string, number>
  ): boolean {
    // General compatibility check based on overall size
    return component.variants.some(variant => {
      const variantSize = Math.max(...Object.values(variant.dimensions));
      const requiredSize = Math.max(...Object.values(dimensions));
      return Math.abs(variantSize - requiredSize) < requiredSize * 0.5;
    });
  }

  /**
   * Calculates compatibility score for component ranking
   */
  private static calculateCompatibilityScore(
    component: StandardComponent,
    dimensions: Record<string, number>,
    application: string,
    material: string
  ): number {
    let score = 0;

    // Application relevance
    if (component.applications.some(app => application.toLowerCase().includes(app.toLowerCase()))) {
      score += 50;
    }

    // Material compatibility
    if (material && component.variants.some(v => v.material.toLowerCase().includes(material.toLowerCase()))) {
      score += 30;
    }

    // Availability bonus
    const standardVariants = component.variants.filter(v => v.availability === "standard").length;
    score += standardVariants * 5;

    // Standard compliance bonus
    if (component.standard.includes("ISO") || component.standard.includes("DIN")) {
      score += 10;
    }

    return score;
  }

  // Placeholder methods for future implementation
  private static findWashersForBolt(component: StandardComponent): StandardComponent[] {
    return [];
  }
  private static findNutsForBolt(component: StandardComponent): StandardComponent[] {
    return [];
  }
  private static findSealsForBearing(component: StandardComponent): StandardComponent[] {
    return [];
  }
  private static findRetainingRings(component: StandardComponent): StandardComponent[] {
    return [];
  }
  private static findBackupRings(component: StandardComponent): StandardComponent[] {
    return [];
  }
  private static findConnectionHardware(component: StandardComponent): StandardComponent[] {
    return [];
  }

  private static parseTemperatureRange(tempString: string): { min: number; max: number } {
    const match = tempString.match(/(-?\d+)°C\s+to\s+(-?\d+)°C/);
    return match ? { min: parseInt(match[1]), max: parseInt(match[2]) } : { min: -40, max: 120 };
  }

  private static estimateLoadCapacity(variant: ComponentVariant): number {
    // Simplified load capacity estimation
    const diameter = variant.dimensions.outerDiameter || variant.dimensions.diameter || 26;
    return Math.pow(diameter, 2) * 100; // Simplified formula
  }

  private static estimateSpeedLimit(variant: ComponentVariant): number {
    // Simplified speed limit estimation
    const diameter = variant.dimensions.outerDiameter || variant.dimensions.diameter || 26;
    return 100000 / diameter; // Simplified DN formula
  }

  private static checkEnvironmentalCompatibility(
    component: StandardComponent,
    environment: string
  ): { isCompatible: boolean; suggestions: string[] } {
    // Simplified environmental compatibility check
    const suggestions: string[] = [];
    let isCompatible = true;

    if (environment.includes("corrosive")) {
      if (!component.defaultProperties.corrosionResistance?.includes("Excellent")) {
        isCompatible = false;
        suggestions.push("Consider stainless steel or coated variants");
      }
    }

    return { isCompatible, suggestions };
  }
}
