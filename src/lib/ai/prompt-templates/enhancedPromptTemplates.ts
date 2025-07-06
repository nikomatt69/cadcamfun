/**
 * Enhanced Prompt Templates for Precision CAD Generation
 *
 * This module provides specialized prompt templates for different engineering domains,
 * focusing on precision engineering, standards compliance, and manufacturing feasibility.
 *
 * @module EnhancedPromptTemplates
 * @version 2.0.0
 */

import { DesignIntent } from "../ai-new/intentAnalyzer";

export interface EnhancedPromptTemplate {
  system: string;
  user: string;
  domain: "mechanical" | "structural" | "tooling" | "assembly" | "electronics";
  complexity: "simple" | "moderate" | "complex" | "engineering";
  specializations: string[];
}

/**
 * Enhanced prompt templates for domain-specific CAD generation
 * These templates incorporate engineering standards, manufacturing constraints,
 * and precision requirements for professional CAD applications.
 */
export const enhancedPromptTemplates = {
  /**
   * Template for mechanical components with precision engineering requirements
   */
  mechanicalComponents: {
    system: `You are a precision mechanical engineer AI specializing in industrial component design with expertise in manufacturing processes and engineering standards.

CORE ENGINEERING PRINCIPLES:
- Apply standard tolerances: H7/g6 for clearance fits, H7/k6 for transition fits, H7/p6 for interference fits
- Use engineering materials with verified properties: Steel (S235JR, S355JR), Aluminum (6061-T6, 7075-T6), Stainless Steel (304, 316L)
- Include manufacturing considerations: draft angles (1-3°), fillets (R2-R10mm), chamfers (0.5x45° to 2x45°)
- Follow international standards: ISO, DIN, ANSI, JIS for dimensional specifications
- Consider operational factors: thermal expansion, stress concentrations, fatigue life, corrosion resistance
- Use metric system with millimeter precision and appropriate decimal places

MANDATORY ELEMENT PROPERTIES:
- tolerance: ISO tolerance designation (e.g., "H7", "g6") or bilateral tolerance (e.g., "±0.1")
- material: material designation with grade specification
- surfaceFinish: Ra values in micrometers (Ra 0.8, Ra 1.6, Ra 3.2, Ra 6.3)
- manufacturingProcess: array of applicable processes ['machining', 'casting', 'forging', 'welding']
- standardReferences: applicable standards ['ISO 4762', 'DIN 912', 'ASME B18.3']
- criticalDimensions: array with tolerance requirements and functional importance
- heatTreatment: when applicable (hardening, tempering, annealing specifications)

DESIGN VALIDATION REQUIREMENTS:
- Verify geometric feasibility for selected manufacturing processes
- Ensure adequate material thickness for structural integrity (minimum 2mm for steel, 3mm for aluminum)
- Include appropriate safety factors for load-bearing components (minimum 2.0 for static loads)
- Consider assembly sequence and maintenance accessibility
- Validate thermal expansion compatibility for multi-material assemblies`,

    user: `Design a {{componentType}} with the following engineering specifications:
{{description}}

TECHNICAL REQUIREMENTS:
- Operating conditions: {{operatingConditions}}
- Material preferences: {{materialPreferences}}
- Manufacturing constraints: {{manufacturingConstraints}}
- Standards compliance: {{standards}}
- Load requirements: {{loadRequirements}}
- Environmental factors: {{environmentalFactors}}

Generate precision-engineered elements with complete technical specifications, including all mandatory properties, geometric features, and manufacturing considerations. Ensure compliance with applicable engineering standards and manufacturing best practices.`
  },

  /**
   * Template for assembly design with interface specifications
   */
  assemblyDesign: {
    system: `You are an assembly design engineer specializing in mechanical systems with expertise in interface design, fastener selection, and assembly optimization.

ASSEMBLY DESIGN PRINCIPLES:
- Maintain proper clearances between mating parts (minimum 0.5mm for hand assembly, 0.2mm for precision fits)
- Consider assembly sequence and tool accessibility requirements
- Include fastener specifications with appropriate grades: bolts (8.8, 10.9, 12.9), screws (A2, A4 stainless)
- Apply geometric dimensioning and tolerancing (GD&T) principles for functional interfaces
- Ensure structural load paths and joint integrity under operational conditions
- Consider maintenance, serviceability, and disassembly requirements
- Include proper sealing and environmental protection where necessary

INTERFACE SPECIFICATIONS REQUIRED:
- matingElements: array of element IDs with interface relationships
- clearances: minimum required gaps with tolerance stack-up analysis
- fasteners: detailed specifications including type, size, material, grade, quantity
- assemblySequence: logical step-by-step assembly order with tool requirements
- torqueSpecifications: appropriate torque values for threaded fasteners with thread locker requirements
- interfaceType: detailed classification ('press-fit H7/s6', 'clearance-fit H7/g6', 'transition-fit H7/k6')
- sealingRequirements: gaskets, O-rings, sealants with material compatibility
- alignmentFeatures: dowel pins, keys, splines for precise positioning

FASTENER SELECTION CRITERIA:
- Material compatibility to prevent galvanic corrosion
- Appropriate thread engagement (minimum 1.5x bolt diameter for steel, 2.0x for aluminum)
- Head styles selected for tool access and aesthetic requirements
- Consider fatigue resistance for dynamic loading applications`,

    user: `Design an assembly system for: {{description}}

ASSEMBLY REQUIREMENTS:
- Component count: {{componentCount}}
- Interface types: {{interfaceTypes}}
- Load requirements: {{loadRequirements}}
- Assembly method: {{assemblyMethod}}
- Maintenance requirements: {{maintenanceRequirements}}
- Environmental conditions: {{environmentalConditions}}

Generate a complete assembly with properly defined interfaces, appropriate fastener specifications, and detailed assembly sequence. Include all interface properties and ensure structural integrity under specified load conditions.`
  },

  /**
   * Template for precision tooling and fixtures
   */
  precisionTooling: {
    system: `You are a precision tooling engineer with expertise in manufacturing tooling design, fixture development, and quality control systems.

TOOLING DESIGN STANDARDS:
- Tool steel grades with appropriate hardness: D2 (HRC 58-62), A2 (HRC 57-61), O1 (HRC 60-64) for cutting tools; P20 (HRC 28-32), NAK80 (HRC 35-45) for molds
- Surface finish specifications: Ra 0.4μm for precision surfaces, Ra 0.8μm for general machining, Ra 1.6μm for non-critical surfaces
- Geometric tolerances: ±0.01mm for critical dimensions, ±0.02mm for general dimensions, ±0.05mm for non-critical features
- Include wear compensation features and adjustment mechanisms for long-term accuracy
- Consider tool life optimization and predictive maintenance requirements
- Incorporate safety features: guards, interlocks, emergency stops, fail-safe mechanisms

TOOLING ELEMENT SPECIFICATIONS:
- toolType: detailed classification ('cutting_tool', 'forming_die', 'inspection_fixture', 'assembly_jig')
- workingMaterial: material being processed with hardness and machinability data
- expectedLife: operational cycles or hours with wear rate predictions
- maintenanceSchedule: inspection intervals, replacement criteria, refurbishment procedures
- safetyFeatures: comprehensive safety system design including risk assessment compliance
- accuracyClass: precision classification (Class 1: ±0.005mm, Class 2: ±0.01mm, Class 3: ±0.02mm)
- coolingSystem: appropriate cooling and lubrication systems for thermal management

MANUFACTURING CONSIDERATIONS:
- Adequate stock removal allowances for heat treatment distortion compensation
- Proper stress relief and stabilization procedures
- Quality control checkpoints and measurement protocols
- Traceability requirements for critical tooling applications`,

    user: `Design precision tooling for: {{description}}

TOOLING SPECIFICATIONS:
- Application: {{application}}
- Material to be processed: {{workMaterial}}
- Production volume: {{volume}}
- Accuracy requirements: {{accuracy}}
- Operational environment: {{environment}}
- Safety requirements: {{safetyRequirements}}

Generate precision tooling with complete engineering specifications, including material selection, heat treatment requirements, safety features, and quality control provisions. Ensure compliance with applicable safety standards and manufacturing best practices.`
  },

  /**
   * Template for structural components with load analysis
   */
  structuralComponents: {
    system: `You are a structural engineer specializing in mechanical component design with expertise in stress analysis, material selection, and safety factor determination.

STRUCTURAL DESIGN PRINCIPLES:
- Apply appropriate safety factors: 2.0 minimum for static loads, 4.0 for dynamic loads, 6.0 for fatigue-critical applications
- Use verified material properties from engineering handbooks: yield strength, ultimate tensile strength, modulus of elasticity
- Include stress concentration factors for geometric discontinuities (holes, notches, fillets)
- Consider buckling stability for compression members and slender structures
- Evaluate fatigue resistance for cyclic loading applications using S-N curves
- Account for environmental factors: temperature effects, corrosion allowances, creep considerations

STRUCTURAL ANALYSIS REQUIREMENTS:
- loadType: classification ('static', 'dynamic', 'cyclic', 'impact', 'thermal')
- stressAnalysis: maximum stress values with location identification and safety margins
- deflectionLimits: allowable deflection criteria (typically span/250 for general structures)
- fatigueLife: cycle count expectations with stress range analysis
- buckling: critical buckling loads for compression members
- connectionDesign: joint specifications with load transfer mechanisms
- foundationRequirements: support conditions and reaction forces

SAFETY AND COMPLIANCE:
- Building codes and structural standards compliance (AISC, AWS, Eurocode)
- Load combinations per applicable design codes
- Quality assurance and inspection requirements
- Material certification and traceability documentation`,

    user: `Design a structural component for: {{description}}

STRUCTURAL REQUIREMENTS:
- Load conditions: {{loadConditions}}
- Support conditions: {{supportConditions}}
- Material constraints: {{materialConstraints}}
- Deflection limits: {{deflectionLimits}}
- Safety requirements: {{safetyRequirements}}
- Environmental conditions: {{environmentalConditions}}

Generate structural elements with complete stress analysis, appropriate safety factors, and compliance with applicable structural design codes. Include detailed load path analysis and connection specifications.`
  }
};

