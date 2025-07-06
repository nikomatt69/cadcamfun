// src/lib/ai/openaiService.ts - Enhanced for CAD operations & Image Input
import {
  AIMessage,
  AIArtifact,
  AIAction,
  ResponseStyle,
  ComplexityLevel,
  AssistantRole,
  MessageContent,
  TextContentBlock,
  ImageContentBlock,
} from "@/src/types/AITypes";
import { v4 as uuidv4 } from "uuid";
import { aiCache } from "./ai-new/aiCache";

// Interfaccia per forzare uno strumento specifico
interface ForceToolChoice {
  type: "function";
  function: { name: string };
}

// Update OpenAIRequest to handle complex content
interface OpenAIMessage {
  role: string;
  content: MessageContent; // Use the complex type
  name?: string; // For tool/function roles if used later
  tool_calls?: any; // Keep tool call structure
  tool_call_id?: string;
}

interface OpenAIRequest {
  messages: OpenAIMessage[]; // Use updated message type
  model: string;
  temperature: number;
  max_tokens?: number;
  tools?: any[];
  tool_choice?: string | { type: string };
}

interface OpenAIResponse {
  content: string;
  artifacts?: AIArtifact[];
  actions?: { type: string; payload: any; description: string }[];
  fromCache?: boolean;
}

// The specialized CAD system prompt
const CAD_SYSTEM_PROMPT = `You are a specialized CAD modeling AI assistant. Your task is to convert textual descriptions into valid 3D CAD elements that can be rendered in a web-based CAD application.

Output only valid JSON arrays of CAD elements without explanation or commentary.

Guidelines:
- Create geometrically valid elements with realistic dimensions, proportions, and spatial relationships
- Use a coherent design approach with moderate complexity
- Apply a precise design style
- Ensure all elements include required properties for their type
- Position elements appropriately in 3D space with proper relative positions
- Use consistent units (mm) and scale
- For complex assemblies, use hierarchical organization

Element Types & Required Properties:
// Basic Primitives
- cube: x, y, z (center position), width, height, depth, color (hex), wireframe (bool)
- sphere: x, y, z (center position), radius, segments, color (hex), wireframe (bool)
- cylinder: x, y, z (center position), radius, height, segments, color (hex), wireframe (bool)
- cone: x, y, z (base center position), radius, height, segments, color (hex), wireframe (bool)
- torus: x, y, z (center position), radius, tube, radialSegments, tubularSegments, color (hex), wireframe (bool)

// Advanced Primitives
- pyramid: x, y, z (center position), baseWidth, baseDepth, height, color (hex), wireframe (bool)
- prism: x, y, z (center position), radius, height, sides, color (hex), wireframe (bool)
- hemisphere: x, y, z (center position), radius, segments, direction ("up"/"down"), color (hex), wireframe (bool)
- ellipsoid: x, y, z (center position), radiusX, radiusY, radiusZ, segments, color (hex), wireframe (bool)
- capsule: x, y, z (center position), radius, height, direction ("x"/"y"/"z"), color (hex), wireframe (bool)

// 2D Elements
- circle: x, y, z (center position), radius, segments, color (hex), linewidth
- rectangle: x, y, z (center position), width, height, color (hex), linewidth
- triangle: x, y, z (center position), points (array of {x,y}), color (hex), linewidth
- polygon: x, y, z (center position), sides, radius, points (array of {x,y}), color (hex), wireframe (bool)
- ellipse: x, y, z (center position), radiusX, radiusY, segments, color (hex), linewidth
- arc: x, y, z (center position), radius, startAngle, endAngle, segments, color (hex), linewidth

// Curves
- line: x1, y1, z1, x2, y2, z2, color (hex), linewidth
- spline: points (array of {x,y,z}), color (hex), linewidth

All elements can optionally include:
- rotation: {x, y, z} in degrees
- name: descriptive string
- description: additional information

Think of each element as a precise engineering specification.

TOOL SELECTION GUIDELINES:
- For SINGLE element operations: Use updateCADElement or removeCADElement with specific element ID
- For MULTIPLE elements: Use updateMultipleCADElements or removeMultipleCADElements 
- For COMPLEX sequences: Use executeActionChain with multiple steps
- Always provide element IDs from the current canvas context
- For bulk operations, use criteria like elementType, colorFilter, materialFilter
- Confirm operations that affect multiple elements

CRITICAL REQUIREMENTS:
- Every update/remove operation MUST specify exact element IDs or valid selection criteria
- ALL element data MUST be in valid JSON format
- Element IDs must match those in the current canvas context
- Properties must include only valid parameters for each element type
- Always use JSON arrays for multiple elements: [{"id": "...", "properties": {...}}, ...]`;

export class OpenAIService {
  private apiEndpoint = "/api/ai/openai-proxy";
  private defaultModel = "gpt-4.1";

