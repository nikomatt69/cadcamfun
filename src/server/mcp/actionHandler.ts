/**
 * Action Handler for MCP Server
 *
 * Defines available actions and handles their execution.
 */
import { AvailableAction, ActionParameter, EnrichedContext, RawApplicationContext } from "./types";
import { logger } from "./logger";

// Define all available actions
const availableActions: AvailableAction[] = [
  {
    name: "generateCADComponent",
    description: "Generate a CAD component based on a description",
    parameters: [
      {
        name: "description",
        type: "string",
        description: "Detailed description of the component to generate",
        required: true
      },
      {
        name: "type",
        type: "string",
        description: "Type of component to generate",
        required: true,
        enum: ["cube", "cylinder", "sphere", "cone", "torus", "custom"]
      },
      {
        name: "dimensions",
        type: "object",
        description: "Dimensions of the component",
        required: false,
        defaultValue: { width: 100, height: 100, depth: 100 }
      },
      {
        name: "position",
        type: "object",
        description: "Position of the component",
        required: false,
        defaultValue: { x: 0, y: 0, z: 0 }
      },
      {
        name: "material",
        type: "string",
        description: "Material of the component",
        required: false,
        defaultValue: "aluminum"
      }
    ],
    applicableElementTypes: []
  },
  {
    name: "modifyElement",
    description: "Modify properties of an existing element",
    parameters: [
      {
        name: "elementId",
        type: "string",
        description: "ID of the element to modify",
        required: true
      },
      {
        name: "properties",
        type: "object",
        description: "Properties to modify",
        required: true
      }
    ],
    applicableElementTypes: ["cube", "cylinder", "sphere", "cone", "torus", "model"]
  },
  {
    name: "createExtrusion",
    description: "Create an extrusion from a selected face or sketch",
    parameters: [
      {
        name: "elementId",
        type: "string",
        description: "ID of the face or sketch to extrude",
        required: true
      },
      {
        name: "distance",
        type: "number",
        description: "Extrusion distance",
        required: true,
        min: 0.1,
        max: 1000
      },
      {
        name: "direction",
        type: "string",
        description: "Extrusion direction",
        required: false,
        enum: ["normal", "reverse", "both"],
        defaultValue: "normal"
      }
    ],
    applicableElementTypes: ["face", "sketch"]
  },
  {
    name: "createHole",
    description: "Create a hole in a selected face",
    parameters: [
      {
        name: "faceId",
        type: "string",
        description: "ID of the face to create the hole in",
        required: true
      },
      {
        name: "diameter",
        type: "number",
        description: "Diameter of the hole",
        required: true,
        min: 0.1,
        max: 1000
      },
      {
        name: "depth",
        type: "number",
        description: "Depth of the hole",
        required: true,
        min: 0.1,
        max: 1000
      },
      {
        name: "position",
        type: "object",
        description: "Position of the hole relative to the face",
        required: false,
        defaultValue: { x: 0, y: 0 }
      }
    ],
    applicableElementTypes: ["face"]
  },
  {
    name: "generateToolpath",
    description: "Generate a toolpath for machining",
    parameters: [
      {
        name: "elementIds",
        type: "array",
        description: "IDs of elements to include in the toolpath",
        required: true
      },
      {
        name: "toolDiameter",
        type: "number",
        description: "Diameter of the cutting tool",
        required: true,
        min: 0.1,
        max: 50
      },
      {
        name: "stepover",
        type: "number",
        description: "Step-over percentage for the toolpath",
        required: false,
        defaultValue: 40,
        min: 10,
        max: 90
      },
      {
        name: "strategy",
        type: "string",
        description: "Machining strategy",
        required: false,
        enum: ["contour", "pocket", "drill", "adaptive"],
        defaultValue: "pocket"
      }
    ],
    applicableElementTypes: ["model", "mesh", "solid"]
  },
  {
    name: "optimizeGCode",
    description: "Optimize G-code for a specific machine",
    parameters: [
      {
        name: "gcode",
        type: "string",
        description: "G-code to optimize",
        required: true
      },
      {
        name: "machineType",
        type: "string",
        description: "Type of CNC machine",
        required: true,
        enum: ["3-axis", "4-axis", "5-axis"]
      },
      {
        name: "optimizationGoal",
        type: "string",
        description: "Optimization goal",
        required: false,
        enum: ["speed", "quality", "tool-life", "balanced"],
        defaultValue: "balanced"
      }
    ],
    applicableElementTypes: []
  },
  {
    name: "analyzeModel",
    description: "Analyze a model for machining issues",
    parameters: [
      {
        name: "elementIds",
        type: "array",
        description: "IDs of elements to analyze",
        required: true
      },
      {
        name: "analysisType",
        type: "string",
        description: "Type of analysis to perform",
        required: false,
        enum: ["manufacturability", "structural", "thin-walls", "undercuts"],
        defaultValue: "manufacturability"
      }
    ],
    applicableElementTypes: ["model", "mesh", "solid"]
  }
];

