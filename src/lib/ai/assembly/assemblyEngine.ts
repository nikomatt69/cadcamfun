/**
 * Assembly Intelligence Engine for Advanced CAD Applications
 *
 * This module provides comprehensive assembly analysis, relationship detection,
 * fastener generation, and assembly sequence optimization for complex CAD projects.
 * The engine incorporates manufacturing best practices and engineering standards.
 *
 * @module AssemblyEngine
 * @version 2.0.0
 */

import { Element } from "@/src/store/elementsStore";
import { EnhancedElement } from "../parsers/advancedCADParser";
import { ComponentLibraryService, STANDARD_COMPONENTS } from "../component-library/standardComponents";
import { v4 as uuidv4 } from "uuid";

/**
 * Assembly relationship interface with comprehensive specifications
 */
export interface AssemblyRelationship {
  id: string;
  parentElementId: string;
  childElementId: string;
  relationshipType:
    | "fastened"
    | "pressed"
    | "welded"
    | "bolted"
    | "pinned"
    | "keyed"
    | "threaded"
    | "adhesed"
    | "interlocked";
  interface: AssemblyInterface;
  constraints: AssemblyConstraint[];
  strength: ConnectionStrength;
  disassembly: DisassemblyInfo;
  toolAccess: ToolAccessInfo;
  qualityRequirements: QualityRequirement[];
}

/**
 * Assembly interface specification with detailed contact analysis
 */
export interface AssemblyInterface {
  contactType: "surface" | "line" | "point" | "threaded" | "keyed";
  contactArea: number; // mm²
  contactPressure?: number; // MPa
  clearance: number; // mm
  tolerance: string;
  surfaceFinish: string;
  materialCompatibility: boolean;
  sealingRequired: boolean;
  lubricationRequired: boolean;
  preload?: number; // N
}

/**
 * Assembly constraint specification
 */
export interface AssemblyConstraint {
  type: "positional" | "rotational" | "thermal" | "force" | "torque" | "vibration";
  value: number | string;
  unit: string;
  description: string;
  criticality: "critical" | "important" | "normal";
  verificationMethod: string;
}

/**
 * Connection strength analysis
 */
export interface ConnectionStrength {
  tensile: number; // N
  shear: number; // N
  torque: number; // Nm
  fatigueLife: number; // cycles
  safetyFactor: number;
  failureMode: string;
  designBasis: string;
}

/**
 * Disassembly information for maintenance
 */
export interface DisassemblyInfo {
  difficulty: "easy" | "moderate" | "difficult" | "destructive";
  toolsRequired: string[];
  estimatedTime: number; // minutes
  specialProcedures: string[];
  safetyConsiderations: string[];
  reassemblyNotes: string[];
}

/**
 * Tool access analysis for assembly operations
 */
export interface ToolAccessInfo {
  accessDirection: "axial" | "radial" | "angular" | "multiple";
  clearanceRequired: number; // mm
  toolType: string[];
  torqueMethod: "manual" | "pneumatic" | "hydraulic" | "electric";
  verificationMethod: string;
  accessibility: "good" | "fair" | "poor" | "special_tooling";
}

/**
 * Quality requirement for assembly operations
 */
export interface QualityRequirement {
  parameter: string;
  specification: string;
  tolerance: string;
  inspectionMethod: string;
  frequency: "every" | "sample" | "first_article";
  documentation: boolean;
}

/**
 * Fastener specification with complete engineering data
 */
export interface FastenerSpecification {
  id: string;
  type: "bolt" | "screw" | "nut" | "washer" | "pin" | "rivet" | "stud";
  standard: string;
  size: string;
  material: string;
  coating: string;
  strength: string;
  quantity: number;
  length: number;
  threadType: string;
  headType: string;
  driveType: string;
  torqueSpec: TorqueSpecification;
  applicationNotes: string[];
  cost: number;
  availability: "standard" | "special_order" | "custom";
  alternates: string[];
}

/**
 * Torque specification with detailed requirements
 */
export interface TorqueSpecification {
  value: number; // Nm
  tolerance: string;
  sequence: string;
  pattern: string;
  stages: TorqueStage[];
  verification: string;
  tools: string[];
  lubrication: string;
}

/**
 * Torque application stage
 */
export interface TorqueStage {
  stage: number;
  torque: number; // Nm
  angle?: number; // degrees
  description: string;
  pause?: number; // seconds
}

/**
 * Assembly step with comprehensive instructions
 */
export interface AssemblyStep {
  stepNumber: number;
  operation: string;
  description: string;
  elementIds: string[];
  fastenerIds: string[];
  tools: ToolRequirement[];
  torqueSpecs: TorqueSpecification[];
  inspectionPoints: InspectionPoint[];
  safetyNotes: string[];
  qualityChecks: QualityCheck[];
  estimatedTime: number; // minutes
  skillLevel: "basic" | "intermediate" | "advanced" | "specialist";
  dependencies: string[]; // step numbers that must be completed first
  workInstructions: WorkInstruction[];
}