  async sendMessage(
    messages: AIMessage[],
    context: string,
    availableActions: string[] = [],
    responseStyle: ResponseStyle = "detailed",
    complexityLevel: ComplexityLevel = "moderate",
    assistantRole: AssistantRole = "General AI",
    forceToolChoice?: ForceToolChoice,
    structuredContext: string = ""
  ): Promise<OpenAIResponse> {
    // --- Caching Logic Modification ---
    // Basic check: Disable cache if the last message contains images
    const lastMessage = messages[messages.length - 1];
    const hasImages =
      Array.isArray(lastMessage?.content) &&
      lastMessage.content.some((block) => block.type === "image_url");

    let cacheKey = null;
    let cachedResponse = null;

    if (!hasImages) {
      // Only attempt caching if no images in the last message
      const cacheKeyPayload = {
        // Create a serializable representation of messages (e.g., text only or hashes)
        messages: messages.map((m) => ({
          role: m.role,
          // For cache key, simplify content: use text or placeholder for complex content
          content:
            typeof m.content === "string"
              ? m.content
              : Array.isArray(m.content)
                ? m.content
                    .filter((b) => b.type === "text")
                    .map((b) => (b as TextContentBlock).text)
                    .join("\n")
                : "[Unsupported Content]",
        })),
        context,
        availableActions,
        responseStyle,
        complexityLevel,
        assistantRole,
        forceToolChoice,
        model: this.defaultModel,
      };
      cacheKey = aiCache.getKeyForRequest(cacheKeyPayload);
      cachedResponse = aiCache.get<OpenAIResponse>(cacheKey);
    }

    if (cachedResponse) {
      return { ...cachedResponse, fromCache: true };
    }
    if (cacheKey) {
    } else {
    }
    // --- End Caching Logic Modification ---

    try {
      // Get formatted messages AND system prompt
      const { apiMessages, systemPromptString } = this.formatMessagesForApi(
        messages,
        context,
        availableActions,
        responseStyle,
        complexityLevel,
        assistantRole
      );

      // --- Log availableActions before generating tools ---
      console.log("--- Available Actions Passed to getAvailableTools ---");
      console.log(availableActions);
      // --- End Log ---

      // Generate Tools List
      const toolsList = this.getAvailableTools(availableActions);

      // Create the request body with separate system prompt
      const requestBody: any = {
        // Use any temporarily for flexibility
        messages: apiMessages, // Use the filtered/formatted messages
        system: systemPromptString, // Add top-level system parameter
        model: this.defaultModel,
        temperature: 0.7,
        tools: toolsList,
        max_tokens: 6000,
      };

      // Set tool_choice if needed
      if (forceToolChoice) {
        requestBody.tool_choice = forceToolChoice;
      } else if (availableActions.length > 0) {
        requestBody.tool_choice = "auto";
      }

      // Send the request to proxy
      const response = await fetch(this.apiEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody), // Send the correctly formatted body
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to get response from AI");
      }

      const responseData = await response.json();

      const processedResponse = this.processResponse(responseData);

      // --- Cache the new response (only if not an image request) ---
      if (processedResponse && cacheKey) {
        const responseToCache = { ...processedResponse };
        delete responseToCache.fromCache;
        aiCache.set(cacheKey, responseToCache);
      }
      // --- End Caching ---

      return { ...processedResponse, fromCache: false };
    } catch (error) {
      console.error("Error in OpenAI service:", error);
      return {
        content: "Sorry, an error occurred while contacting the AI.",
        artifacts: [],
        actions: [],
        fromCache: false,
      };
    }
  }

  private formatMessagesForApi(
    messages: AIMessage[],
    context: string,
    availableActions: string[],
    responseStyle: ResponseStyle,
    complexityLevel: ComplexityLevel,
    assistantRole: AssistantRole
  ): { apiMessages: OpenAIMessage[]; systemPromptString: string } {
    let systemContent = "";

    // Use specialized CAD prompt if the role is CAD Assistant or CAD Expert
    if (assistantRole === "CAD Assistant" || assistantRole === "CAD Expert") {
      systemContent = CAD_SYSTEM_PROMPT;
      // Optionally append style/complexity if still relevant
      systemContent += `\n\nYou should tailor your response complexity to a '${complexityLevel}' level.`;
      systemContent += `\nYour response style should be: ${responseStyle}.`;
      // Append general context if provided and not already covered implicitly
      if (context) {
        systemContent += `\n\nAdditional Context: ${context}`;
      }
      // NOTE: We are *not* appending the availableActions list here, as the prompt is specific
    } else {
      // Original logic for other roles
      systemContent = `You are an AI assistant. Your current role is: ${assistantRole}.`;
      systemContent += `\nYou should tailor your response complexity to a '${complexityLevel}' level.`;
      systemContent += `\nYour response style should be: ${responseStyle}.`;
      systemContent += `\n${context}`;

      if (availableActions.length > 0) {
        systemContent += `\nAvailable tools: ${availableActions.join(", ")}`;
      }

      switch (assistantRole) {
        // Keep existing role-specific instructions for non-CAD roles
        case "Code Explainer":
          systemContent += `\nFocus on explaining code snippets, identifying potential issues, suggesting improvements, and using precise programming terminology.`;
          break;
        case "Helpful Assistant":
        default:
          systemContent += `\nBe helpful, clear, and provide comprehensive answers to the user's queries. Remember to consider any images provided in the user messages.`;
          break;
      }
    }

    // Append available actions if any
    // Only include if the role is more general, CAD prompt is specific
    if (assistantRole !== "CAD Assistant" && assistantRole !== "CAD Expert") {
      if (availableActions.length > 0) {
        systemContent += `\n\nAvailable Actions: ${availableActions.join(", ")}`;
      }
    }

    // Format messages, handling complex content types
    const apiMessages = messages.map((msg) => {
      let formattedContent: any = msg.content;
      if (typeof msg.content !== "string") {
        // Assume array of content blocks if not string
        formattedContent = msg.content;
      }
      return {
        role: msg.role,
        content: formattedContent,
      } as OpenAIMessage;
    });

    // Prepend system message if content exists
    if (systemContent) {
      return {
        apiMessages: [
          { role: "system", content: systemContent } as OpenAIMessage,
          ...apiMessages,
        ],
        systemPromptString: "", // System prompt now handled in messages array
      };
    } else {
      return { apiMessages, systemPromptString: "" };
    }
  }

  private getAvailableTools(availableActions: string[]) {
    // Define all possible tools with detailed schemas and instructions
    const allTools = {
      generateCADElement: {
        type: "function",
        function: {
          name: "generateCADElement",
          description:
            "Generate one or more CAD components based on a description",
          parameters: {
            type: "object",
            properties: {
              elements: {
                type: "array",
                description: "Array of CAD elements to create",
                items: {
                  type: "object",
                  properties: {
                    type: {
                      type: "string",
                      enum: [
                        "cube",
                        "sphere",
                        "cylinder",
                        "cone",
                        "torus",
                        "pyramid",
                        "prism",
                        "hemisphere",
                        "ellipsoid",
                        "capsule",
                        "circle",
                        "rectangle",
                        "triangle",
                        "polygon",
                        "ellipse",
                        "arc",
                        "line",
                        "spline",
                        "bezier",
                        "nurbs",
                        "boolean-union",
                        "boolean-subtract",
                        "boolean-intersect",
                        "extrusion",
                        "revolution",
                        "sweep",
                        "loft",
                        "thread",
                        "chamfer",
                        "fillet",
                        "gear",
                        "spring",
                        "screw",
                        "nut",
                        "bolt",
                        "washer",
                        "rivet",
                        "linear-dimension",
                        "angular-dimension",
                        "radius-dimension",
                        "diameter-dimension",
                        "drawing-pen",
                        "drawing-highlighter",
                        "drawing-text",
                        "drawing-eraser",
                        "drawing-screenshot-area",
                        "wall",
                        "floor",
                        "roof",
                        "window",
                        "door",
                        "stair",
                        "column",
                        "text3d",
                        "path3d",
                        "point-cloud",
                        "mesh",
                        "group",
                      ],
                      description: "Type of CAD element",
                    },
                    x: { type: "number", description: "X position" },
                    y: { type: "number", description: "Y position" },
                    z: { type: "number", description: "Z position" },
                    name: {
                      type: "string",
                      description: "Optional name or label for the element",
                    },
                    material: {
                      type: "string",
                      description:
                        "Material of the element (e.g., Steel, Aluminum, ABS Plastic)",
                    },
                    segments: {
                      type: "integer",
                      description:
                        "Number of segments for curved surfaces (controls smoothness)",
                    },
                    width: {
                      type: "number",
                      description: "Width (for cube, rectangle etc.)",
                    },
                    height: {
                      type: "number",
                      description: "Height (for cube, cylinder etc.)",
                    },
                    depth: {
                      type: "number",
                      description: "Depth (for cube etc.)",
                    },
                    radius: {
                      type: "number",
                      description: "Radius (for sphere, cylinder etc.)",
                    },
                    color: {
                      type: "string",
                      description: "Color in hex format (e.g., #FF0000)",
                    },
                    rotation: {
                      type: "object",
                      description: "Rotation in degrees",
                      properties: {
                        x: { type: "number", description: "X rotation" },
                        y: { type: "number", description: "Y rotation" },
                        z: { type: "number", description: "Z rotation" },
                      },
                    },
                  },
                  required: ["type", "id", "properties"],
                },
              },
            },
            required: ["elements"],
          },
        },
      },
      updateCADElement: {
        type: "function",
        function: {
          name: "updateCADElement",
          description:
            "Modifies properties of a SINGLE existing CAD element. Use this ONLY when the user wants to modify ONE specific element (e.g., 'change the large cube to red', 'move the gear 5mm up'). For multiple elements, use 'updateMultipleCADElements' instead. CRITICAL: You must identify the target element using the 'Current Canvas Elements' context and specify the exact element ID and the specific properties to change. If the target element is ambiguous, ask for clarification.",
          parameters: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "ID of the element to update",
              },
              properties: {
                type: "object",
                description: "Properties to update",
                properties: {
                  x: { type: "number", description: "X position" },
                  y: { type: "number", description: "Y position" },
                  z: { type: "number", description: "Z position" },
                  width: { type: "number", description: "Width" },
                  height: { type: "number", description: "Height" },
                  depth: { type: "number", description: "Depth" },
                  radius: { type: "number", description: "Radius" },
                  color: { type: "string", description: "Color in hex format" },
                  wireframe: { type: "boolean", description: "Wireframe" },
                  rotation: {
                    type: "object",
                    description: "Rotation in degrees",
                    properties: {
                      x: { type: "number", description: "X rotation" },
                      y: { type: "number", description: "Y rotation" },
                      z: { type: "number", description: "Z rotation" },
                    },
                  },
                },
              },
            },
            required: ["id", "properties"],
          },
        },
      },
      removeCADElement: {
        type: "function",
        function: {
          name: "removeCADElement",
          description:
            "Deletes a SINGLE existing CAD element. Use this ONLY when the user wants to remove ONE specific element (e.g., 'delete the large cube', 'remove that gear'). For multiple elements, use 'removeMultipleCADElements' instead. CRITICAL: You must identify the target element using the 'Current Canvas Elements' context and specify the exact element ID. If the target is ambiguous, ask for clarification.",
          parameters: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "ID of the element to remove",
              },
              properties: {
                type: "object",
                description: "Properties to remove",
                properties: {
                  x: { type: "number", description: "X position" },
                  y: { type: "number", description: "Y position" },
                  z: { type: "number", description: "Z position" },
                  width: { type: "number", description: "Width" },
                  height: { type: "number", description: "Height" },
                  depth: { type: "number", description: "Depth" },
                  radius: { type: "number", description: "Radius" },
                  color: { type: "string", description: "Color in hex format" },
                  wireframe: { type: "boolean", description: "Wireframe" },
                  rotation: {
                    type: "object",
                    description: "Rotation in degrees",
                    properties: {
                      x: { type: "number", description: "X rotation" },
                      y: { type: "number", description: "Y rotation" },
                      z: { type: "number", description: "Z rotation" },
                    },
                  },
                },
              },
            },
            required: ["id", "properties"],
          },
        },
      },
      updateMultipleCADElements: {
        type: "function",
        function: {
          name: "updateMultipleCADElements",
          description:
            "Updates properties of multiple CAD elements in a single operation. Use this tool when the user wants to modify MULTIPLE elements at once (e.g., 'change all red cubes to blue', 'move all gears 10mm up', 'rotate all spheres 45 degrees'). CRITICAL: You must ALWAYS specify either 1) an array of operations with specific element IDs from the current canvas context, OR 2) bulkCriteria to select elements by type/color/material. The response must include the exact ID and properties being modified for each element.",
          parameters: {
            type: "object",
            properties: {
              operations: {
                type: "array",
                description:
                  "Array of specific update operations - use when you have exact element IDs",
                items: {
                  type: "object",
                  properties: {
                    id: {
                      type: "string",
                      description:
                        "REQUIRED: Exact ID of the element to update (from current canvas context)",
                    },
                    properties: {
                      type: "object",
                      description:
                        "REQUIRED: Specific properties to update for this element",
                      properties: {
                        x: { type: "number", description: "X position" },
                        y: { type: "number", description: "Y position" },
                        z: { type: "number", description: "Z position" },
                        width: { type: "number", description: "Width" },
                        height: { type: "number", description: "Height" },
                        depth: { type: "number", description: "Depth" },
                        radius: { type: "number", description: "Radius" },
                        color: {
                          type: "string",
                          description: "Color in hex format",
                        },
                        wireframe: {
                          type: "boolean",
                          description: "Wireframe",
                        },
                        rotation: {
                          type: "object",
                          description: "Rotation in degrees",
                          properties: {
                            x: { type: "number", description: "X rotation" },
                            y: { type: "number", description: "Y rotation" },
                            z: { type: "number", description: "Z rotation" },
                          },
                        },
                      },
                    },
                  },
                  required: ["id", "properties"],
                },
              },
              bulkCriteria: {
                type: "object",
                description:
                  "Use when selecting elements by criteria instead of specific IDs",
                properties: {
                  elementType: {
                    type: "string",
                    description:
                      "Apply to all elements of this type (e.g., 'cube', 'sphere')",
                  },
                  colorFilter: {
                    type: "string",
                    description:
                      "Apply to elements with this color (hex format)",
                  },
                  materialFilter: {
                    type: "string",
                    description: "Apply to elements with this material",
                  },
                  properties: {
                    type: "object",
                    description: "Properties to apply to all matching elements",
                  },
                },
              },
            },
            required: [],
          },
        },
      },
      removeMultipleCADElements: {
        type: "function",
        function: {
          name: "removeMultipleCADElements",
          description:
            "Removes multiple CAD elements in a single operation. Use this when the user wants to DELETE multiple elements (e.g., 'remove all red objects', 'delete all cubes in this area'). CRITICAL: You must specify either 1) specific element IDs from the current canvas context, OR 2) bulkCriteria to select which elements to remove. Always confirm which elements will be deleted.",
          parameters: {
            type: "object",
            properties: {
              elementIds: {
                type: "array",
                items: { type: "string" },
                description:
                  "REQUIRED when removing specific elements: Array of exact element IDs from current canvas",
              },
              bulkCriteria: {
                type: "object",
                description: "Use when removing elements by criteria",
                properties: {
                  elementType: {
                    type: "string",
                    description: "Remove all elements of this type",
                  },
                  colorFilter: {
                    type: "string",
                    description: "Remove elements with this color",
                  },
                  materialFilter: {
                    type: "string",
                    description: "Remove elements with this material",
                  },
                  positionFilter: {
                    type: "object",
                    description: "Remove elements in specific region",
                    properties: {
                      minX: { type: "number" },
                      maxX: { type: "number" },
                      minY: { type: "number" },
                      maxY: { type: "number" },
                      minZ: { type: "number" },
                      maxZ: { type: "number" },
                    },
                  },
                },
              },
            },
            required: [],
          },
        },
      },
      executeActionChain: {
        type: "function",
        function: {
          name: "executeActionChain",
          description:
            "Executes a sequence of CAD operations with intelligent orchestration. Use this when the user requests COMPLEX multi-step operations (e.g., 'create a gear assembly', 'build and organize components', 'create multiple parts and then group them'). This tool enables conditional logic, automatic rollback, and sequential execution of multiple CAD actions.",
          parameters: {
            type: "object",
            properties: {
              chainId: {
                type: "string",
                description: "Unique identifier for this action sequence",
              },
              steps: {
                type: "array",
                description: "Sequence of actions to execute in order",
                items: {
                  type: "object",
                  properties: {
                    stepId: {
                      type: "string",
                      description: "Unique step identifier",
                    },
                    action: {
                      type: "string",
                      enum: [
                        "generateCADElement",
                        "updateCADElement",
                        "removeCADElement",
                        "updateMultipleCADElements",
                        "removeMultipleCADElements",
                        "groupCADElements",
                      ],
                      description: "CAD action to execute",
                    },
                    payload: {
                      type: "object",
                      description:
                        "Parameters for the action (must match the target action's requirements)",
                    },
                    condition: {
                      type: "object",
                      description:
                        "Optional condition to check before executing this step",
                      properties: {
                        type: {
                          type: "string",
                          enum: [
                            "element_exists",
                            "element_count",
                            "property_value",
                          ],
                        },
                        target: {
                          type: "string",
                          description:
                            "What to check (element ID, property name, etc.)",
                        },
                        operator: {
                          type: "string",
                          enum: [
                            "equals",
                            "not_equals",
                            "greater_than",
                            "less_than",
                            "contains",
                          ],
                        },
                        value: { description: "Value to compare against" },
                      },
                    },
                    onSuccess: {
                      type: "array",
                      items: { type: "string" },
                      description: "Step IDs to execute if this step succeeds",
                    },
                    onFailure: {
                      type: "array",
                      items: { type: "string" },
                      description: "Step IDs to execute if this step fails",
                    },
                  },
                  required: ["stepId", "action", "payload"],
                },
              },
              rollbackOnFailure: {
                type: "boolean",
                description:
                  "Whether to rollback all changes if any step fails",
                default: true,
              },
            },
            required: ["chainId", "steps"],
          },
        },
      },
      groupCADElements: {
        type: "function",
        function: {
          name: "groupCADElements",
          description: "Group multiple CAD elements together",
          parameters: {
            type: "object",
            properties: {
              elementIds: {
                type: "array",
                items: { type: "string" },
                description: "IDs of elements to group",
              },
              groupName: { type: "string", description: "Name for the group" },
            },
            required: ["elementIds"],
          },
        },
      },
      autoQuoteCADElements: {
        type: "function",
        function: {
          name: "autoQuoteCADElements",
          description:
            "Automatically adds dimension lines and measurements to CAD elements using the predefined dimension types: linear-dimension, angular-dimension, radius-dimension, and diameter-dimension.",
          parameters: {
            type: "object",
            properties: {
              elementIds: {
                type: "array",
                items: { type: "string" },
                description:
                  "IDs of elements to add quotation to. If empty, all elements will be quoted.",
              },
              style: {
                type: "string",
                enum: [
                  "architectural",
                  "engineering",
                  "manufacturing",
                  "minimal",
                ],
                description: "Style of dimension lines and quotation markers",
                default: "engineering",
              },
              units: {
                type: "string",
                enum: ["mm", "cm", "in", "ft"],
                description: "Units to display in measurements",
                default: "mm",
              },
              dimensionTypes: {
                type: "array",
                items: {
                  type: "string",
                  enum: [
                    "linear-dimension",
                    "angular-dimension",
                    "radius-dimension",
                    "diameter-dimension",
                  ],
                },
                description: "Types of dimensions to apply",
                default: ["linear-dimension", "diameter-dimension"],
              },
              layout: {
                type: "string",
                enum: ["aligned", "orthogonal", "baseline", "ordinate"],
                description: "Layout style for dimension lines",
                default: "aligned",
              },
              placement: {
                type: "string",
                enum: ["auto", "inside", "outside"],
                description: "Placement strategy for dimension text",
                default: "auto",
              },
            },
            required: [],
          },
        },
      },
      analyzeManufacturability: {
        type: "function",
        function: {
          name: "analyzeManufacturability",
          description:
            "Analyzes CAD design for manufacturability, providing feedback on potential issues, manufacturing methods, and cost estimates.",
          parameters: {
            type: "object",
            properties: {
              manufacturingMethod: {
                type: "string",
                enum: [
                  "3d_printing",
                  "cnc_machining",
                  "injection_molding",
                  "sheet_metal",
                  "casting",
                ],
                description: "Manufacturing method to analyze for",
              },
              material: {
                type: "string",
                description:
                  "Material to consider for manufacturing (e.g., ABS, PLA, aluminum, steel)",
              },
              tolerance: {
                type: "string",
                enum: ["low", "medium", "high", "precision"],
                description: "Required manufacturing tolerance",
              },
            },
            required: ["manufacturingMethod"],
          },
        },
      },

      generate2DTechnicalDrawings: {
        type: "function",
        function: {
          name: "generate2DTechnicalDrawings",
          description:
            "Generates 2D technical drawings from the 3D CAD model, including multiple views, section views, and detailed dimensions.",
          parameters: {
            type: "object",
            properties: {
              standard: {
                type: "string",
                enum: ["ANSI", "ISO", "DIN", "JIS"],
                description: "Technical drawing standard to follow",
              },
              views: {
                type: "array",
                items: {
                  type: "string",
                  enum: [
                    "front",
                    "top",
                    "side",
                    "isometric",
                    "section_a",
                    "section_b",
                    "detail",
                  ],
                },
                description: "Views to include in the drawing",
              },
              paperSize: {
                type: "string",
                enum: [
                  "A0",
                  "A1",
                  "A2",
                  "A3",
                  "A4",
                  "ANSI_A",
                  "ANSI_B",
                  "ANSI_C",
                  "ANSI_D",
                  "ANSI_E",
                ],
                description: "Paper size for the drawing",
              },
            },
            required: ["standard", "views"],
          },
        },
      },

      simulatePhysicalProperties: {
        type: "function",
        function: {
          name: "simulatePhysicalProperties",
          description:
            "Simulates physical properties of the CAD model, such as weight, center of gravity, and basic stress analysis.",
          parameters: {
            type: "object",
            properties: {
              material: {
                type: "string",
                description:
                  "Material for simulation (e.g., aluminum, steel, plastic)",
              },
              properties: {
                type: "array",
                items: {
                  type: "string",
                  enum: [
                    "weight",
                    "center_of_gravity",
                    "moment_of_inertia",
                    "stress",
                    "thermal",
                  ],
                },
                description: "Physical properties to simulate",
              },
            },
            required: ["material", "properties"],
          },
        },
      },
      chainOfThoughtAnalysis: {
        type: "function",
        function: {
          name: "chainOfThoughtAnalysis",
          description:
            "Performs a step-by-step analysis of a user request or goal to break it down into smaller actions or provide insights.",
          parameters: {
            type: "object",
            properties: {
              goal: {
                type: "string",
                description:
                  "The user's high-level goal or request to analyze.",
              },
            },
            required: ["goal"],
          },
        },
      },
      suggestOptimizations: {
        type: "function",
        function: {
          name: "suggestOptimizations",
          description:
            "Analyzes the current CAD model (elements provided in context) and suggests potential design optimizations or improvements.",
          parameters: { type: "object", properties: {} }, // No specific parameters needed, uses context
        },
      },
      thinkAloudMode: {
        type: "function",
        function: {
          name: "thinkAloudMode",
          description:
            "Enables or disables a mode where the assistant explains its reasoning process step-by-step.",
          parameters: {
            type: "object",
            properties: {
              enable: {
                type: "boolean",
                description: "Set to true to enable, false to disable.",
              },
            },
            required: ["enable"],
          },
        },
      },
      exportCADProjectAsZip: {
        type: "function",
        function: {
          name: "exportCADProjectAsZip",
          description:
            "Exports the current CAD project elements as a downloadable ZIP archive.",
          parameters: {
            type: "object",
            properties: {
              filename: {
                type: "string",
                description: "Optional filename for the exported ZIP file.",
              },
            },
          },
        },
      },
      generateToolpath: {
        type: "function",
        function: {
          name: "generateToolpath",
          description:
            "Generates a CAM toolpath for a selected CAD element or face, given a machining strategy (e.g., pocketing, contouring, drilling, facing) and cutting tool parameters. This tool helps in preparing the CAD model for manufacturing.",
          parameters: {
            type: "object",
            properties: {
              elementId: {
                type: "string",
                description:
                  "ID of the CAD element or specific face to machine.",
              },
              strategy: {
                type: "string",
                enum: [
                  "pocketing",
                  "contouring",
                  "drilling",
                  "facing",
                  "3d_surface_milling",
                ],
                description: "The machining strategy to apply.",
              },
              tool: {
                type: "object",
                description: "Parameters of the cutting tool.",
                properties: {
                  type: {
                    type: "string",
                    enum: [
                      "endmill",
                      "ballmill",
                      "drill",
                      "facemill",
                      "bullnosemill",
                    ],
                    description: "Type of cutting tool.",
                  },
                  diameter: {
                    type: "number",
                    description: "Diameter of the tool in mm.",
                  },
                  fluteLength: {
                    type: "number",
                    description: "Flute length of the tool in mm (optional).",
                  },
                  cornerRadius: {
                    type: "number",
                    description:
                      "Corner radius for bullnose or ballmill in mm (optional).",
                  },
                },
                required: ["type", "diameter"],
              },
              machiningParameters: {
                type: "object",
                description: "Strategy-specific machining parameters.",
                properties: {
                  stepover: {
                    type: "number",
                    description:
                      "Stepover percentage or mm (e.g., 0.5 for 50% of tool diameter).",
                  },
                  depthOfCut: {
                    type: "number",
                    description: "Depth of each cutting pass in mm.",
                  },
                  feedRate: {
                    type: "number",
                    description: "Feed rate in mm/min.",
                  },
                  spindleSpeed: {
                    type: "number",
                    description: "Spindle speed in RPM.",
                  },
                },
                required: ["depthOfCut"],
              },
            },
            required: ["elementId", "strategy", "tool", "machiningParameters"],
          },
        },
      },
      applyMaterialToElement: {
        type: "function",
        function: {
          name: "applyMaterialToElement",
          description:
            "Applies a material from a predefined library to one or more specified CAD elements. This affects simulation, analysis, and rendering.",
          parameters: {
            type: "object",
            properties: {
              elementIds: {
                type: "array",
                items: { type: "string" },
                description:
                  "Array of IDs of the CAD elements to apply the material to.",
              },
              materialName: {
                type: "string",
                description:
                  'Name of the material from the library (e.g., "Aluminum 6061", "ABS Plastic", "Steel AISI 1020").',
              },
            },
            required: ["elementIds", "materialName"],
          },
        },
      },
      createLinearPattern: {
        type: "function",
        function: {
          name: "createLinearPattern",
          description:
            "Creates a linear pattern (array) of a specified CAD element along a defined direction with a specific count and spacing.",
          parameters: {
            type: "object",
            properties: {
              elementId: {
                type: "string",
                description: "ID of the CAD element to pattern.",
              },
              direction: {
                type: "object",
                description: "Vector defining the direction of the pattern.",
                properties: {
                  x: {
                    type: "number",
                    description: "X component of the direction vector.",
                  },
                  y: {
                    type: "number",
                    description: "Y component of the direction vector.",
                  },
                  z: {
                    type: "number",
                    description: "Z component of the direction vector.",
                  },
                },
                required: ["x", "y", "z"],
              },
              count: {
                type: "integer",
                minimum: 2,
                description:
                  "Number of instances in the pattern (including the original).",
              },
              spacing: {
                type: "number",
                description: "Distance between instances in mm.",
              },
            },
            required: ["elementId", "direction", "count", "spacing"],
          },
        },
      },
      createCircularPattern: {
        type: "function",
        function: {
          name: "createCircularPattern",
          description:
            "Creates a circular pattern of a specified CAD element around a defined axis and center point.",
          parameters: {
            type: "object",
            properties: {
              elementId: {
                type: "string",
                description: "ID of the CAD element to pattern.",
              },
              axis: {
                type: "object",
                description:
                  "Vector defining the axis of rotation (e.g., {x:0, y:0, z:1} for Z-axis).",
                properties: {
                  x: {
                    type: "number",
                    description: "X component of the axis vector.",
                  },
                  y: {
                    type: "number",
                    description: "Y component of the axis vector.",
                  },
                  z: {
                    type: "number",
                    description: "Z component of the axis vector.",
                  },
                },
                required: ["x", "y", "z"],
              },
              center: {
                type: "object",
                description: "Center point of the circular pattern in mm.",
                properties: {
                  x: {
                    type: "number",
                    description: "X coordinate of the center.",
                  },
                  y: {
                    type: "number",
                    description: "Y coordinate of the center.",
                  },
                  z: {
                    type: "number",
                    description: "Z coordinate of the center.",
                  },
                },
                required: ["x", "y", "z"],
              },
              count: {
                type: "integer",
                minimum: 2,
                description:
                  "Number of instances in the pattern (including the original).",
              },
              angle: {
                type: "number",
                description:
                  "Total angle in degrees for the pattern (e.g., 360 for a full circle, 180 for a semi-circle).",
              },
            },
            required: ["elementId", "axis", "center", "count", "angle"],
          },
        },
      },
      importCADFile: {
        type: "function",
        function: {
          name: "importCADFile",
          description:
            "Imports a CAD file from a given URL or path. Supports common formats like STEP, IGES, STL. The imported geometry will be added to the current scene.",
          parameters: {
            type: "object",
            properties: {
              fileSource: {
                type: "string",
                description: "URL or accessible path to the CAD file.",
              },
              fileType: {
                type: "string",
                enum: ["STEP", "IGES", "STL", "OBJ", "3MF"],
                description: "Type of the CAD file to import.",
              },
              options: {
                type: "object",
                description: "Optional import settings.",
                properties: {
                  position: {
                    type: "object",
                    properties: {
                      x: { type: "number" },
                      y: { type: "number" },
                      z: { type: "number" },
                    },
                    description:
                      "Initial position (x,y,z) for the imported model.",
                  },
                  scale: {
                    type: "number",
                    description: "Uniform scale factor for the imported model.",
                    default: 1.0,
                  },
                  upAxis: {
                    type: "string",
                    enum: ["X", "Y", "Z"],
                    description:
                      "Specifies the up-axis of the imported model if different from standard.",
                  },
                },
              },
            },
            required: ["fileSource", "fileType"],
          },
        },
      },
    };

    if (!availableActions || availableActions.length === 0) {
      return undefined;
    }

    // Filter the tools based on the availableActions list
    const tools = availableActions
      .map((actionName) => allTools[actionName as keyof typeof allTools])
      .filter((tool) => tool !== undefined);

    // --- REMOVED: Log Filtered Tools ---
    // console.log("--- Filtered Tools Provided to AI ---");
    // console.log(JSON.stringify(tools.map(t => t.function.name), null, 2)); // Log names

    return tools.length > 0 ? tools : undefined;
  }

  private processResponse(responseData: any): OpenAIResponse {
    const message = responseData.choices[0].message;

    // Get the original content, default to empty string if null
    let content = message.content || "";

    let actions: { type: string; payload: any; description: string }[] = [];
    if (message.tool_calls && message.tool_calls.length > 0) {
      actions = message.tool_calls.map((call: any) => {
        let payload = {};
        try {
          payload = JSON.parse(call.function.arguments || "{}");
        } catch (e) {
          console.error("Error parsing tool call arguments:", e);
        }
        return {
          type: call.function.name,
          payload: payload,
          description: `Execute ${call.function.name}`, // Placeholder description
        };
      });
    }

    // Extract artifacts if any
    const artifacts = this.extractArtifacts(content);

    return {
      content: this.cleanContentFromArtifacts(content), // Clean content from code blocks
      actions: actions.length > 0 ? actions : undefined,
      artifacts: artifacts.length > 0 ? artifacts : undefined,
      fromCache: false,
    };
  }

  private extractArtifacts(content: string): AIArtifact[] {
    const artifacts: AIArtifact[] = [];
    // Use simpler regex if language detection isn't critical right now
    const codeBlockRegex =
      /```(?:json|javascript|python|html|css|typescript|tsx|jsx|bash|sh|text)?\\n([\s\\S]*?)\\n```/g;
    let match;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      const language = match[0].match(/```(.*?)\\n/)?.[1] || "text";
      const code = match[1];
      artifacts.push({
        id: uuidv4(),
        type: "code",
        language: language,
        content: code,
      });
    }
    return artifacts;
  }

  private cleanContentFromArtifacts(content: string): string {
    // Remove code blocks to clean up the content
    return content.replace(
      /```(?:json|javascript|python|html|css|typescript|tsx|jsx|bash|sh|text)?\\n[\s\\S]*?\\n```/g,
      ""
    );
  }

  private sanitizeToolPayload(toolName: string, payload: any): any {
    // Security: Sanitize tool parameters without changing functionality
    if (!payload || typeof payload !== "object") return payload;

    const allowedProperties: Record<string, string[]> = {
      updateCADElement: ["id", "properties"],
      removeCADElement: ["id", "properties"],
      updateMultipleCADElements: ["operations", "bulkCriteria"],
      removeMultipleCADElements: ["elementIds", "bulkCriteria"],
      groupCADElements: [
        "elementIds",
        "groupName",
        "groupType",
        "groupProperties",
        "selectionCriteria",
      ],
      generateCADElement: ["elements"],
      executeActionChain: ["chainId", "steps", "rollbackOnFailure"],
    };

    const allowed = allowedProperties[toolName];
    if (!allowed) return payload; // Allow unknown tools to pass through

    const sanitized: any = {};
    for (const key of allowed) {
      if (payload.hasOwnProperty(key)) {
        sanitized[key] = payload[key];
      }
    }
    return sanitized;
  }
}

// Export a singleton instance
export const openAIService = new OpenAIService();