export class ActionHandler {
  /**
   * Get all available actions
   */
  getAvailableActions(): AvailableAction[] {
    return availableActions;
  }

  /**
   * Get available actions based on the current context
   */
  getAvailableActionsForContext(
    mode: RawApplicationContext["mode"],
    selectedElements: EnrichedContext["selectedElements"],
    activeTool?: RawApplicationContext["activeTool"]
  ): AvailableAction[] {
    // Filter actions based on mode
    let filteredActions = availableActions.filter(action => {
      switch (mode) {
        case "cad":
          return ["generateCADComponent", "modifyElement", "createExtrusion", "createHole"].includes(action.name);
        case "cam":
          return ["generateToolpath", "analyzeModel"].includes(action.name);
        case "gcode":
          return ["optimizeGCode"].includes(action.name);
        default:
          return true;
      }
    });

    // Further filter based on selected elements
    if (selectedElements.length > 0) {
      // Get all selected element types
      const selectedTypes = new Set(selectedElements.map(el => el.type));

      // Filter actions to only those applicable to the selected elements
      filteredActions = filteredActions.filter(action => {
        // If no applicable types specified, the action is always available
        if (!action.applicableElementTypes || action.applicableElementTypes.length === 0) {
          return true;
        }

        // Check if any selected type is in the applicable types
        return action.applicableElementTypes.some(type => selectedTypes.has(type));
      });
    }

    // Add contextual hints based on current context
    return filteredActions.map(action => {
      // Add contextual hints
      const contextualHints = this.generateContextualHints(action, mode, selectedElements, activeTool);

      return {
        ...action,
        contextualHints
      };
    });
  }

  /**
   * Generate contextual hints for an action based on current context
   */
  private generateContextualHints(
    action: AvailableAction,
    mode: RawApplicationContext["mode"],
    selectedElements: EnrichedContext["selectedElements"],
    activeTool?: RawApplicationContext["activeTool"]
  ): string[] {
    const hints: string[] = [];

    switch (action.name) {
      case "generateCADComponent":
        hints.push("Provide a detailed description for best results.");
        if (mode === "cad") {
          hints.push("The component will be created at the origin unless a position is specified.");
        }
        break;

      case "modifyElement":
        if (selectedElements.length === 1) {
          hints.push(`Element ${selectedElements[0].name || selectedElements[0].id} is currently selected.`);
        } else if (selectedElements.length > 1) {
          hints.push(
            `${selectedElements.length} elements are currently selected. This action only works on one element.`
          );
        }
        break;

      case "createExtrusion":
        if (selectedElements.some(el => el.type === "face" || el.type === "sketch")) {
          hints.push("A face or sketch is selected that can be extruded.");
        }
        break;

      case "generateToolpath":
        if (mode === "cam") {
          hints.push("Make sure to select appropriate machining parameters for your material.");
        }
        break;
    }

    return hints;
  }

  /**
   * Execute an action with the given parameters
   */
  async executeAction(
    actionName: string,
    parameters: Record<string, any>,
    context: EnrichedContext | null
  ): Promise<any> {
    logger.info(`Executing action: ${actionName}`, { parameters });

    // Find the action definition
    const actionDef = availableActions.find(a => a.name === actionName);
    if (!actionDef) {
      throw new Error(`Unknown action: ${actionName}`);
    }

    // Validate parameters
    this.validateParameters(actionDef, parameters);

    // Execute the appropriate action
    switch (actionName) {
      case "generateCADComponent":
        return this.executeGenerateCADComponent(parameters, context);

      case "modifyElement":
        return this.executeModifyElement(parameters, context);

      case "createExtrusion":
        return this.executeCreateExtrusion(parameters, context);

      case "createHole":
        return this.executeCreateHole(parameters, context);

      case "generateToolpath":
        return this.executeGenerateToolpath(parameters, context);

      case "optimizeGCode":
        return this.executeOptimizeGCode(parameters, context);

      case "analyzeModel":
        return this.executeAnalyzeModel(parameters, context);

      default:
        throw new Error(`Action implementation not found: ${actionName}`);
    }
  }