/**
 * Tool requirement specification
 */
export interface ToolRequirement {
  tool: string;
  size: string;
  type: string;
  purpose: string;
  alternative?: string;
  calibration?: boolean;
}

/**
 * Inspection point specification
 */
export interface InspectionPoint {
  parameter: string;
  method: string;
  acceptance: string;
  frequency: string;
  tools: string[];
  documentation: boolean;
}

/**
 * Quality check specification
 */
export interface QualityCheck {
  check: string;
  criteria: string;
  method: string;
  recordKeeping: boolean;
  corrective: string;
}

/**
 * Work instruction detail
 */
export interface WorkInstruction {
  instruction: string;
  illustration?: string;
  caution?: string;
  verification: string;
}

/**
 * Complete assembly plan with all specifications
 */
export interface AssemblyPlan {
  id: string;
  projectName: string;
  relationships: AssemblyRelationship[];
  fasteners: FastenerSpecification[];
  sequence: AssemblyStep[];
  tools: ToolRequirement[];
  instructions: WorkInstruction[];
  qualityPlan: QualityPlan;
  timeEstimate: TimeEstimate;
  costEstimate: CostEstimate;
  riskAssessment: RiskAssessment;
}

/**
 * Quality plan for assembly
 */
export interface QualityPlan {
  inspectionPoints: InspectionPoint[];
  testRequirements: string[];
  documentation: string[];
  certification: string[];
  traceability: boolean;
}

/**
 * Time estimate breakdown
 */
export interface TimeEstimate {
  preparation: number; // hours
  assembly: number; // hours
  inspection: number; // hours
  total: number; // hours
  laborCost: number; // currency units
}

/**
 * Cost estimate breakdown
 */
export interface CostEstimate {
  materials: number;
  fasteners: number;
  labor: number;
  tooling: number;
  overhead: number;
  total: number;
  currency: string;
}

/**
 * Risk assessment for assembly
 */
export interface RiskAssessment {
  risks: AssemblyRisk[];
  mitigations: string[];
  contingencies: string[];
  safetyLevel: "low" | "medium" | "high" | "critical";
}

/**
 * Assembly risk specification
 */
export interface AssemblyRisk {
  risk: string;
  probability: "low" | "medium" | "high";
  impact: "low" | "medium" | "high";
  mitigation: string;
  contingency: string;
}

/**
 * Advanced Assembly Engine with comprehensive analysis capabilities
 */
export class AssemblyEngine {
  /**
   * Analyzes assembly requirements and generates comprehensive assembly plan
   *
   * @param elements - CAD elements to analyze for assembly
   * @param projectName - Name of the project
   * @param requirements - Additional assembly requirements
   * @returns Complete assembly plan with all specifications
   */
  static analyzeAssemblyRequirements(
    elements: EnhancedElement[],
    projectName: string = "Assembly Project",
    requirements: any = {}
  ): AssemblyPlan {
    console.log(`🔧 Analyzing assembly requirements for ${elements.length} elements`);

    const relationships = this.detectRelationships(elements);
    const fasteners = this.generateFasteners(relationships, elements);
    const sequence = this.generateAssemblySequence(elements, relationships, fasteners);
    const tools = this.determineRequiredTools(fasteners, relationships);
    const instructions = this.generateAssemblyInstructions(sequence);
    const qualityPlan = this.generateQualityPlan(relationships, fasteners);
    const timeEstimate = this.estimateAssemblyTime(sequence, elements.length);
    const costEstimate = this.estimateAssemblyCost(fasteners, timeEstimate);
    const riskAssessment = this.assessAssemblyRisks(relationships, fasteners);

    return {
      id: uuidv4(),
      projectName,
      relationships,
      fasteners,
      sequence,
      tools,
      instructions,
      qualityPlan,
      timeEstimate,
      costEstimate,
      riskAssessment
    };
  }

  /**
   * Detects assembly relationships between elements using advanced analysis
   */
  private static detectRelationships(elements: EnhancedElement[]): AssemblyRelationship[] {
    const relationships: AssemblyRelationship[] = [];

    console.log(`🔍 Detecting relationships between ${elements.length} elements`);

    for (let i = 0; i < elements.length; i++) {
      for (let j = i + 1; j < elements.length; j++) {
        const element1 = elements[i];
        const element2 = elements[j];

        const relationshipAnalysis = this.analyzeElementRelationship(element1, element2);

        if (relationshipAnalysis.hasRelationship) {
          const relationship = this.createAssemblyRelationship(element1, element2, relationshipAnalysis);
          relationships.push(relationship);
        }
      }
    }

    console.log(`✅ Detected ${relationships.length} assembly relationships`);
    return relationships;
  }

