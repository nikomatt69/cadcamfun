import { ApplicationContext, IntentAnalysis } from "../UnifiedAIOrchestrator";
import { Element } from "@/src/store/elementsStore";
import { promptTemplates } from "@/src/lib/ai/ai-new/promptTemplates";

export interface BuiltPrompt {
  systemPrompt: string;
  userPrompt: string;
}

export class ContextualPromptBuilder {
  /**
   * Build enhanced prompt with context awareness
   */
  async buildPrompt(userInput: string, context: ApplicationContext, intent: IntentAnalysis): Promise<BuiltPrompt> {
    try {
      let systemPrompt = "";
      let userPrompt = "";

      // 1. Select template based on intent
      const templateKey = intent.primaryIntent as keyof typeof promptTemplates;
      const selectedTemplate = promptTemplates[templateKey] || promptTemplates.textToCAD;

      // 2. Prepare data for placeholders
      const templateData = {
        description: userInput,
        complexity: intent.estimatedComplexity || context.user.preferences.complexityLevel || "moderate",
        style: context.user.preferences.responseStyle || "default",
        elements: JSON.stringify(context.elements.total.slice(0, 10)),
        currentOperation: intent.primaryIntent,
        currentTool: context.page.activePanel || "unknown",
        machineType: context.gcode?.fileName ? "generic_cnc" : context.page.activePanel || "default_machine",
        material: context.gcode?.fileName
          ? "default_material"
          : context.elements.total[0]?.properties?.material || "generic_material",
        gcode: context.gcode?.content?.substring(0, 1000) || "",
        constraints: this.buildConstraintsPrompt(context, intent)
      };

      // 3. Fill template
      if (typeof selectedTemplate === "object" && "system" in selectedTemplate && "user" in selectedTemplate) {
        systemPrompt = this.fillTemplate(selectedTemplate.system, templateData);
        userPrompt = this.fillTemplate(selectedTemplate.user, templateData);
      } else if (typeof selectedTemplate === "string") {
        userPrompt = this.fillTemplate(selectedTemplate, templateData);
        systemPrompt = this.getIntentContext(intent.primaryIntent);
      } else {
        console.warn("Unexpected prompt template structure for intent:", intent.primaryIntent);
        const base = this.buildBasePrompt(userInput, intent);
        const contextStr = this.buildContextPrompt(context, intent);
        userPrompt = `${base}\n\n${contextStr}`;
        systemPrompt = this.getIntentContext(intent.primaryIntent);
      }

      return {
        systemPrompt,
        userPrompt
      };
    } catch (error) {
      console.error("Error building contextual prompt:", error);
      return {
        systemPrompt: this.getIntentContext(intent.primaryIntent),
        userPrompt: userInput
      };
    }
  }

  /**
   * Fill template placeholders
   */
  private fillTemplate(template: string, data: Record<string, string>): string {
    let filledTemplate = template;
    for (const key in data) {
      const placeholder = `{{${key}}}`;
      filledTemplate = filledTemplate.replace(new RegExp(placeholder, "g"), String(data[key] || ""));
    }
    return filledTemplate;
  }

  /**
   * Build base prompt with user intent
   */
  private buildBasePrompt(userInput: string, intent: IntentAnalysis): string {
    const intentContext = this.getIntentContext(intent.primaryIntent);

    return `${intentContext}\n\nUser Request: "${userInput}"\n\nIntent: ${intent.primaryIntent} (confidence: ${Math.round(intent.confidence * 100)}%)\nComplexity: ${intent.estimatedComplexity}\nEstimated time: ${intent.timeToComplete} seconds`;
  }