  /**
   * Validate action parameters against action definition
   */
  private validateParameters(action: AvailableAction, parameters: Record<string, any>) {
    // Check for required parameters
    for (const paramDef of action.parameters) {
      if (paramDef.required && (parameters[paramDef.name] === undefined || parameters[paramDef.name] === null)) {
        throw new Error(`Missing required parameter: ${paramDef.name}`);
      }

      // If parameter is provided, validate its type and constraints
      if (parameters[paramDef.name] !== undefined) {
        const param = parameters[paramDef.name];

        // Type checking
        switch (paramDef.type) {
          case "string":
            if (typeof param !== "string") {
              throw new Error(`Parameter ${paramDef.name} must be a string`);
            }

            // Check enum constraint
            if (paramDef.enum && !paramDef.enum.includes(param)) {
              throw new Error(`Parameter ${paramDef.name} must be one of: ${paramDef.enum.join(", ")}`);
            }

            // Check pattern constraint
            if (paramDef.pattern && !new RegExp(paramDef.pattern).test(param)) {
              throw new Error(`Parameter ${paramDef.name} must match pattern: ${paramDef.pattern}`);
            }
            break;

          case "number":
            if (typeof param !== "number") {
              throw new Error(`Parameter ${paramDef.name} must be a number`);
            }

            // Check min/max constraints
            if (paramDef.min !== undefined && param < paramDef.min) {
              throw new Error(`Parameter ${paramDef.name} must be at least ${paramDef.min}`);
            }
            if (paramDef.max !== undefined && param > paramDef.max) {
              throw new Error(`Parameter ${paramDef.name} must be at most ${paramDef.max}`);
            }
            break;

          case "array":
            if (!Array.isArray(param)) {
              throw new Error(`Parameter ${paramDef.name} must be an array`);
            }
            break;

          case "object":
            if (typeof param !== "object" || param === null || Array.isArray(param)) {
              throw new Error(`Parameter ${paramDef.name} must be an object`);
            }
            break;

          case "boolean":
            if (typeof param !== "boolean") {
              throw new Error(`Parameter ${paramDef.name} must be a boolean`);
            }
            break;
        }
      }
    }
  }

  /**
   * Execute the generateCADComponent action
   */
  private async executeGenerateCADComponent(parameters: Record<string, any>, context: EnrichedContext | null) {
    const { description, type, dimensions, position, material } = parameters;

    // In a real implementation, this would integrate with the CAD engine
    // For now, we'll return a mock result

    // Generate a unique ID for the new component
    const id = `component_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Create the component object
    const component = {
      id,
      type,
      name: `${type}_${id.substring(0, 8)}`,
      description,
      dimensions: dimensions || { width: 100, height: 100, depth: 100 },
      position: position || { x: 0, y: 0, z: 0 },
      material: material || "aluminum",
      created: new Date().toISOString()
    };

    logger.info(`Created CAD component: ${id}`, { type });

    return {
      component,
      message: `Successfully created ${type} component.`
    };
  }

  /**
   * Execute the modifyElement action
   */
  private async executeModifyElement(parameters: Record<string, any>, context: EnrichedContext | null) {
    const { elementId, properties } = parameters;

    // Check if the element exists in the context
    if (!context || !context.selectedElements.some(el => el.id === elementId)) {
      throw new Error(`Element with ID ${elementId} not found in current context`);
    }

    // In a real implementation, this would modify the element in the CAD engine
    // For now, we'll return a mock result

    logger.info(`Modified element: ${elementId}`, { properties });

    return {
      elementId,
      properties,
      message: `Successfully modified element ${elementId}.`
    };
  }

  /**
   * Execute the createExtrusion action
   */
  private async executeCreateExtrusion(parameters: Record<string, any>, context: EnrichedContext | null) {
    const { elementId, distance, direction } = parameters;

    // Check if the element exists in the context
    if (!context || !context.selectedElements.some(el => el.id === elementId)) {
      throw new Error(`Element with ID ${elementId} not found in current context`);
    }

    // In a real implementation, this would create an extrusion in the CAD engine
    // For now, we'll return a mock result

    // Generate a unique ID for the new extrusion
    const id = `extrusion_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    logger.info(`Created extrusion: ${id}`, { elementId, distance, direction });

    return {
      id,
      sourceElementId: elementId,
      distance,
      direction,
      message: `Successfully created extrusion from element ${elementId}.`
    };
  }