  /**
   * Analyzes potential relationship between two elements
   */
  private static analyzeElementRelationship(
    element1: EnhancedElement,
    element2: EnhancedElement
  ): {
    hasRelationship: boolean;
    relationshipType?: AssemblyRelationship["relationshipType"];
    interface?: Partial<AssemblyInterface>;
    confidence: number;
  } {
    const distance = this.calculateDistance(element1, element2);
    const combinedSize = this.getCombinedSize(element1, element2);
    const proximityRatio = distance / combinedSize;

    // Elements are too far apart
    if (proximityRatio > 2.0) {
      return { hasRelationship: false, confidence: 0 };
    }

    // Very close elements suggest assembly relationship
    if (proximityRatio < 0.1) {
      return {
        hasRelationship: true,
        relationshipType: this.determineRelationshipType(
          element1,
          element2,
          distance
        ) as AssemblyRelationship["relationshipType"],
        interface: this.analyzeInterface(element1, element2),
        confidence: 0.9
      };
    }

    // Moderate distance - check for specific patterns
    if (proximityRatio < 0.5) {
      const relationshipType = this.determineRelationshipType(element1, element2, distance);
      if (relationshipType) {
        return {
          hasRelationship: true,
          relationshipType,
          interface: this.analyzeInterface(element1, element2),
          confidence: 0.7
        };
      }
    }

    return { hasRelationship: false, confidence: 0 };
  }

  /**
   * Determines the type of relationship between elements
   */
  private static determineRelationshipType(
    element1: EnhancedElement,
    element2: EnhancedElement,
    distance: number
  ): AssemblyRelationship["relationshipType"] | null {
    const name1 = element1.name?.toLowerCase() || "";
    const name2 = element2.name?.toLowerCase() || "";
    const type1 = element1.type;
    const type2 = element2.type;

    // Name-based relationship detection
    if (name1.includes("bolt") || name1.includes("screw") || name2.includes("bolt") || name2.includes("screw")) {
      return "bolted";
    }

    if (name1.includes("weld") || name2.includes("weld")) {
      return "welded";
    }

    if (name1.includes("pin") || name2.includes("pin")) {
      return "pinned";
    }

    if (name1.includes("key") || name2.includes("key")) {
      return "keyed";
    }

    // Geometry-based relationship detection
    if (type1 === "cylinder" && type2 === "cube") {
      // Cylinder into cube suggests bolted or pinned connection
      return distance < 5 ? "pressed" : "bolted";
    }

    if (type1 === "cube" && type2 === "cube") {
      // Adjacent cubes suggest welded or bolted connection
      const size1 = Math.max(element1.width || 0, element1.height || 0, element1.depth || 0);
      const size2 = Math.max(element2.width || 0, element2.height || 0, element2.depth || 0);

      if (Math.min(size1, size2) > 50) {
        return "welded"; // Large parts often welded
      } else {
        return "bolted"; // Smaller parts often bolted
      }
    }

    // Material-based relationship detection
    const material1 = element1.engineeringProperties?.material?.toLowerCase();
    const material2 = element2.engineeringProperties?.material?.toLowerCase();

    if (material1?.includes("steel") && material2?.includes("steel")) {
      return "welded";
    }

    if (material1?.includes("aluminum") || material2?.includes("aluminum")) {
      return "bolted"; // Aluminum typically bolted rather than welded
    }

    // Default relationship type based on proximity
    return distance < 2 ? "pressed" : "fastened";
  }

  /**
   * Analyzes interface between two elements
   */
  private static analyzeInterface(element1: EnhancedElement, element2: EnhancedElement): Partial<AssemblyInterface> {
    const contactArea = this.calculateContactArea(element1, element2);
    const clearance = Math.max(
      0,
      this.calculateDistance(element1, element2) - this.getCombinedRadius(element1, element2)
    );

    return {
      contactType: this.determineContactType(element1, element2),
      contactArea,
      clearance,
      tolerance: "±0.1",
      surfaceFinish: "Ra 3.2",
      materialCompatibility: this.checkMaterialCompatibility(element1, element2),
      sealingRequired: this.requiresSealing(element1, element2),
      lubricationRequired: this.requiresLubrication(element1, element2)
    };
  }