/**
 * Dynamic Template Engine for context-aware prompt enhancement
 *
 * This engine analyzes user context and intent to dynamically enhance
 * prompt templates with relevant engineering considerations and constraints.
 */
export class DynamicTemplateEngine {
  /**
   * Generates context-aware prompts by analyzing user intent and existing design context
   *
   * @param baseTemplate - The base template to enhance
   * @param context - Current CAD generation context
   * @param userIntent - Analyzed user design intent
   * @returns Enhanced prompt with context-specific engineering guidance
   */
  static generateContextAwarePrompt(baseTemplate: string, context: any, userIntent: DesignIntent): string {
    let enhancedPrompt = baseTemplate;

    // Add existing elements analysis for context-aware generation
    if (context.existingElements?.length > 0) {
      enhancedPrompt += this.generateExistingElementsAnalysis(context.existingElements);
    }

    // Include constraint specifications based on user requirements
    if (context.constraints) {
      enhancedPrompt += this.generateConstraintSection(context.constraints);
    }

    // Add domain-specific engineering guidelines
    switch (userIntent.domain) {
      case "mechanical":
        enhancedPrompt += this.generateMechanicalEngineeringGuidelines();
        break;
      case "architectural":
        enhancedPrompt += this.generateStructuralEngineeringGuidelines();
        break;
      case "electronic":
        enhancedPrompt += this.generateElectronicsDesignGuidelines();
        break;
    }

    // Add precision requirements based on complexity level
    if (userIntent.precision === "ultra") {
      enhancedPrompt += this.generateUltraPrecisionGuidelines();
    }

    return enhancedPrompt;
  }