  /**
   * Execute the createHole action
   */
  private async executeCreateHole(parameters: Record<string, any>, context: EnrichedContext | null) {
    const { faceId, diameter, depth, position } = parameters;

    // Check if the face exists in the context
    if (!context || !context.selectedElements.some(el => el.id === faceId && el.type === "face")) {
      throw new Error(`Face with ID ${faceId} not found in current context`);
    }

    // In a real implementation, this would create a hole in the CAD engine
    // For now, we'll return a mock result

    // Generate a unique ID for the new hole
    const id = `hole_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    logger.info(`Created hole: ${id}`, { faceId, diameter, depth, position });

    return {
      id,
      faceId,
      diameter,
      depth,
      position: position || { x: 0, y: 0 },
      message: `Successfully created ${diameter}mm hole with depth ${depth}mm.`
    };
  }

  /**
   * Execute the generateToolpath action
   */
  private async executeGenerateToolpath(parameters: Record<string, any>, context: EnrichedContext | null) {
    const { elementIds, toolDiameter, stepover, strategy } = parameters;

    // Check if the elements exist in the context
    if (!context) {
      throw new Error("No context available for generating toolpath");
    }

    // In a real implementation, this would generate a toolpath in the CAM engine
    // For now, we'll return a mock result

    // Generate a unique ID for the new toolpath
    const id = `toolpath_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    logger.info(`Generated toolpath: ${id}`, { elementIds, toolDiameter, strategy });

    return {
      id,
      elementIds,
      toolDiameter,
      stepover: stepover || 40,
      strategy: strategy || "pocket",
      estimatedMachiningTime: Math.floor(Math.random() * 1200) + 300, // Random time between 5-25 minutes (in seconds)
      message: `Successfully generated ${strategy} toolpath with ${toolDiameter}mm tool.`
    };
  }

  /**
   * Execute the optimizeGCode action
   */
  private async executeOptimizeGCode(parameters: Record<string, any>, context: EnrichedContext | null) {
    const { gcode, machineType, optimizationGoal } = parameters;

    // In a real implementation, this would optimize G-code for the specified machine
    // For now, we'll return a mock result

    // Get a sample of the input G-code (first 3 lines)
    const gcodeLines = gcode.split("\n");
    const sampleInput = gcodeLines.slice(0, 3).join("\n") + (gcodeLines.length > 3 ? "\n..." : "");

    logger.info(`Optimized G-code for ${machineType}`, { optimizationGoal, codeLength: gcode.length });

    // Mock optimization metrics
    const optimizationMetrics = {
      originalLines: gcodeLines.length,
      optimizedLines: Math.floor(gcodeLines.length * 0.9), // 10% reduction
      timeReduction: Math.floor(Math.random() * 20) + 5, // 5-25% time reduction
      feedRateImprovement: Math.floor(Math.random() * 15) + 5 // 5-20% feed rate improvement
    };

    return {
      sampleInput,
      optimizedGcode: `; Optimized for ${machineType} with goal: ${optimizationGoal || "balanced"}\n` + gcode,
      machineType,
      optimizationGoal: optimizationGoal || "balanced",
      metrics: optimizationMetrics,
      message: `Successfully optimized G-code for ${machineType}. ${optimizationMetrics.timeReduction}% reduction in machining time.`
    };
  }

  /**
   * Execute the analyzeModel action
   */
  private async executeAnalyzeModel(parameters: Record<string, any>, context: EnrichedContext | null) {
    const { elementIds, analysisType } = parameters;

    // Check if the elements exist in the context
    if (!context) {
      throw new Error("No context available for model analysis");
    }

    // In a real implementation, this would analyze the model in the CAD/CAM engine
    // For now, we'll return a mock result

    logger.info(`Analyzed model`, { elementIds, analysisType });

    // Mock analysis results
    const analysisResults = {
      analysisType: analysisType || "manufacturability",
      elementIds,
      timestamp: new Date().toISOString(),
      issues: [
        {
          type: "thin_wall",
          severity: "warning",
          location: { x: 10, y: 20, z: 30 },
          description: "Wall thickness below recommended minimum (0.8mm)",
          recommendation: "Increase wall thickness to at least 1.5mm"
        },
        {
          type: "sharp_corner",
          severity: "info",
          location: { x: 50, y: 60, z: 70 },
          description: "Sharp internal corner",
          recommendation: "Add fillet to internal corner for better tool access"
        }
      ],
      metrics: {
        volumetricComplexity: 0.7,
        thinWallsCount: 1,
        sharpCornersCount: 1,
        undercuts: 0
      }
    };

    return {
      analysisResults,
      message: `Analysis complete. Found ${analysisResults.issues.length} issues.`
    };
  }
}

// Export the function to get available actions for use in other modules
export function getAvailableActionsForContext(
  mode: RawApplicationContext["mode"],
  selectedElements: EnrichedContext["selectedElements"],
  activeTool?: RawApplicationContext["activeTool"]
): AvailableAction[] {
  const handler = new ActionHandler();
  return handler.getAvailableActionsForContext(mode, selectedElements, activeTool);
}
