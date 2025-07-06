// src/server/mcp/cadcamAgent.ts
import { Session, EnrichedContext, AvailableAction, ActionRequest } from "@/src/server/mcp/types"; // Corrected import path

// Define the structure for an action provided by the CAD/CAM agent
// Based on AvailableAction, but adding an ID for internal agent mapping
export interface CadCamAction extends Omit<AvailableAction, "parameters"> {
  id: string; // Unique ID used internally by the agent
  type: "cad" | "cam" | "general"; // Example specific action types
  parameters: {
    // Define expected parameters for CAD/CAM actions
    featureName?: string;
    dimensions?: Record<string, number>;
    toolId?: string;
    operationType?: string;
    [key: string]: any; // Allow other parameters
  };
}

// Define the result structure when an action is executed
export interface CadCamActionResult {
  success: boolean;
  message: string;
  updatedContext?: Partial<EnrichedContext>; // Use EnrichedContext
  artifacts?: { type: string; data: any }[]; // e.g., generated geometry, G-code
}

// Define the interface for the CAD/CAM agent
export interface ICadCamAgent {
  /**
   * Determines the available CAD/CAM actions based on the current session context.
   * @param session The current MCP session containing context.
   * @returns A list of available CadCamActions.
   */
  getAvailableActions(session: Session): Promise<CadCamAction[]>;

  /**
   * Executes a specific CAD/CAM action.
   * @param actionRequest The action request containing the action name (id) and parameters.
   * @param session The current MCP session.
   * @returns The result of the action execution.
   */
  executeAction(
    actionRequest: Omit<ActionRequest, "sessionId">, // Use action name from request
    session: Session
  ): Promise<CadCamActionResult>;
}

// Placeholder implementation - Replace with your actual cadcamfun logic
class CadCamAgent implements ICadCamAgent {
  async getAvailableActions(session: Session): Promise<CadCamAction[]> {
    const context = session.getContext();
    console.log("Getting available actions for context:", context);

    const actions: CadCamAction[] = [];

    // --- TODO: IMPLEMENT YOUR CAD/CAM LOGIC HERE ---
    // Analyze the 'context: EnrichedContext | null' object.
    // Based on context.summary, context.selectedElements, context.statistics,
    // context.mode (from RawApplicationContext if available), etc.,
    // determine which specific CAD/CAM operations from your 'cadcamfun' library are relevant.

    // Example logic structure:
    // if (context?.mode === 'cad') {
    //   if (!context.selectedElements || context.selectedElements.length === 0) {
    //      actions.push(this.defineCreateBlockAction());
    //      actions.push(this.defineCreateCylinderAction(false)); // Indicate plane selection needed
    //   } else if (context.selectedElements.some(el => el.type === 'plane')) {
    //      actions.push(this.defineCreateCylinderAction(true)); // Plane selected
    //   }
    //   // Add more CAD actions based on context...
    // }
    // if (context?.mode === 'cam' || context?.statistics?.elementCount > 0) {
    //    if (/* check if setup is defined */) {
    //       actions.push(this.defineGenerateGCodeAction());
    //    }
    // }

    // --- Current Examples (Keep or Replace) ---
    actions.push(this.defineCreateBlockAction()); // Example: Always allow creating a simple block
    if (context?.selectedElements?.some(el => el.type === "plane")) {
      actions.push(this.defineCreateCylinderAction(true));
    }
    if (context?.statistics?.elementCount != null && context.statistics.elementCount > 0) {
      actions.push(this.defineGenerateGCodeAction());
    }
    // --- End Current Examples ---

    return actions;
  }