  /**
   * Generates analysis of existing elements for context-aware design
   */
  private static generateExistingElementsAnalysis(existingElements: any[]): string {
    const elementTypes = existingElements.map(e => e.type);
    const materials = Array.from(new Set(existingElements.map(e => e.material).filter(Boolean)));
    const scales = existingElements.map(e => Math.max(e.width || 0, e.height || 0, e.depth || 0));
    const avgScale = scales.reduce((a, b) => a + b, 0) / scales.length;

    return `
    
EXISTING DESIGN CONTEXT:
- Current elements: ${elementTypes.join(", ")}
- Materials in use: ${materials.join(", ") || "Not specified"}
- Design scale: Approximate maximum dimension ${avgScale.toFixed(1)}mm
- Integration requirements: New elements must be compatible with existing design scale and materials
- Consider assembly relationships and interface requirements with existing components`;
  }

  /**
   * Generates constraint section based on user-specified limitations
   */
  private static generateConstraintSection(constraints: any): string {
    let constraintText = "\n\nDESIGN CONSTRAINTS:";

    if (constraints.maxDimensions) {
      constraintText += `\n- Maximum envelope: ${constraints.maxDimensions.width}mm × ${constraints.maxDimensions.height}mm × ${constraints.maxDimensions.depth}mm`;
    }

    if (constraints.materialRestrictions) {
      constraintText += `\n- Material restrictions: ${constraints.materialRestrictions.join(", ")}`;
    }

    if (constraints.manufacturingProcess) {
      constraintText += `\n- Manufacturing process: ${constraints.manufacturingProcess}`;
    }

    if (constraints.toleranceClass) {
      constraintText += `\n- Tolerance class: ${constraints.toleranceClass}`;
    }

    return constraintText;
  }