  /**
   * Creates complete assembly relationship specification
   */
  private static createAssemblyRelationship(
    element1: EnhancedElement,
    element2: EnhancedElement,
    analysis: any
  ): AssemblyRelationship {
    const relationshipType = analysis.relationshipType;
    const assemblyInterface: AssemblyInterface = {
      contactType: analysis.interface?.contactType || "surface",
      contactArea: analysis.interface?.contactArea || 100,
      clearance: analysis.interface?.clearance || 0.5,
      tolerance: analysis.interface?.tolerance || "±0.1",
      surfaceFinish: analysis.interface?.surfaceFinish || "Ra 3.2",
      materialCompatibility: analysis.interface?.materialCompatibility || true,
      sealingRequired: analysis.interface?.sealingRequired || false,
      lubricationRequired: analysis.interface?.lubricationRequired || false
    };

    return {
      id: `rel_${element1.id}_${element2.id}`,
      parentElementId: element1.id,
      childElementId: element2.id,
      relationshipType,
      interface: assemblyInterface,
      constraints: this.generateConstraints(element1, element2, relationshipType),
      strength: this.calculateConnectionStrength(assemblyInterface, relationshipType, element1, element2),
      disassembly: this.analyzeDisassembly(relationshipType, assemblyInterface),
      toolAccess: this.analyzeToolAccess(element1, element2, relationshipType),
      qualityRequirements: this.generateQualityRequirements(relationshipType, assemblyInterface)
    };
  }

  /**
   * Generates fasteners for assembly relationships
   */
  private static generateFasteners(
    relationships: AssemblyRelationship[],
    elements: EnhancedElement[]
  ): FastenerSpecification[] {
    const fasteners: FastenerSpecification[] = [];

    console.log(`🔩 Generating fasteners for ${relationships.length} relationships`);

    relationships.forEach(relationship => {
      if (["bolted", "fastened", "threaded"].includes(relationship.relationshipType)) {
        const fastener = this.generateFastenerForRelationship(relationship, elements);
        fasteners.push(fastener);
      }
    });

    console.log(`✅ Generated ${fasteners.length} fastener specifications`);
    return fasteners;
  }

  /**
   * Generates specific fastener for a relationship
   */
  private static generateFastenerForRelationship(
    relationship: AssemblyRelationship,
    elements: EnhancedElement[]
  ): FastenerSpecification {
    const contactArea = relationship.interface.contactArea;
    const fastenerSize = this.determineFastenerSize(contactArea);
    const quantity = this.calculateFastenerQuantity(contactArea, fastenerSize);
    const material = this.selectFastenerMaterial(elements, relationship);

    const torqueSpec: TorqueSpecification = {
      value: this.calculateTorqueValue(fastenerSize, material),
      tolerance: "±5%",
      sequence: this.determineTorqueSequence(quantity),
      pattern: this.determineTorquePattern(quantity),
      stages: this.generateTorqueStages(fastenerSize),
      verification: "Torque wrench verification",
      tools: [`${fastenerSize} socket`, "Torque wrench"],
      lubrication: "Anti-seize compound recommended"
    };

    return {
      id: `fastener_${relationship.id}`,
      type: "bolt",
      standard: this.selectFastenerStandard(fastenerSize),
      size: fastenerSize,
      material,
      coating: this.selectFastenerCoating(material, elements),
      strength: this.selectFastenerStrength(relationship, elements),
      quantity,
      length: this.calculateFastenerLength(relationship, elements),
      threadType: this.selectThreadType(fastenerSize),
      headType: this.selectHeadType(relationship, elements),
      driveType: this.selectDriveType(fastenerSize),
      torqueSpec,
      applicationNotes: this.generateApplicationNotes(relationship, fastenerSize),
      cost: this.estimateFastenerCost(fastenerSize, quantity, material),
      availability: "standard",
      alternates: this.findFastenerAlternates(fastenerSize, material)
    };
  }

  /**
   * Generates optimized assembly sequence
   */
  private static generateAssemblySequence(
    elements: EnhancedElement[],
    relationships: AssemblyRelationship[],
    fasteners: FastenerSpecification[]
  ): AssemblyStep[] {
    console.log(`📋 Generating assembly sequence for ${elements.length} elements`);

    // Build dependency graph
    const dependencyGraph = this.buildDependencyGraph(elements, relationships);

    // Perform topological sort to determine optimal sequence
    const sortedElements = this.topologicalSort(elements, dependencyGraph);

    // Generate detailed assembly steps
    const steps: AssemblyStep[] = [];
    let stepNumber = 1;

    // Preparation step
    steps.push(this.generatePreparationStep(stepNumber++, elements, fasteners));

    // Element assembly steps
    sortedElements.forEach((element, index) => {
      const relatedRelationships = relationships.filter(
        r => r.parentElementId === element.id || r.childElementId === element.id
      );
      const relatedFasteners = fasteners.filter(f => relatedRelationships.some(r => f.id.includes(r.id)));

      if (relatedRelationships.length > 0 || index > 0) {
        const step = this.generateElementAssemblyStep(
          stepNumber++,
          element,
          relatedRelationships,
          relatedFasteners,
          elements
        );
        steps.push(step);
      }
    });

    // Final inspection step
    steps.push(this.generateFinalInspectionStep(stepNumber++, elements, relationships));

    console.log(`✅ Generated ${steps.length} assembly steps`);
    return steps;
  }