  async executeAction(actionRequest: Omit<ActionRequest, "sessionId">, session: Session): Promise<CadCamActionResult> {
    const context = session.getContext();
    const actionId = actionRequest.action; // This is the action name (e.g., 'Create Block')
    const parameters = actionRequest.parameters;

    console.log(`Executing action "${actionId}" with params:`, parameters);
    console.log("Current context:", context);

    let result: CadCamActionResult;

    // --- TODO: IMPLEMENT YOUR CAD/CAM LOGIC HERE ---
    // Use a switch statement or mapping to call the correct 'cadcamfun' function
    // based on the 'actionId'.
    // Pass the 'parameters' and potentially parts of the 'context'.
    // Perform the actual CAD/CAM operation (e.g., modify geometry, generate toolpath).
    // Calculate the necessary updates for the 'EnrichedContext'.
    // Generate any necessary artifacts (geometry data, G-code, images).

    try {
      switch (actionId) {
        case "Create Block": // Match the 'name' from defineCreateBlockAction
          // result = await this.handleCreateBlock(parameters, context);
          result = this.simulateAction(actionId, parameters, context); // Replace with actual call
          break;

        case "Create Cylinder": // Match the 'name' from defineCreateCylinderAction
          // result = await this.handleCreateCylinder(parameters, context);
          result = this.simulateAction(actionId, parameters, context); // Replace with actual call
          break;

        case "Generate G-code": // Match the 'name' from defineGenerateGCodeAction
          // result = await this.handleGenerateGCode(parameters, context);
          result = this.simulateAction(actionId, parameters, context); // Replace with actual call
          // Add specific artifact for G-code
          result.artifacts = [...(result.artifacts || []), { type: "gcode", data: "G0 X0 Y0 Z10\nG1 X10 F100\nM2" }];
          result.message = "G-code generated successfully.";
          break;

        // Add cases for all other actions you define...

        default:
          console.error(`Unknown action ID: ${actionId}`);
          result = {
            success: false,
            message: `Action "${actionId}" is not implemented.`
          };
      }
    } catch (error: any) {
      console.error(`Error executing action "${actionId}":`, error);
      result = {
        success: false,
        message: `Failed to execute action "${actionId}": ${error.message}`
      };
    }

    // Context update is now handled in the API route (/api/mcp/execute-action.ts)
    // The 'updatedContext' field in the result here signals the desired changes.

    // Recording action in history is also handled in the API route.

    return result;
  }

  // --- Helper methods to define actions (Example structure) ---
  private defineCreateBlockAction(): CadCamAction {
    return {
      id: "cad-create-block", // Internal unique ID for agent logic (optional)
      name: "Create Block", // Name used as actionId in executeAction and shown to AI
      description: "Creates a simple rectangular block.",
      type: "cad",
      parameters: {
        featureName: "Block", // Default parameters / examples
        dimensions: { length: 10, width: 5, height: 2 },
        position: { x: 0, y: 0, z: 0 }
      },
      contextualHints: ["Creates a new block at the origin."],
      applicableElementTypes: [] // Applicable to empty canvas or any context
    };
  }

  private defineCreateCylinderAction(planeSelected: boolean): CadCamAction {
    return {
      id: "cad-create-cylinder",
      name: "Create Cylinder",
      description: "Creates a cylinder.",
      type: "cad",
      parameters: {
        featureName: "Cylinder",
        dimensions: { radius: 3, height: 5 },
        position: { x: 0, y: 0, z: 0 } // Base position
      },
      contextualHints: planeSelected
        ? ["Creates a cylinder, likely on the selected plane."]
        : ["Creates a cylinder. Select a plane first for precise placement."],
      applicableElementTypes: planeSelected ? ["plane"] : []
    };
  }

  private defineGenerateGCodeAction(): CadCamAction {
    return {
      id: "cam-generate-gcode",
      name: "Generate G-code",
      description: "Generates G-code for the current geometry based on CAM setup.",
      type: "cam",
      parameters: {
        toolId: "default-tool",
        operationType: "milling",
        tolerance: 0.01
      },
      contextualHints: ["Requires existing geometry and a CAM setup."],
      applicableElementTypes: [] // Requires geometry in general context
    };
  }

  // --- Placeholder for actual action handlers ---
  // private async handleCreateBlock(params: any, context: EnrichedContext | null): Promise<CadCamActionResult> {
  //    // Call your cadcamfun.createBlock(params.dimensions, params.position, ...)
  //    // Calculate context updates (new element added to statistics, etc.)
  //    // Generate BREP artifact
  //    // return { success: true, message: 'Block created', updatedContext: { ... }, artifacts: [ ... ] };
  // }

  // --- Simulation helper (REMOVE THIS WHEN IMPLEMENTING REAL LOGIC) ---
  private simulateAction(actionId: string, params: any, context: EnrichedContext | null): CadCamActionResult {
    console.log(`Simulating execution of ${actionId} with params:`, params);
    // Simulate context update - THIS IS JUST AN EXAMPLE
    const updatedContext: Partial<EnrichedContext> = {
      summary: `${context?.summary || "Context"}; Executed: ${actionId}`,
      // Simulate adding an element to stats if it was a creation action
      ...(actionId.startsWith("Create") && {
        statistics: {
          ...context?.statistics,
          elementCount: (context?.statistics?.elementCount || 0) + 1
        }
      })
    };
    return {
      success: true,
      message: `Action "${actionId}" simulated successfully.`,
      updatedContext: updatedContext, // Signal desired changes
      artifacts: [
        { type: "simulation_log", data: `Simulated ${actionId} with ${JSON.stringify(params)}` },
        // Add example geometry artifact for creation actions
        ...(actionId.startsWith("Create") ? [{ type: "brep", data: `<simulated_geometry_for_${actionId}>` }] : [])
      ]
    };
  }
}

// Export a singleton instance
export const cadCamAgent = new CadCamAgent();