  /**
   * Build context-aware prompt section
   */
  private buildContextPrompt(context: ApplicationContext, intent: IntentAnalysis): string {
    const parts: string[] = [];

    // Page context
    parts.push(
      `Current Context:\n- Page: ${context.page.route} (${context.page.section} section, ${context.page.mode} mode)\n- Active panel: ${context.page.activePanel || "none"}`
    );

    // Elements context
    if (context.elements.total.length > 0) {
      parts.push(
        `- Elements: ${context.elements.total.length} total (${this.formatElementTypes(context.elements.types)})\n- Selected: ${context.elements.selected.length} elements\n- Visible: ${context.elements.visible.length} elements`
      );

      if (context.elements.boundingBox) {
        const size = this.calculateModelSize(context.elements.boundingBox);
        parts.push(
          `- Model size: ${size.width.toFixed(1)} × ${size.height.toFixed(1)} × ${size.depth.toFixed(1)} ${context.viewport.units}`
        );
      }
    } else {
      parts.push(`- Elements: No elements in the canvas`);
    }

    // G-code context
    if (context.gcode) {
      parts.push(
        `- G-code: ${context.gcode.fileName} (${context.gcode.lines} lines)\n- Errors: ${context.gcode.errors.length}, Warnings: ${context.gcode.warnings.length}`
      );
    }

    // User context
    parts.push(
      `- User: ${context.user.skillLevel} level, ${context.user.workingStyle} style\n- Recent actions: ${context.user.recentActions
        .slice(-3)
        .map(a => a.type)
        .join(", ")}`
    );

    // Session context
    parts.push(
      `- Session: ${context.session.totalActions} actions, ${context.session.successfulOperations} successful\n- Success rate: ${Math.round((context.session.successfulOperations / Math.max(1, context.session.totalActions)) * 100)}%`
    );

    return parts.join("\n");
  }

  /**
   * Build domain-specific guidance
   */
  private buildDomainPrompt(context: ApplicationContext, intent: IntentAnalysis): string {
    const domain = context.page.section;
    const mode = context.page.mode;

    const domainGuidance = {
      cad: {
        design: `Focus on 3D modeling, geometric accuracy, and design intent. Consider:\n- Parametric relationships between elements\n- Manufacturing constraints and tolerances\n- Material properties and structural integrity\n- Design for assembly (DFA) principles`,

        analysis: `Emphasize design validation and optimization:\n- Geometric analysis and interference checking\n- Structural simulation and stress analysis\n- Manufacturing feasibility assessment\n- Design rule checking (DRC)`,

        simulation: `Consider simulation requirements:\n- Physics-based behavior modeling\n- Material property simulation\n- Environmental factors and constraints\n- Performance validation metrics`
      },

      cam: {
        manufacturing: `Focus on manufacturing optimization:\n- Toolpath efficiency and safety\n- Cutting parameters optimization\n- Tool selection and wear analysis\n- Machine capability considerations`,

        analysis: `Emphasize manufacturing analysis:\n- Toolpath quality assessment\n- Cycle time optimization\n- Surface finish prediction\n- Tool wear and life estimation`
      },

      gcode: `Focus on G-code optimization and validation:\n- Code syntax and compliance checking\n- Motion efficiency and smoothness\n- Safety considerations and collision avoidance\n- Machine-specific post-processing requirements`
    };

    let guidance = "";
    if (domain === "cad") {
      guidance = domainGuidance.cad[mode as keyof typeof domainGuidance.cad] || domainGuidance.cad.design;
    } else if (domain === "cam") {
      guidance = domainGuidance.cam[mode as keyof typeof domainGuidance.cam] || domainGuidance.cam.manufacturing;
    } else if (domain === "gcode") {
      guidance = domainGuidance.gcode;
    } else {
      // Default guidance or a generic one if domain/mode doesn't match
      guidance = domainGuidance.cad.design; // Fallback to general CAD design
    }

    return `Domain Guidelines (${domain.toUpperCase()}):\n${guidance}`;
  }

  /**
   * Build constraints and preferences prompt
   */
  private buildConstraintsPrompt(context: ApplicationContext, intent: IntentAnalysis): string {
    const parts: string[] = [];

    // User preferences
    const prefs = context.user.preferences;
    parts.push(
      `User Preferences:\n- Model: ${prefs.preferredModel}\n- Response style: ${prefs.responseStyle}\n- Complexity level: ${prefs.complexityLevel}\n- Language: ${prefs.language}\n- Auto suggestions: ${prefs.autoSuggestions ? "enabled" : "disabled"}\n- Context sensitivity: ${prefs.contextSensitivity}`
    );

    // Viewport constraints
    parts.push(
      `Viewport Settings:\n- Units: ${context.viewport.units}\n- View: ${context.viewport.view}\n- Grid: ${context.viewport.grid ? "visible" : "hidden"}\n- Zoom: ${context.viewport.camera.zoom.toFixed(2)}x`
    );

    // Context dependency constraints
    if (intent.contextDependency === "critical" || intent.contextDependency === "high") {
      parts.push(
        `Context Requirements:\n- Context dependency: ${intent.contextDependency}\n- Must consider existing elements and their relationships\n- Maintain design consistency and compatibility`
      );
    }

    // Target elements constraints
    if (intent.targetElements && intent.targetElements.length > 0) {
      parts.push(`Target Elements: ${intent.targetElements.join(", ")}`);
    }

    return parts.join("\n\n");
  }