  /**
   * Generates preparation step
   */
  private static generatePreparationStep(
    stepNumber: number,
    elements: EnhancedElement[],
    fasteners: FastenerSpecification[]
  ): AssemblyStep {
    const allTools = this.determineRequiredTools(fasteners, []);

    return {
      stepNumber,
      operation: "Preparation",
      description: "Prepare workspace, tools, and components for assembly",
      elementIds: elements.map(e => e.id),
      fastenerIds: fasteners.map(f => f.id),
      tools: allTools,
      torqueSpecs: [],
      inspectionPoints: [
        {
          parameter: "Component cleanliness",
          method: "Visual inspection",
          acceptance: "No contamination visible",
          frequency: "every",
          tools: ["Magnifying glass"],
          documentation: true
        }
      ],
      safetyNotes: ["Ensure workspace is clean and well-lit", "Verify all tools are calibrated", "Use appropriate PPE"],
      qualityChecks: [
        {
          check: "Component identification",
          criteria: "All parts match assembly drawing",
          method: "Visual verification",
          recordKeeping: true,
          corrective: "Replace incorrect components"
        }
      ],
      estimatedTime: 15,
      skillLevel: "basic",
      dependencies: [],
      workInstructions: [
        {
          instruction: "Clean all components with approved solvent",
          verification: "Components are free of contamination"
        },
        {
          instruction: "Organize fasteners by size and type",
          verification: "Fasteners are properly segregated"
        }
      ]
    };
  }

  /**
   * Generates element assembly step
   */
  private static generateElementAssemblyStep(
    stepNumber: number,
    element: EnhancedElement,
    relationships: AssemblyRelationship[],
    fasteners: FastenerSpecification[],
    allElements: EnhancedElement[]
  ): AssemblyStep {
    const primaryRelationship = relationships[0];
    const tools = this.getToolsForElement(element, fasteners);
    const torqueSpecs = fasteners.map(f => f.torqueSpec);

    return {
      stepNumber,
      operation: `Install ${element.name || element.type}`,
      description: `Install and secure ${element.name || element.type} using ${primaryRelationship?.relationshipType || "mechanical"} connection`,
      elementIds: [element.id],
      fastenerIds: fasteners.map(f => f.id),
      tools,
      torqueSpecs,
      inspectionPoints: this.generateInspectionPoints(relationships, fasteners),
      safetyNotes: this.generateSafetyNotes(element, relationships, fasteners),
      qualityChecks: this.generateQualityChecks(element, relationships),
      estimatedTime: this.estimateStepTime(element, relationships, fasteners),
      skillLevel: this.determineSkillLevel(relationships, fasteners),
      dependencies: this.findStepDependencies(element, relationships, allElements),
      workInstructions: this.generateWorkInstructions(element, relationships, fasteners)
    };
  }

  /**
   * Generates final inspection step
   */
  private static generateFinalInspectionStep(
    stepNumber: number,
    elements: EnhancedElement[],
    relationships: AssemblyRelationship[]
  ): AssemblyStep {
    return {
      stepNumber,
      operation: "Final Inspection",
      description: "Perform final assembly inspection and functional testing",
      elementIds: elements.map(e => e.id),
      fastenerIds: [],
      tools: [
        { tool: "Torque wrench", size: "Various", type: "Verification", purpose: "Torque verification" },
        { tool: "Go/No-go gauges", size: "As required", type: "Measurement", purpose: "Dimensional verification" }
      ],
      torqueSpecs: [],
      inspectionPoints: [
        {
          parameter: "Assembly completeness",
          method: "Visual inspection against assembly drawing",
          acceptance: "100% complete per drawing",
          frequency: "every",
          tools: ["Assembly drawing"],
          documentation: true
        },
        {
          parameter: "Fastener torque",
          method: "Torque verification",
          acceptance: "Within specified tolerance",
          frequency: "sample",
          tools: ["Torque wrench"],
          documentation: true
        }
      ],
      safetyNotes: ["Verify all safety devices are functional", "Check for sharp edges or pinch points"],
      qualityChecks: [
        {
          check: "Functional test",
          criteria: "Assembly operates per specification",
          method: "Operational test",
          recordKeeping: true,
          corrective: "Investigate and correct deficiencies"
        }
      ],
      estimatedTime: 30,
      skillLevel: "intermediate",
      dependencies: [],
      workInstructions: [
        {
          instruction: "Perform complete visual inspection",
          verification: "No defects noted"
        },
        {
          instruction: "Complete assembly documentation",
          verification: "All required records completed"
        }
      ]
    };
  }

