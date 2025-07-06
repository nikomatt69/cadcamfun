/**
 * Validators for MCP Server
 *
 * Validates incoming requests to ensure they have the required fields.
 */
import { RawApplicationContext, ActionRequest } from "./types";

/**
 * Validate a raw application context
 * @returns error message or null if valid
 */
export function validateContext(context: any): string | null {
  if (!context) {
    return "Context is required";
  }

  // Check required fields
  if (!context.mode) {
    return "Mode is required in context";
  }

  if (!["cad", "cam", "gcode", "toolpath", "analysis"].includes(context.mode)) {
    return `Invalid mode: ${context.mode}`;
  }

  if (!context.activeView) {
    return "activeView is required in context";
  }

  if (!["2d", "3d", "split", "code"].includes(context.activeView)) {
    return `Invalid activeView: ${context.activeView}`;
  }

  // Check selectedElements if present
  if (context.selectedElements) {
    if (!Array.isArray(context.selectedElements)) {
      return "selectedElements must be an array";
    }

    // Validate each selected element
    for (let i = 0; i < context.selectedElements.length; i++) {
      const element = context.selectedElements[i];

      if (!element.id) {
        return `selectedElements[${i}] is missing id`;
      }

      if (!element.type) {
        return `selectedElements[${i}] is missing type`;
      }
    }
  } else {
    // Initialize as empty array if not present
    context.selectedElements = [];
  }

  return null;
}

/**
 * Validate an action request
 * @returns error message or null if valid
 */
export function validateAction(request: any): string | null {
  if (!request) {
    return "Action request is required";
  }

  if (!request.sessionId) {
    return "sessionId is required in action request";
  }

  if (!request.action) {
    return "action is required in action request";
  }

  if (typeof request.action !== "string") {
    return "action must be a string";
  }

  if (!request.parameters) {
    return "parameters are required in action request";
  }

  if (typeof request.parameters !== "object" || request.parameters === null || Array.isArray(request.parameters)) {
    return "parameters must be an object";
  }

  return null;
}
