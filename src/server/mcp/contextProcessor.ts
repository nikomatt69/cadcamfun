/**
 * Context Processor for MCP Server
 *
 * Processes raw application context into enriched context for AI consumption.
 */
import { RawApplicationContext, EnrichedContext } from "./types";
import { logger } from "./logger";
import { getElementDetails } from "./elementDatabase";
import { getAvailableActionsForContext } from "./actionHandler";

export class ContextProcessor {
  /**
   * Process raw application context into enriched context
   */
  async processContext(rawContext: RawApplicationContext): Promise<EnrichedContext> {
    logger.debug("Processing context", { sessionId: rawContext.sessionId });

    try {
      // Extract basic information
      const { mode, activeView, selectedElements, activeTool } = rawContext;

      // Process selected elements with detailed information
      const processedElements = await this.processSelectedElements(selectedElements);

      // Determine available actions based on the context
      const availableActions = getAvailableActionsForContext(mode, processedElements, activeTool);

      // Generate context summary
      const summary = this.generateContextSummary(rawContext, processedElements);

      // Generate constraints based on the context
      const constraints = this.generateContextConstraints(rawContext);

      // Generate statistics
      const statistics = this.generateStatistics(rawContext);

      // Create enriched context
      const enrichedContext: EnrichedContext = {
        summary,
        selectedElements: processedElements,
        availableActions,
        constraints,
        statistics,
        preferences: this.extractRelevantPreferences(rawContext)
      };

      return enrichedContext;
    } catch (error) {
      logger.error("Error processing context:", error);
      throw new Error(`Failed to process context: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  /**
   * Process selected elements to add detailed information
   */
  private async processSelectedElements(selectedElements: RawApplicationContext["selectedElements"]) {
    // If no elements are selected, return empty array
    if (!selectedElements || selectedElements.length === 0) {
      return [];
    }

    // Process each element to add detailed information
    const processedElements = await Promise.all(
      selectedElements.map(async element => {
        try {
          // Get detailed information for the element
          const details = await getElementDetails(element.id, element.type);

          // Combine raw element with details
          return {
            id: element.id,
            type: element.type,
            name: details?.name || `${element.type}_${element.id.substring(0, 8)}`,
            description: details?.description,
            dimensions: details?.dimensions || {},
            position: details?.position || { x: 0, y: 0, z: 0 },
            material: details?.material,
            // Include any additional properties from the raw element
            ...element.properties
          };
        } catch (error) {
          logger.warn(`Failed to get details for element ${element.id}:`, error);
          // Return basic information if details lookup fails
          return {
            id: element.id,
            type: element.type,
            name: `${element.type}_${element.id.substring(0, 8)}`,
            ...element.properties
          };
        }
      })
    );

    return processedElements;
  }

  /**
   * Generate a human-readable summary of the context
   */
  private generateContextSummary(
    rawContext: RawApplicationContext,
    processedElements: EnrichedContext["selectedElements"]
  ): string {
    const { mode, activeView, activeTool, currentProject } = rawContext;

    // Build summary parts
    const parts: string[] = [];

    // Mode and view
    parts.push(`User is in ${mode.toUpperCase()} mode with ${activeView} view active.`);

    // Active tool
    if (activeTool) {
      parts.push(`The active tool is ${activeTool.name}.`);
    }

    // Current project
    if (currentProject) {
      parts.push(`Working on project: ${currentProject.name}.`);
    }

    // Selected elements
    if (processedElements.length > 0) {
      if (processedElements.length === 1) {
        const element = processedElements[0];
        parts.push(`Selected: 1 ${element.type} (${element.name || element.id}).`);
      } else {
        // Group elements by type
        const elementsByType = processedElements.reduce(
          (acc, element) => {
            acc[element.type] = (acc[element.type] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>
        );

        const elementSummary = Object.entries(elementsByType)
          .map(([type, count]) => `${count} ${type}${count > 1 ? "s" : ""}`)
          .join(", ");

        parts.push(`Selected: ${elementSummary}.`);
      }
    } else {
      parts.push("No elements are currently selected.");
    }

    // Recent operations
    if (rawContext.recentOperations && rawContext.recentOperations.length > 0) {
      const latestOperation = rawContext.recentOperations[0];
      parts.push(`Last operation: ${latestOperation.type}.`);
    }

    return parts.join(" ");
  }

  /**
   * Generate constraints based on the context
   */
  private generateContextConstraints(rawContext: RawApplicationContext) {
    const constraints = [];

    // Mode-specific constraints
    switch (rawContext.mode) {
      case "cad":
        constraints.push({
          type: "design_rules",
          description: "Minimum wall thickness",
          value: 1.0 // mm
        });
        break;
      case "cam":
        constraints.push({
          type: "machining_constraints",
          description: "Maximum tool diameter",
          value: 12.0 // mm
        });
        break;
      case "gcode":
        constraints.push({
          type: "machine_constraints",
          description: "Maximum feed rate",
          value: 5000 // mm/min
        });
        break;
    }

    // Add general constraints
    constraints.push({
      type: "application_constraint",
      description: "Maximum elements",
      value: 10000
    });

    return constraints;
  }

  /**
   * Generate statistics about the workspace
   */
  private generateStatistics(rawContext: RawApplicationContext) {
    // In a real implementation, these would be calculated from the actual application state
    return {
      elementCount: rawContext.selectedElements.length,
      complexityScore: 0.5 // Mock value
    };
  }

  /**
   * Extract relevant user preferences from the context
   */
  private extractRelevantPreferences(rawContext: RawApplicationContext) {
    // In a real implementation, these would come from a user preferences database or service
    return {
      defaultMaterial: "aluminum",
      defaultUnits: "mm",
      defaultTolerance: 0.01,
      colorScheme: "default"
    };
  }
}