  // Helper methods and calculations (simplified implementations)
  private static calculateDistance(element1: Element, element2: Element): number {
    return Math.sqrt(
      Math.pow(element1.x - element2.x, 2) + Math.pow(element1.y - element2.y, 2) + Math.pow(element1.z - element2.z, 2)
    );
  }

  private static getCombinedSize(element1: Element, element2: Element): number {
    const size1 = Math.max(element1.width || 0, element1.height || 0, element1.depth || 0);
    const size2 = Math.max(element2.width || 0, element2.height || 0, element2.depth || 0);
    return (size1 + size2) / 2;
  }

  private static getCombinedRadius(element1: Element, element2: Element): number {
    const radius1 = element1.radius || Math.max(element1.width || 0, element1.height || 0) / 2;
    const radius2 = element2.radius || Math.max(element2.width || 0, element2.height || 0) / 2;
    return radius1 + radius2;
  }

  private static calculateContactArea(element1: Element, element2: Element): number {
    // Simplified contact area calculation
    const area1 = (element1.width || 10) * (element1.height || 10);
    const area2 = (element2.width || 10) * (element2.height || 10);
    return Math.min(area1, area2) * 0.5; // Assume 50% contact
  }

  private static determineContactType(element1: Element, element2: Element): AssemblyInterface["contactType"] {
    if (element1.type === "cylinder" || element2.type === "cylinder") {
      return "line";
    }
    return "surface";
  }

  private static checkMaterialCompatibility(element1: EnhancedElement, element2: EnhancedElement): boolean {
    const material1 = element1.engineeringProperties?.material;
    const material2 = element2.engineeringProperties?.material;

    // Simplified compatibility check
    if (!material1 || !material2) return true;

    // Check for galvanic corrosion issues
    const incompatiblePairs = [
      ["aluminum", "steel"],
      ["aluminum", "stainless"],
      ["brass", "steel"]
    ];

    return !incompatiblePairs.some(
      pair =>
        (material1.includes(pair[0]) && material2.includes(pair[1])) ||
        (material1.includes(pair[1]) && material2.includes(pair[0]))
    );
  }

  private static requiresSealing(element1: Element, element2: Element): boolean {
    // Simplified sealing requirement logic
    return element1.name?.includes("pressure") || element2.name?.includes("pressure") || false;
  }

  private static requiresLubrication(element1: Element, element2: Element): boolean {
    // Simplified lubrication requirement logic
    return element1.name?.includes("bearing") || element2.name?.includes("bearing") || false;
  }

  private static generateConstraints(
    element1: EnhancedElement,
    element2: EnhancedElement,
    relationshipType: string
  ): AssemblyConstraint[] {
    const constraints: AssemblyConstraint[] = [];

    // Position constraint
    constraints.push({
      type: "positional",
      value: "±0.5",
      unit: "mm",
      description: "Assembly position tolerance",
      criticality: "important",
      verificationMethod: "Dimensional measurement"
    });

    // Add relationship-specific constraints
    if (relationshipType === "bolted") {
      constraints.push({
        type: "torque",
        value: "Per fastener specification",
        unit: "Nm",
        description: "Fastener torque requirement",
        criticality: "critical",
        verificationMethod: "Torque wrench verification"
      });
    }

    return constraints;
  }

  private static calculateConnectionStrength(
    assemblyInterface: AssemblyInterface,
    relationshipType: string,
    element1: EnhancedElement,
    element2: EnhancedElement
  ): ConnectionStrength {
    // Simplified strength calculation
    const baseStrength = assemblyInterface.contactArea * 10; // N

    return {
      tensile: baseStrength,
      shear: baseStrength * 0.6,
      torque: baseStrength * 0.01, // Nm
      fatigueLife: 1000000,
      safetyFactor: 2.0,
      failureMode: "Fastener shear",
      designBasis: "Conservative engineering estimate"
    };
  }

  private static analyzeDisassembly(relationshipType: string, assemblyInterface: AssemblyInterface): DisassemblyInfo {
    let difficulty: DisassemblyInfo["difficulty"] = "moderate";
    let toolsRequired: string[] = ["Standard tools"];

    switch (relationshipType) {
      case "bolted":
        difficulty = "easy";
        toolsRequired = ["Socket wrench", "Torque wrench"];
        break;
      case "welded":
        difficulty = "destructive";
        toolsRequired = ["Cutting torch", "Grinder"];
        break;
      case "pressed":
        difficulty = "difficult";
        toolsRequired = ["Hydraulic press", "Pullers"];
        break;
    }

    return {
      difficulty,
      toolsRequired,
      estimatedTime: difficulty === "easy" ? 5 : difficulty === "moderate" ? 15 : 30,
      specialProcedures: [],
      safetyConsiderations: ["Use appropriate PPE"],
      reassemblyNotes: ["Inspect components before reassembly"]
    };
  }