  /**
   * Build examples prompt for better guidance
   */
  private buildExamplesPrompt(intent: IntentAnalysis, context: ApplicationContext): string {
    const examples = this.getRelevantExamples(intent, context);

    if (examples.length === 0) {
      return "";
    }

    return `Relevant Examples:\n${examples.map((example, index) => `${index + 1}. ${example}`).join("\n")}`;
  }

  /**
   * Get intent-specific context
   */
  private getIntentContext(intent: IntentAnalysis["primaryIntent"] | "generate"): string {
    const contexts: Record<IntentAnalysis["primaryIntent"] | "generate", string> = {
      create:
        "You are a CAD design assistant specialized in creating 3D models and components. Your task is to generate precise, manufacturable geometric elements.",
      generate:
        "You are a CAD generation assistant. Your primary task is to interpret descriptions and create corresponding CAD elements according to specified guidelines.",
      modify:
        "You are a CAD modification specialist. Your task is to intelligently modify existing elements while preserving design intent and relationships.",

      analyze:
        "You are a design analysis expert. Your task is to evaluate CAD models for structural integrity, manufacturability, and design optimization.",

      optimize:
        "You are an optimization specialist. Your task is to improve designs for performance, manufacturing efficiency, or other specified criteria.",

      export:
        "You are a CAD export specialist. Your task is to guide users through proper export procedures and format selection.",

      learn:
        "You are a CAD/CAM education specialist. Your task is to provide clear, educational explanations tailored to the user's skill level.",

      chat: "You are a helpful CAD/CAM assistant. Your task is to provide informative and context-aware responses to user questions."
    };

    return contexts[intent] || contexts.chat;
  }

  /**
   * Format element types for display
   */
  private formatElementTypes(types: Record<string, number>): string {
    return Object.entries(types)
      .map(([type, count]) => `${count} ${type}${count > 1 ? "s" : ""}`)
      .join(", ");
  }

  /**
   * Calculate model size from bounding box
   */
  private calculateModelSize(boundingBox: NonNullable<ApplicationContext["elements"]["boundingBox"]>) {
    return {
      width: boundingBox.max.x - boundingBox.min.x,
      height: boundingBox.max.y - boundingBox.min.y,
      depth: boundingBox.max.z - boundingBox.min.z
    };
  }

  /**
   * Get relevant examples based on context
   */
  private getRelevantExamples(intent: IntentAnalysis, context: ApplicationContext): string[] {
    const examples: string[] = [];

    // Intent-based examples
    switch (intent.primaryIntent) {
      case "create":
      case "generate":
        if (context.elements.total.length === 0) {
          examples.push('Create a 50mm cube at origin: type="cube", x=0, y=0, z=0, width=50, height=50, depth=50');
        } else {
          examples.push("Create complementary elements that work with existing geometry");
        }
        break;

      case "modify":
        if (context.elements.selected.length > 0) {
          examples.push("Modify selected elements while preserving their relationships");
        }
        break;

      case "analyze":
        examples.push("Provide structural analysis, interference checking, and manufacturability assessment");
        break;

      case "optimize":
        if (context.page.section === "cam") {
          examples.push("Optimize toolpaths for cycle time, surface finish, and tool life");
        } else {
          examples.push("Optimize geometry for weight reduction, stress distribution, or manufacturing");
        }
        break;
    }

    // Context-based examples
    if (context.user.skillLevel === "beginner") {
      examples.push("Provide step-by-step guidance with clear explanations");
    } else if (context.user.skillLevel === "expert") {
      examples.push("Focus on advanced techniques and optimization strategies");
    }

    return examples.slice(0, 3);
  }

  /**
   * Combine all prompt parts into final prompt
   */
  private combinePromptParts(parts: {
    base: string;
    context: string;
    domain: string;
    constraints: string;
    examples: string;
  }): string {
    const sections: string[] = [parts.base];

    if (parts.context) {
      sections.push(parts.context);
    }

    if (parts.domain) {
      sections.push(parts.domain);
    }

    if (parts.constraints) {
      sections.push(parts.constraints);
    }

    if (parts.examples) {
      sections.push(parts.examples);
    }

    // Add final instructions
    sections.push(
      `Instructions:\n- Provide precise, actionable responses\n- Consider the current context and user preferences\n- Follow domain-specific best practices\n- Ensure compatibility with existing elements\n- Use appropriate technical terminology for the user\'s skill level`
    );

    return sections.join("\n\n");
  }
}