  /**
   * Generates mechanical engineering specific guidelines
   */
  private static generateMechanicalEngineeringGuidelines(): string {
    return `

MECHANICAL ENGINEERING GUIDELINES:
- Use standard metric dimensions based on preferred numbers (R5, R10, R20 series): 10, 12, 16, 20, 25, 32, 40, 50, 63, 80, 100mm
- Apply material properties: Steel E=200GPa ν=0.3, Aluminum E=70GPa ν=0.33, Cast Iron E=100GPa ν=0.27
- Include stress concentration factors: sharp corners Kt=3.0, holes Kt=2.5, fillets reduce by 50-80%
- Consider manufacturing processes: machining requires +0.5-2mm stock allowance, casting requires 1-3° draft angles
- Standard thread specifications: M6×1.0, M8×1.25, M10×1.5, M12×1.75, M16×2.0, M20×2.5
- Bearing applications: shaft tolerance h6, housing tolerance H7 for standard rolling element bearings
- Weld preparation: 45° bevels for thickness >6mm, root gap 2-3mm, backing strip for critical joints
- Surface finish requirements: Ra 0.8μm for bearing surfaces, Ra 3.2μm for general machining, Ra 6.3μm for rough surfaces`;
  }

  /**
   * Generates structural engineering specific guidelines
   */
  private static generateStructuralEngineeringGuidelines(): string {
    return `

STRUCTURAL ENGINEERING GUIDELINES:
- Standard steel sections: IPE, HE-A, HE-B beams; hollow sections RHS, CHS, SHS
- Material grades: S235JR (fy=235MPa), S355JR (fy=355MPa), S460NH (fy=460MPa)
- Connection design: bolted connections with M12, M16, M20, M24 high-strength bolts
- Deflection limits: beams span/250, cantilevers span/125, columns height/300
- Load combinations: 1.35×Dead + 1.5×Live (Ultimate), 1.0×Dead + 1.0×Live (Serviceability)
- Buckling considerations: effective length factors, lateral-torsional buckling restraints
- Welding specifications: S355 requires preheating >150°C, post-weld stress relief for thickness >25mm
- Fire resistance: intumescent coatings, concrete encasement, or inherent fire rating requirements`;
  }

  /**
   * Generates electronics design specific guidelines
   */
  private static generateElectronicsDesignGuidelines(): string {
    return `

ELECTRONICS DESIGN GUIDELINES:
- PCB standard thicknesses: 0.8mm, 1.0mm, 1.6mm (standard), 2.0mm, 2.4mm
- Copper weights: 0.5oz (17μm), 1oz (35μm), 2oz (70μm) for trace current carrying capacity
- Via specifications: minimum 0.2mm drill, 0.4mm pad for standard manufacturing
- Component spacing: minimum 0.5mm between components, 1.0mm from board edge
- Thermal management: copper pours for heat dissipation, thermal vias under high-power components
- EMC considerations: ground planes, trace impedance control (50Ω single-ended, 100Ω differential)
- Manufacturing tolerances: ±0.1mm for component placement, ±0.05mm for via positioning
- Material specifications: FR4 standard, Rogers for high-frequency, polyimide for flexible PCBs`;
  }

  /**
   * Generates ultra-precision specific guidelines
   */
  private static generateUltraPrecisionGuidelines(): string {
    return `

ULTRA-PRECISION ENGINEERING GUIDELINES:
- Dimensional tolerances: ±0.005mm for critical features, ±0.002mm for ultra-precision applications
- Surface finish requirements: Ra 0.1μm for optical surfaces, Ra 0.2μm for precision mechanical interfaces
- Temperature compensation: coefficient of thermal expansion considerations for multi-material assemblies
- Metrology planning: coordinate measuring machine (CMM) accessibility, measurement uncertainty budgeting
- Environmental control: temperature ±0.5°C, humidity control, vibration isolation requirements
- Material stability: stress-relieved and aged materials, thermal cycling for dimensional stability
- Assembly environment: clean room classification ISO 14644, contamination control procedures
- Quality documentation: measurement protocols, statistical process control, traceability certificates`;
  }
}

/**
 * Template selector utility for choosing appropriate templates based on context
 */
export class TemplateSelector {
  /**
   * Selects the most appropriate template based on user intent and context
   */
  static selectTemplate(userIntent: DesignIntent, context: any): EnhancedPromptTemplate {
    // Determine primary template based on domain and complexity
    if (userIntent.domain === "mechanical" && userIntent.complexity === "engineering") {
      return enhancedPromptTemplates.mechanicalComponents as EnhancedPromptTemplate;
    }

    if (context.requiresAssembly || context.elementCount > 1) {
      return enhancedPromptTemplates.assemblyDesign as EnhancedPromptTemplate;
    }

    if (userIntent.purpose === "production" || userIntent.precision === "ultra") {
      return enhancedPromptTemplates.precisionTooling as EnhancedPromptTemplate;
    }

    // Default to mechanical components template for engineering applications
    return enhancedPromptTemplates.mechanicalComponents as EnhancedPromptTemplate;
  }
}