  private static analyzeToolAccess(
    element1: EnhancedElement,
    element2: EnhancedElement,
    relationshipType: string
  ): ToolAccessInfo {
    return {
      accessDirection: "axial",
      clearanceRequired: 15,
      toolType: ["Socket wrench"],
      torqueMethod: "manual",
      verificationMethod: "Visual inspection",
      accessibility: "good"
    };
  }

  private static generateQualityRequirements(
    relationshipType: string,
    assemblyInterface: AssemblyInterface
  ): QualityRequirement[] {
    const requirements: QualityRequirement[] = [];

    if (relationshipType === "bolted") {
      requirements.push({
        parameter: "Fastener torque",
        specification: "Per torque specification",
        tolerance: "±5%",
        inspectionMethod: "Torque wrench verification",
        frequency: "every",
        documentation: true
      });
    }

    return requirements;
  }

  private static determineFastenerSize(contactArea: number): string {
    if (contactArea < 50) return "M6";
    if (contactArea < 200) return "M8";
    if (contactArea < 500) return "M10";
    if (contactArea < 1000) return "M12";
    return "M16";
  }

  private static calculateFastenerQuantity(contactArea: number, fastenerSize: string): number {
    const fastenerArea = this.getFastenerStressArea(fastenerSize);
    return Math.max(2, Math.ceil(contactArea / fastenerArea / 100));
  }

  private static getFastenerStressArea(size: string): number {
    const areas: Record<string, number> = {
      "M6": 20.1,
      "M8": 36.6,
      "M10": 58.0,
      "M12": 84.3,
      "M16": 157
    };
    return areas[size] || 20;
  }

  private static selectFastenerMaterial(elements: EnhancedElement[], relationship: AssemblyRelationship): string {
    const materials = elements.map(e => e.engineeringProperties?.material).filter(Boolean);

    if (materials.some(m => m?.includes("stainless"))) {
      return "Stainless Steel 316";
    }

    if (materials.some(m => m?.includes("aluminum"))) {
      return "Stainless Steel 304";
    }

    return "Steel Grade 8.8";
  }

  private static calculateTorqueValue(fastenerSize: string, material: string): number {
    const baseTorques: Record<string, number> = {
      "M6": 10,
      "M8": 25,
      "M10": 50,
      "M12": 85,
      "M16": 210
    };

    let torque = baseTorques[fastenerSize] || 10;

    if (material.includes("12.9")) {
      torque *= 1.4;
    }

    return Math.round(torque);
  }

  private static buildDependencyGraph(
    elements: EnhancedElement[],
    relationships: AssemblyRelationship[]
  ): Map<string, string[]> {
    const graph = new Map<string, string[]>();

    elements.forEach(element => {
      graph.set(element.id, []);
    });

    relationships.forEach(rel => {
      const dependencies = graph.get(rel.childElementId) || [];
      dependencies.push(rel.parentElementId);
      graph.set(rel.childElementId, dependencies);
    });

    return graph;
  }

  private static topologicalSort(
    elements: EnhancedElement[],
    dependencyGraph: Map<string, string[]>
  ): EnhancedElement[] {
    const sorted: EnhancedElement[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (elementId: string) => {
      if (visiting.has(elementId)) {
        throw new Error("Circular dependency detected");
      }

      if (visited.has(elementId)) {
        return;
      }

      visiting.add(elementId);

      const dependencies = dependencyGraph.get(elementId) || [];
      dependencies.forEach(depId => visit(depId));

      visiting.delete(elementId);
      visited.add(elementId);

      const element = elements.find(e => e.id === elementId);
      if (element) {
        sorted.push(element);
      }
    };

    elements.forEach(element => {
      if (!visited.has(element.id)) {
        visit(element.id);
      }
    });

    return sorted;
  }

  private static determineRequiredTools(
    fasteners: FastenerSpecification[],
    relationships: AssemblyRelationship[]
  ): ToolRequirement[] {
    const tools: ToolRequirement[] = [];
    const toolSet = new Set<string>();

    // Add tools from fasteners
    fasteners.forEach(fastener => {
      fastener.torqueSpec.tools.forEach(tool => {
        if (!toolSet.has(tool)) {
          toolSet.add(tool);
          tools.push({
            tool,
            size: fastener.size,
            type: "Fastening",
            purpose: "Fastener installation"
          });
        }
      });
    });

    // Add common assembly tools
    const commonTools = [
      { tool: "Torque wrench", size: "Various", type: "Measurement", purpose: "Torque verification" },
      { tool: "Thread locker", size: "N/A", type: "Consumable", purpose: "Thread locking" }
    ];

    commonTools.forEach(tool => {
      if (!toolSet.has(tool.tool)) {
        toolSet.add(tool.tool);
        tools.push(tool);
      }
    });

    return tools;
  }

  // Additional helper methods with simplified implementations
  private static selectFastenerStandard(size: string): string {
    return "ISO 4762";
  }
  private static selectFastenerCoating(material: string, elements: EnhancedElement[]): string {
    return "Zinc plated";
  }
  private static selectFastenerStrength(relationship: AssemblyRelationship, elements: EnhancedElement[]): string {
    return "8.8";
  }
  private static calculateFastenerLength(relationship: AssemblyRelationship, elements: EnhancedElement[]): number {
    return 25;
  }
  private static selectThreadType(size: string): string {
    return "Metric coarse";
  }
  private static selectHeadType(relationship: AssemblyRelationship, elements: EnhancedElement[]): string {
    return "Socket head";
  }
  private static selectDriveType(size: string): string {
    return "Hex socket";
  }
  private static generateApplicationNotes(relationship: AssemblyRelationship, size: string): string[] {
    return ["Apply thread locker"];
  }
  private static estimateFastenerCost(size: string, quantity: number, material: string): number {
    return quantity * 0.5;
  }
  private static findFastenerAlternates(size: string, material: string): string[] {
    return ["DIN 912 equivalent"];
  }
  private static determineTorqueSequence(quantity: number): string {
    return quantity > 4 ? "Star pattern" : "Cross pattern";
  }
  private static determineTorquePattern(quantity: number): string {
    return "Incremental";
  }
  private static generateTorqueStages(size: string): TorqueStage[] {
    const finalTorque = this.calculateTorqueValue(size, "Steel Grade 8.8");
    return [
      { stage: 1, torque: finalTorque * 0.3, description: "Initial snug" },
      { stage: 2, torque: finalTorque * 0.7, description: "Intermediate torque" },
      { stage: 3, torque: finalTorque, description: "Final torque" }
    ];
  }
  private static generateAssemblyInstructions(sequence: AssemblyStep[]): WorkInstruction[] {
    return [];
  }
  private static generateQualityPlan(
    relationships: AssemblyRelationship[],
    fasteners: FastenerSpecification[]
  ): QualityPlan {
    return {
      inspectionPoints: [],
      testRequirements: [],
      documentation: [],
      certification: [],
      traceability: false
    };
  }
  private static estimateAssemblyTime(sequence: AssemblyStep[], elementCount: number): TimeEstimate {
    const totalTime = sequence.reduce((sum, step) => sum + step.estimatedTime, 0) / 60; // Convert to hours
    return {
      preparation: totalTime * 0.2,
      assembly: totalTime * 0.7,
      inspection: totalTime * 0.1,
      total: totalTime,
      laborCost: totalTime * 50 // $50/hour
    };
  }
  private static estimateAssemblyCost(fasteners: FastenerSpecification[], timeEstimate: TimeEstimate): CostEstimate {
    const materialCost = fasteners.reduce((sum, f) => sum + f.cost, 0);
    return {
      materials: materialCost,
      fasteners: materialCost,
      labor: timeEstimate.laborCost,
      tooling: 100,
      overhead: 50,
      total: materialCost + timeEstimate.laborCost + 150,
      currency: "USD"
    };
  }
  private static assessAssemblyRisks(
    relationships: AssemblyRelationship[],
    fasteners: FastenerSpecification[]
  ): RiskAssessment {
    return {
      risks: [],
      mitigations: [],
      contingencies: [],
      safetyLevel: "low"
    };
  }
  private static getToolsForElement(element: EnhancedElement, fasteners: FastenerSpecification[]): ToolRequirement[] {
    return [];
  }
  private static generateInspectionPoints(
    relationships: AssemblyRelationship[],
    fasteners: FastenerSpecification[]
  ): InspectionPoint[] {
    return [];
  }
  private static generateSafetyNotes(
    element: EnhancedElement,
    relationships: AssemblyRelationship[],
    fasteners: FastenerSpecification[]
  ): string[] {
    return ["Use appropriate PPE"];
  }
  private static generateQualityChecks(
    element: EnhancedElement,
    relationships: AssemblyRelationship[]
  ): QualityCheck[] {
    return [];
  }
  private static estimateStepTime(
    element: EnhancedElement,
    relationships: AssemblyRelationship[],
    fasteners: FastenerSpecification[]
  ): number {
    return 15;
  }
  private static determineSkillLevel(
    relationships: AssemblyRelationship[],
    fasteners: FastenerSpecification[]
  ): AssemblyStep["skillLevel"] {
    return "intermediate";
  }
  private static findStepDependencies(
    element: EnhancedElement,
    relationships: AssemblyRelationship[],
    allElements: EnhancedElement[]
  ): string[] {
    return [];
  }
  private static generateWorkInstructions(
    element: EnhancedElement,
    relationships: AssemblyRelationship[],
    fasteners: FastenerSpecification[]
  ): WorkInstruction[] {
    return [];
  }
}
