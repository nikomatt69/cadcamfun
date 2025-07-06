import { v4 as uuidv4 } from "uuid";
import { AIAction, AIMessage, ResponseStyle, ComplexityLevel, AssistantRole } from "@/src/types/AITypes";
import { Element, Point } from "@/src/store/elementsStore";
import { openAIService } from "./openaiService";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { useElementsStore } from "src/store/elementsStore";

export interface CADActionHandlerOptions {
  addElementsToCanvas: (elements: Element[]) => void;
  updateElementInCanvas: (id: string, properties: Partial<Element>) => void;
  removeElementFromCanvas: (id: string) => void;
  getCanvasElements: () => Element[];
}

export function createCadActionHandler(options: CADActionHandlerOptions) {
  const { addElementsToCanvas, updateElementInCanvas, removeElementFromCanvas, getCanvasElements } = options;

  return {
    executeAction: async (action: AIAction): Promise<{ success: boolean; message: string; [key: string]: any }> => {
      try {
        switch (action.type) {
          case "generateCADElement":
            return handleGenerateCADElement(action.payload);

          case "updateCADElement":
            return handleUpdateCADElement(action.payload);

          case "removeCADElement":
            return handleRemoveCADElement(action.payload);

          case "groupCADElements":
            return handleGroupCADElements(action.payload);

          // --- NEW ACTION CASES ---
          case "exportCADProjectAsZip":
            return handleExportCADProjectAsZip(action.payload);

          case "thinkAloudMode":
            return handleThinkAloudMode(action.payload);

          case "chainOfThoughtAnalysis":
            return handleChainOfThoughtAnalysis(action.payload);

          case "groupCADElements":
            return handleGroupCADElements(action.payload);

          case "suggestOptimizations":
            return handleSuggestOptimizations(action.payload);
          // --- END NEW ACTION CASES ---
          case "autoQuoteCADElements":
            return handleAutoQuoteCADElements(action.payload);

          case "generate2DTechnicalDrawings":
            return handleGenerate2DTechnicalDrawings(action.payload);

          case "simulatePhysicalProperties":
            return handleSimulatePhysicalProperties(action.payload);

          default:
            return {
              success: false,
              message: `Unknown action type: ${action.type}`
            };
        }
      } catch (error) {
        console.error("Error executing CAD action:", error);
        return {
          success: false,
          message: error instanceof Error ? error.message : "Unknown error executing CAD action"
        };
      }
    },

    getActionDefinitions: () => [
      {
        name: "generateCADElement",
        description: "Generate one or more CAD elements based on description",
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
                    // IMPORTANT: Keep this enum in sync with openaiService.ts
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
                      "group"
                    ],
                    description: "Type of CAD element"
                  },
                  x: { type: "number", description: "X position" },
                  y: { type: "number", description: "Y position" },
                  z: { type: "number", description: "Z position" },
                  name: { type: "string", description: "Optional name/label" },
                  material: { type: "string", description: "Material (e.g., Steel, ABS)" },
                  width: { type: "number", description: "Width" },
                  height: { type: "number", description: "Height" },
                  depth: { type: "number", description: "Depth" },
                  radius: { type: "number", description: "Radius" },
                  color: { type: "string", description: "Color (hex)" },
                  rotation: {
                    type: "object",
                    properties: { x: { type: "number" }, y: { type: "number" }, z: { type: "number" } }
                  },
                  scale: {
                    type: "object",
                    properties: { x: { type: "number" }, y: { type: "number" }, z: { type: "number" } }
                  },
                  additionalProps: {
                    type: "object",
                    description: "Type-specific parameters",
                    additionalProperties: true
                  },
                  thickness: {
                    type: "object",
                    properties: { x: { type: "number" }, y: { type: "number" }, z: { type: "number" } }
                  }
                },
                required: ["type"]
              }
            }
          },
          required: ["elements"]
        }
      },
      {
        name: "updateCADElement",
        description: "Update properties of an existing CAD element",
        // Ensure this definition matches openaiService.ts
        parameters: {
          type: "object",
          properties: {
            id: { type: "string", description: "ID of the element to update" },
            properties: {
              type: "object",
              description: "Properties to update",
              // Add all potentially updatable properties here, mirroring generateCADElement for consistency
              properties: {
                x: { type: "number", description: "X position" },
                y: { type: "number", description: "Y position" },
                z: { type: "number", description: "Z position" },
                name: { type: "string", description: "Optional name/label" },
                material: { type: "string", description: "Material (e.g., Steel, ABS)" },
                width: { type: "number", description: "Width" },
                height: { type: "number", description: "Height" },
                depth: { type: "number", description: "Depth" },
                radius: { type: "number", description: "Radius" },
                color: { type: "string", description: "Color (hex)" },
                rotation: {
                  type: "object",
                  properties: { x: { type: "number" }, y: { type: "number" }, z: { type: "number" } }
                },
                scale: {
                  type: "object",
                  properties: { x: { type: "number" }, y: { type: "number" }, z: { type: "number" } }
                },
                additionalProps: {
                  type: "object",
                  description: "Type-specific parameters",
                  additionalProperties: true
                },
                thickness: {
                  type: "object",
                  properties: { x: { type: "number" }, y: { type: "number" }, z: { type: "number" } }
                }
              }
            }
          },
          required: ["id", "properties"]
        }
      },
      {
        name: "removeCADElement",
        description: "Remove a CAD element from the canvas",
        parameters: {
          type: "object",
          properties: {
            id: { type: "string", description: "ID of the element to remove" }
          },
          required: ["id"]
        }
      },
      {
        name: "groupCADElements",
        description: "Group multiple CAD elements together",
        parameters: {
          type: "object",
          properties: {
            elementIds: {
              type: "array",
              items: { type: "string" },
              description: "IDs of elements to group"
            },
            groupName: { type: "string", description: "Name for the group" }
          },
          required: ["elementIds"]
        }
      },
      {
        name: "autoQuoteCADElements",
        description:
          "Automatically adds dimension lines and measurements to CAD elements using the predefined dimension types: linear-dimension, angular-dimension, radius-dimension, and diameter-dimension.",
        parameters: {
          description:
            "Automatically adds dimension lines and measurements to CAD elements using the predefined dimension types: linear-dimension, angular-dimension, radius-dimension, and diameter-dimension.",
          parameters: {
            type: "object",
            properties: {
              elementIds: {
                type: "array",
                items: { type: "string" },
                description: "IDs of elements to add quotation to. If empty, all elements will be quoted."
              },
              style: {
                type: "string",
                enum: ["architectural", "engineering", "manufacturing", "minimal"],
                description: "Style of dimension lines and quotation markers",
                default: "engineering"
              },
              units: {
                type: "string",
                enum: ["mm", "cm", "in", "ft"],
                description: "Units to display in measurements",
                default: "mm"
              },
              dimensionTypes: {
                type: "array",
                items: {
                  type: "string",
                  enum: ["linear-dimension", "angular-dimension", "radius-dimension", "diameter-dimension"]
                },
                description: "Types of dimensions to apply",
                default: ["linear-dimension", "diameter-dimension"]
              },
              layout: {
                type: "string",
                enum: ["aligned", "orthogonal", "baseline", "ordinate"],
                description: "Layout style for dimension lines",
                default: "aligned"
              },
              placement: {
                type: "string",
                enum: ["auto", "inside", "outside"],
                description: "Placement strategy for dimension text",
                default: "auto"
              }
            },
            required: []
          }
        }
      },
      {
        name: "analyzeManufacturability",
        description:
          "Analyzes CAD design for manufacturability, providing feedback on potential issues, manufacturing methods, and cost estimates.",
        parameters: {
          type: "function",
          function: {
            name: "analyzeManufacturability",
            description:
              "Analyzes CAD design for manufacturability, providing feedback on potential issues, manufacturing methods, and cost estimates.",
            parameters: {
              type: ",object",
              properties: {
                manufacturingMethod: {
                  type: "string",
                  enum: ["3d_printing", "cnc_machining", "injection_molding", "sheet_metal", "casting"],
                  description: "Manufacturing method to analyze for"
                },
                material: {
                  type: "string",
                  description: "Material to consider for manufacturing (e.g., ABS, PLA, aluminum, steel)"
                },
                tolerance: {
                  type: "string",
                  enum: ["low", "medium", "high", "precision"],
                  description: "Required manufacturing tolerance"
                }
              },
              required: ["manufacturingMethod"]
            }
          }
        }
      },
      {
        name: "generate2DTechnicalDrawings",
        description:
          "Generates 2D technical drawings from the 3D CAD model, including multiple views, section views, and detailed dimensions.",
        parameters: {
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
                  description: "Technical drawing standard to follow"
                },
                views: {
                  type: "array",
                  items: {
                    type: "string",
                    enum: ["front", "top", "side", "isometric", "section_a", "section_b", "detail"]
                  },
                  description: "Views to include in the drawing"
                },
                paperSize: {
                  type: "string",
                  enum: ["A0", "A1", "A2", "A3", "A4", "ANSI_A", "ANSI_B", "ANSI_C", "ANSI_D", "ANSI_E"],
                  description: "Paper size for the drawing"
                }
              },
              required: ["standard", "views"]
            }
          }
        }
      },
      {
        name: "simulatePhysicalProperties",
        description:
          "Simulates physical properties of the CAD model, such as weight, center of gravity, and basic stress analysis.",
        parameters: {
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
                  description: "Material for simulation (e.g., aluminum, steel, plastic)"
                },
                properties: {
                  type: "array",
                  items: {
                    type: "string",
                    enum: ["weight", "center_of_gravity", "moment_of_inertia", "stress", "thermal"]
                  },
                  description: "Physical properties to simulate"
                }
              },
              required: ["material", "properties"]
            }
          }
        }
      },
      // --- NEW ACTION DEFINITIONS ---
      {
        name: "exportCADProjectAsZip",
        description:
          "Export the entire CAD project as a compressed .zip file, including geometry, metadata, and preview images if available",
        parameters: {
          type: "object",
          properties: {
            includePreviews: {
              type: "boolean",
              description: "Whether to include PNG previews of each element",
              default: false
            },
            fileName: {
              type: "string",
              description: "Optional name for the ZIP file (default: project-export.zip)"
            }
          }
        }
      },
      {
        name: "thinkAloudMode",
        description: "Enable think-aloud mode to let the assistant verbalize its reasoning during each design step",
        parameters: {
          type: "object",
          properties: {
            enable: {
              type: "boolean",
              description: "Toggle think-aloud mode on or off",
              default: true
            }
          },
          required: ["enable"]
        }
      },
      {
        name: "chainOfThoughtAnalysis",
        description: "Perform a step-by-step analysis and breakdown of the CAD task or problem before executing it",
        parameters: {
          type: "object",
          properties: {
            goal: {
              type: "string",
              description: "Describe the objective or challenge to analyze logically"
            },
            context: {
              type: "object",
              description: "Optional additional context like current scene, constraints, or user preferences",
              additionalProperties: true
            }
          },
          required: ["goal"]
        }
      },
      {
        name: "suggestOptimizations",
        description: "Suggest design or performance optimizations for the current CAD scene or selected elements",
        parameters: {
          type: "object",
          properties: {
            target: {
              type: "string",
              enum: ["geometry", "materials", "transformations", "scene"],
              description: "Area to focus optimization suggestions on"
            },
            selectedIds: {
              type: "array",
              description: "Optional array of selected element IDs to focus optimization on",
              items: { type: "string" }
            }
          }
        }
      }
      // --- END NEW ACTION DEFINITIONS ---
    ]
  };

  // Function to handle auto-quotation of CAD elements
  function handleAutoQuoteCADElements(
    payload: any
  ): Promise<{ success: boolean; message: string; dimensions?: any[] }> {
    return new Promise(resolve => {
      try {
        const {
          elementIds = [],
          style = "engineering",
          units = "mm",
          dimensionTypes = ["linear-dimension", "diameter-dimension"],
          layout = "aligned",
          placement = "auto"
        } = payload;

        console.log(`Auto-quoting elements with style: ${style}, units: ${units}`);

        // Get all elements directly from the store
        const allElements = useElementsStore.getState().elements;
        const targetElements =
          elementIds.length > 0 ? allElements.filter(el => elementIds.includes(el.id)) : allElements;

        if (targetElements.length === 0) {
          return resolve({
            success: false,
            message: "No elements found to add dimensions to."
          });
        }

        // Generated dimension elements array
        const dimensions: any[] = [];

        // Process each element to create appropriate dimensions
        targetElements.forEach(element => {
          // Create dimensions based on element type and requested dimension types
          if (dimensionTypes.includes("linear-dimension")) {
            if (
              element.width !== undefined &&
              typeof element.width === "number" &&
              element.x !== undefined &&
              typeof element.x === "number" &&
              element.y !== undefined &&
              typeof element.y === "number" &&
              element.z !== undefined &&
              typeof element.z === "number"
            ) {
              // Add width dimension
              dimensions.push({
                id: uuidv4(),
                type: "linear-dimension",
                startPoint: { x: element.x - element.width / 2, y: element.y, z: element.z },
                endPoint: { x: element.x + element.width / 2, y: element.y, z: element.z },
                offsetDirection: "y",
                offsetAmount: -20, // Consider making this dynamic or configurable
                value: element.width,
                unit: units,
                linewidth: 1,
                color: "#000000"
              });
            }

            if (
              element.height !== undefined &&
              typeof element.height === "number" &&
              element.x !== undefined &&
              typeof element.x === "number" &&
              element.y !== undefined &&
              typeof element.y === "number" &&
              element.z !== undefined &&
              typeof element.z === "number"
            ) {
              // Add height dimension
              dimensions.push({
                id: uuidv4(),
                type: "linear-dimension",
                startPoint: { x: element.x, y: element.y - element.height / 2, z: element.z },
                endPoint: { x: element.x, y: element.y + element.height / 2, z: element.z },
                offsetDirection: "x",
                offsetAmount: -20, // Consider making this dynamic or configurable
                value: element.height,
                unit: units,
                linewidth: 1,
                color: "#000000"
              });
            }

            if (
              element.depth !== undefined &&
              typeof element.depth === "number" &&
              element.x !== undefined &&
              typeof element.x === "number" &&
              element.y !== undefined &&
              typeof element.y === "number" &&
              element.z !== undefined &&
              typeof element.z === "number"
            ) {
              // Add depth dimension
              dimensions.push({
                id: uuidv4(),
                type: "linear-dimension",
                startPoint: { x: element.x, y: element.y, z: element.z - element.depth / 2 },
                endPoint: { x: element.x, y: element.y, z: element.z + element.depth / 2 },
                offsetDirection: "y",
                offsetAmount: -20, // Consider making this dynamic or configurable
                value: element.depth,
                unit: units,
                linewidth: 1,
                color: "#000000"
              });
            }
          }

          // Add diameter dimensions for circular elements
          if (
            dimensionTypes.includes("diameter-dimension") &&
            ["sphere", "cylinder", "circle"].includes(element.type) &&
            element.radius !== undefined &&
            typeof element.radius === "number" &&
            element.x !== undefined &&
            typeof element.x === "number" &&
            element.y !== undefined &&
            typeof element.y === "number" &&
            element.z !== undefined &&
            typeof element.z === "number"
          ) {
            dimensions.push({
              id: uuidv4(),
              type: "diameter-dimension",
              center: { x: element.x, y: element.y, z: element.z },
              pointOnCircle: { x: element.x + element.radius, y: element.y, z: element.z },
              value: element.radius * 2,
              unit: units,
              linewidth: 1,
              color: "#000000"
            });
          }

          // Add radius dimensions if requested
          if (
            dimensionTypes.includes("radius-dimension") &&
            ["sphere", "cylinder", "circle", "torus", "arc"].includes(element.type) &&
            element.radius !== undefined &&
            typeof element.radius === "number" &&
            element.x !== undefined &&
            typeof element.x === "number" &&
            element.y !== undefined &&
            typeof element.y === "number" &&
            element.z !== undefined &&
            typeof element.z === "number"
          ) {
            dimensions.push({
              id: uuidv4(),
              type: "radius-dimension",
              center: { x: element.x, y: element.y, z: element.z },
              pointOnCircle: { x: element.x + element.radius, y: element.y, z: element.z },
              value: element.radius,
              unit: units,
              linewidth: 1,
              color: "#000000"
            });
          }

          // Add angular dimensions if requested (Added checks for properties)
          if (
            dimensionTypes.includes("angular-dimension") &&
            ["cone", "pyramid"].includes(element.type) &&
            element.height !== undefined &&
            typeof element.height === "number" &&
            ((element.radius !== undefined && typeof element.radius === "number") ||
              (element.baseWidth !== undefined && typeof element.baseWidth === "number")) &&
            element.x !== undefined &&
            typeof element.x === "number" &&
            element.y !== undefined &&
            typeof element.y === "number" &&
            element.z !== undefined &&
            typeof element.z === "number"
          ) {
            // Calculate angle based on element properties
            const baseDim = element.radius !== undefined ? element.radius : element.baseWidth / 2;
            const angle = Math.atan2(element.height, baseDim) * (180 / Math.PI);
            dimensions.push({
              id: uuidv4(),
              type: "angular-dimension",
              vertex: { x: element.x, y: element.y, z: element.z },
              startPoint: { x: element.x + baseDim, y: element.y, z: element.z },
              endPoint: { x: element.x, y: element.y + element.height, z: element.z }, // Simplified end point for angle vis
              value: angle,
              unit: "degrees",
              linewidth: 1,
              color: "#000000"
            });
          }
        });

        // Apply style settings based on selected style
        const styleSettings = getStyleSettings(style);
        dimensions.forEach(dim => {
          dim.linewidth = styleSettings.lineWidth;
          dim.color = styleSettings.lineColor;
          // Note: textPlacement is not directly assignable here,
          // it would need to be handled during rendering or element creation
        });

        // Add the dimensions to the canvas using the store
        if (dimensions.length > 0) {
          useElementsStore.getState().addElements(dimensions);
        }

        resolve({
          success: dimensions.length > 0,
          message:
            dimensions.length > 0
              ? `Added ${dimensions.length} dimension elements in ${style} style with ${units} units.`
              : "No dimensions could be generated for the selected elements.",
          dimensions: dimensions
        });
      } catch (error) {
        console.error("Error in handleAutoQuoteCADElements:", error);
        resolve({
          success: false,
          message: error instanceof Error ? error.message : "Error adding dimensions to elements"
        });
      }
    });

    // Helper function to get style settings
    function getStyleSettings(style: string) {
      const styles = {
        engineering: {
          lineWidth: 1,
          lineColor: "#000000",
          textSize: 12,
          textColor: "#000000",
          arrowStyle: "filled"
        },
        architectural: {
          lineWidth: 0.75,
          lineColor: "#333333",
          textSize: 10,
          textColor: "#333333",
          arrowStyle: "filled"
        },
        manufacturing: {
          lineWidth: 1.25,
          lineColor: "#000000",
          textSize: 10,
          textColor: "#000000",
          arrowStyle: "filled"
        },
        minimal: {
          lineWidth: 0.5,
          lineColor: "#555555",
          textSize: 8,
          textColor: "#555555",
          arrowStyle: "dot"
        }
      };

      return styles[style as keyof typeof styles] || styles.engineering;
    }
  }

  // Function to handle generation of 2D technical drawings
  function handleGenerate2DTechnicalDrawings(
    payload: any
  ): Promise<{ success: boolean; message: string; drawings?: any[] }> {
    return new Promise(resolve => {
      try {
        const { standard = "ANSI", views = ["front", "top", "side"], paperSize = "A3" } = payload;

        console.log(`Generating 2D technical drawings with standard: ${standard}, views: ${views.join(", ")}`);

        // Get all canvas elements
        const canvasElements = getCanvasElements();

        if (canvasElements.length === 0) {
          return resolve({
            success: false,
            message: "No elements found to generate technical drawings from."
          });
        }

        // Calculate model bounds to determine drawing scale and layout
        const bounds = calculateModelBounds(canvasElements);

        // Generate views based on requested standard and layout
        const drawings: any[] = [];
        const viewSpacing = 20; // Space between views in drawing units
        let currentX = 0;

        // Process each requested view
        views.forEach((view: string, index: any) => {
          // Calculate position for this view
          const viewWidth = calculateViewWidth(view, bounds);
          const viewHeight = calculateViewHeight(view, bounds);

          // Create the view drawing element
          const viewElement = {
            id: uuidv4(),
            type: "drawing-screenshot-area", // Using this as a placeholder for a technical drawing view
            name: `${view} view`,
            x: currentX + viewWidth / 2,
            y: 0,
            z: 0,
            width: viewWidth,
            height: viewHeight,
            startPoint: { x: currentX, y: -viewHeight / 2, z: 0 },
            endPoint: { x: currentX + viewWidth, y: viewHeight / 2, z: 0 },
            viewType: view,
            standard: standard,
            elements: [], // Would contain the 2D projections of the 3D elements
            color: "#000000",
            linewidth: 1
          };

          // Add dimensions according to the standard
          addStandardDimensions(viewElement, standard, canvasElements, view);

          // Add to drawings array
          drawings.push(viewElement);

          // Update position for next view
          currentX += viewWidth + viewSpacing;
        });

        // Add title block according to the standard
        const titleBlock = generateTitleBlock(standard, paperSize, `CAD Project - ${new Date().toLocaleDateString()}`);
        drawings.push(titleBlock);

        // Add all drawing elements to the canvas
        if (drawings.length > 0) {
          addElementsToCanvas(drawings);
        }

        resolve({
          success: drawings.length > 0,
          message:
            drawings.length > 0
              ? `Generated ${drawings.length - 1} technical drawing views with ${standard} standard on ${paperSize} sheet.`
              : "Failed to generate technical drawings.",
          drawings: drawings
        });
      } catch (error) {
        console.error("Error in handleGenerate2DTechnicalDrawings:", error);
        resolve({
          success: false,
          message: error instanceof Error ? error.message : "Error generating technical drawings"
        });
      }
    });

    // Helper functions

    function calculateViewWidth(view: string, bounds: any) {
      // Calculate view dimensions based on model bounds and view type
      switch (view) {
        case "front":
        case "back":
          return bounds.maxX - bounds.minX + 40; // Add margin
        case "side":
        case "right":
        case "left":
          return bounds.maxZ - bounds.minZ + 40;
        case "top":
        case "bottom":
          return bounds.maxX - bounds.minX + 40;
        case "isometric":
          return Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) * 1.5 + 40;
        default:
          return 200; // Default size
      }
    }

    function calculateViewHeight(view: string, bounds: any) {
      // Calculate view dimensions based on model bounds and view type
      switch (view) {
        case "front":
        case "back":
          return bounds.maxY - bounds.minY + 40;
        case "side":
        case "right":
        case "left":
          return bounds.maxY - bounds.minY + 40;
        case "top":
        case "bottom":
          return bounds.maxZ - bounds.minZ + 40;
        case "isometric":
          return Math.max(bounds.maxY - bounds.minY, bounds.maxZ - bounds.minZ) * 1.5 + 40;
        default:
          return 150;
      }
    }

    function getStyleSettings(style: string) {
      const styles = {
        engineering: { lineWidth: 1, lineColor: "#000000", textSize: 12, textColor: "#000000", arrowStyle: "filled" },
        architectural: {
          lineWidth: 0.75,
          lineColor: "#333333",
          textSize: 10,
          textColor: "#333333",
          arrowStyle: "filled"
        },
        manufacturing: {
          lineWidth: 1.25,
          lineColor: "#000000",
          textSize: 10,
          textColor: "#000000",
          arrowStyle: "filled"
        },
        minimal: { lineWidth: 0.5, lineColor: "#555555", textSize: 8, textColor: "#555555", arrowStyle: "dot" }
      };
      return styles[style as keyof typeof styles] || styles.engineering;
    }

    // Make sure calculateModelBounds is robust (Keep updated version)
    function calculateModelBounds(elements: Element[]): {
      minX: number;
      minY: number;
      minZ: number;
      maxX: number;
      maxY: number;
      maxZ: number;
    } {
      let minX = Number.POSITIVE_INFINITY,
        minY = Number.POSITIVE_INFINITY,
        minZ = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY,
        maxY = Number.NEGATIVE_INFINITY,
        maxZ = Number.NEGATIVE_INFINITY;

      elements.forEach(el => {
        if (el.type.startsWith("drawing-") || el.type.endsWith("-dimension") || el.type === "group") return;

        let elMinX = el.x ?? 0,
          elMaxX = el.x ?? 0,
          elMinY = el.y ?? 0,
          elMaxY = el.y ?? 0,
          elMinZ = el.z ?? 0,
          elMaxZ = el.z ?? 0;
        const width = el.width ?? 0;
        const height = el.height ?? 0;
        const depth = el.depth ?? 0;
        const radius = el.radius ?? 0;

        if (el.type === "cube" || el.type === "rectangle" || el.type === "workpiece") {
          elMinX = el.x - width / 2;
          elMaxX = el.x + width / 2;
          elMinY = el.y - height / 2;
          elMaxY = el.y + height / 2;
          elMinZ = el.z - (depth || 0) / 2;
          elMaxZ = el.z + (depth || 0) / 2;
        } else if (el.type === "sphere" || el.type === "circle") {
          elMinX = el.x - radius;
          elMaxX = el.x + radius;
          elMinY = el.y - radius;
          elMaxY = el.y + radius;
          elMinZ = el.z - radius;
          elMaxZ = el.z + radius;
        } else if (el.type === "cylinder") {
          // Assume Z height
          elMinX = el.x - radius;
          elMaxX = el.x + radius;
          elMinY = el.y - radius;
          elMaxY = el.y + radius;
          elMinZ = el.z - height / 2;
          elMaxZ = el.z + height / 2;
        } else if (el.type === "cone") {
          // Assume Z height, base at z
          elMinX = el.x - radius;
          elMaxX = el.x + radius;
          elMinY = el.y - radius;
          elMaxY = el.y + radius;
          elMinZ = el.z;
          elMaxZ = el.z + height;
        } else if (el.type === "line") {
          elMinX = Math.min(el.x1 ?? 0, el.x2 ?? 0);
          elMaxX = Math.max(el.x1 ?? 0, el.x2 ?? 0);
          elMinY = Math.min(el.y1 ?? 0, el.y2 ?? 0);
          elMaxY = Math.max(el.y1 ?? 0, el.y2 ?? 0);
          elMinZ = Math.min(el.z1 ?? 0, el.z2 ?? 0);
          elMaxZ = Math.max(el.z1 ?? 0, el.z2 ?? 0);
        }
        // Add more types if needed

        minX = Math.min(minX, elMinX);
        maxX = Math.max(maxX, elMaxX);
        minY = Math.min(minY, elMinY);
        maxY = Math.max(maxY, elMaxY);
        minZ = Math.min(minZ, elMinZ);
        maxZ = Math.max(maxZ, elMaxZ);
      });

      if (!isFinite(minX)) return { minX: -50, minY: -50, minZ: -50, maxX: 50, maxY: 50, maxZ: 50 };

      return { minX, minY, minZ, maxX, maxY, maxZ };
    }

    // Keep generateTitleBlock (ensure it returns Partial<Element>)

    // --- Make sure handleAutoQuoteCADElements is defined correctly ---
    // (Keep the version updated in the previous step that uses the store)
    function handleAutoQuoteCADElements(
      payload: any
    ): Promise<{ success: boolean; message: string; dimensions?: any[] }> {
      return new Promise(resolve => {
        try {
          const {
            elementIds = [],
            style = "engineering",
            units = "mm",
            dimensionTypes = ["linear-dimension", "diameter-dimension"],
            layout = "aligned",
            placement = "auto"
          } = payload;
          console.log(`Auto-quoting elements IDs: ${elementIds.join(", ")} with style: ${style}, units: ${units}`);

          const allElements = useElementsStore.getState().elements;
          // Important: Target only the elements passed in the payload
          const targetElements = elementIds.length > 0 ? allElements.filter(el => elementIds.includes(el.id)) : []; // Only quote specified IDs

          if (targetElements.length === 0) {
            return resolve({ success: false, message: "No target elements found or specified to add dimensions to." });
          }

          const dimensions: any[] = [];
          targetElements.forEach(element => {
            // --- Add Dimension Logic (Copied & adapted from previous correct version) ---
            // Ensure this logic correctly generates dimensions based on the 2D face element types
            const elX = element.x ?? 0;
            const elY = element.y ?? 0;
            const elW = element.width ?? 0;
            const elH = element.height ?? 0;
            const elR = element.radius ?? 0;

            if (dimensionTypes.includes("linear-dimension")) {
              if (element.type === "rectangle") {
                // Width dim for rectangle face
                dimensions.push({
                  id: uuidv4(),
                  type: "linear-dimension",
                  startPoint: { x: elX - elW / 2, y: elY - elH / 2 - 10, z: 0 }, // Offset Y
                  endPoint: { x: elX + elW / 2, y: elY - elH / 2 - 10, z: 0 },
                  value: elW.toFixed(2),
                  unit: units,
                  linewidth: 1,
                  color: "#000000"
                });
                // Height dim for rectangle face
                dimensions.push({
                  id: uuidv4(),
                  type: "linear-dimension",
                  startPoint: { x: elX - elW / 2 - 10, y: elY - elH / 2, z: 0 }, // Offset X
                  endPoint: { x: elX - elW / 2 - 10, y: elY + elH / 2, z: 0 },
                  value: elH.toFixed(2),
                  unit: units,
                  linewidth: 1,
                  color: "#000000"
                });
              }
              if (element.type === "line") {
                const p1 = { x: element.x1 ?? 0, y: element.y1 ?? 0 };
                const p2 = { x: element.x2 ?? 0, y: element.y2 ?? 0 };
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const length = Math.sqrt(dx * dx + dy * dy);
                // Simple length dimension along the line
                dimensions.push({
                  id: uuidv4(),
                  type: "linear-dimension",
                  startPoint: { x: p1.x, y: p1.y, z: 0 },
                  endPoint: { x: p2.x, y: p2.y, z: 0 },
                  value: length.toFixed(2),
                  unit: units,
                  linewidth: 1,
                  color: "#000000"
                  // TODO: Add offset logic based on line angle
                });
              }
            }
            if (dimensionTypes.includes("diameter-dimension") && element.type === "circle") {
              dimensions.push({
                id: uuidv4(),
                type: "diameter-dimension",
                center: { x: elX, y: elY, z: 0 },
                pointOnCircle: { x: elX + elR, y: elY, z: 0 },
                value: (elR * 2).toFixed(2),
                unit: units,
                linewidth: 1,
                color: "#000000"
              });
            }
            if (dimensionTypes.includes("radius-dimension") && element.type === "circle") {
              dimensions.push({
                id: uuidv4(),
                type: "radius-dimension",
                center: { x: elX, y: elY, z: 0 },
                pointOnCircle: { x: elX + elR, y: elY, z: 0 },
                value: elR.toFixed(2),
                unit: units,
                linewidth: 1,
                color: "#000000"
              });
            }
            // Add more specific dimension logic for other 2D face types if needed
            // --- End Dimension Logic ---
          });

          const styleSettings = getStyleSettings(style);
          dimensions.forEach(dim => {
            dim.linewidth = styleSettings.lineWidth;
            dim.color = styleSettings.lineColor;
          });

          if (dimensions.length > 0) {
            useElementsStore.getState().addElements(dimensions);
          }

          resolve({
            success: dimensions.length > 0,
            message:
              dimensions.length > 0
                ? `Added ${dimensions.length} dimension(s) to the generated face views.`
                : "No dimensions could be generated for the face views.",
            dimensions: dimensions
          });
        } catch (error) {
          console.error("Error in handleAutoQuoteCADElements (called internally):", error);
          resolve({
            success: false,
            message: error instanceof Error ? error.message : "Internal error adding dimensions"
          });
        }
      });
    }

    function addStandardDimensions(viewElement: any, standard: string, elements: any[], view: string) {
      // Add dimensions according to the specified standard
      // This is a simplified implementation
      const dimensions = [];

      // Add overall dimensions
      dimensions.push({
        id: uuidv4(),
        type: "linear-dimension",
        parent: viewElement.id,
        startPoint: { x: viewElement.startPoint.x, y: viewElement.startPoint.y, z: 0 },
        endPoint: { x: viewElement.endPoint.x, y: viewElement.startPoint.y, z: 0 },
        offsetDirection: "y",
        offsetAmount: -10,
        linewidth: standard === "ISO" ? 0.7 : 1,
        color: "#000000"
      });

      dimensions.push({
        id: uuidv4(),
        type: "linear-dimension",
        parent: viewElement.id,
        startPoint: { x: viewElement.startPoint.x, y: viewElement.startPoint.y, z: 0 },
        endPoint: { x: viewElement.startPoint.x, y: viewElement.endPoint.y, z: 0 },
        offsetDirection: "x",
        offsetAmount: -10,
        linewidth: standard === "ISO" ? 0.7 : 1,
        color: "#000000"
      });

      // Add the dimensions to the view's elements
      viewElement.elements.push(...dimensions);
    }

    function generateTitleBlock(standard: string, paperSize: string, title: string) {
      // Create a title block according to the specified standard
      const paperSizes: Record<string, { width: number; height: number }> = {
        "A0": { width: 841, height: 1189 },
        "A1": { width: 594, height: 841 },
        "A2": { width: 420, height: 594 },
        "A3": { width: 297, height: 420 },
        "A4": { width: 210, height: 297 },
        "ANSI_A": { width: 216, height: 279 },
        "ANSI_B": { width: 279, height: 432 },
        "ANSI_C": { width: 432, height: 559 },
        "ANSI_D": { width: 559, height: 864 },
        "ANSI_E": { width: 864, height: 1118 }
      };

      const size = paperSizes[paperSize] || paperSizes.A3;

      // Create title block element
      return {
        id: uuidv4(),
        type: "drawing-text",
        name: "Title Block",
        x: size.width - 60,
        y: 20,
        z: 0,
        position: { x: size.width - 60, y: 20, z: 0 },
        text: title,
        textSize: 12,
        font: standard === "ISO" ? "Arial" : "Helvetica",
        color: "#000000"
      };
    }
  }

  // Function to handle physical property simulation
  function handleSimulatePhysicalProperties(
    payload: any
  ): Promise<{ success: boolean; message: string; properties?: any }> {
    return new Promise(resolve => {
      try {
        const { material = "aluminum", properties = ["weight", "center_of_gravity"] } = payload;

        console.log(`Simulating physical properties for material: ${material}, properties: ${properties.join(", ")}`);

        // Get all canvas elements
        const canvasElements = getCanvasElements();

        if (canvasElements.length === 0) {
          return resolve({
            success: false,
            message: "No elements found to simulate physical properties for."
          });
        }

        // Material density lookup (simplified, in kg/m³)
        const densities: Record<string, number> = {
          "aluminum": 2700,
          "steel": 7850,
          "plastic": 1200,
          "wood": 700,
          "glass": 2500,
          "pla": 1250,
          "abs": 1070,
          "copper": 8960,
          "titanium": 4500
        };

        const density = densities[material.toLowerCase()] || 2700; // Default to aluminum if not found

        // Calculate requested properties
        const result: any = {
          material,
          density: density,
          unit: "kg/m³"
        };

        let totalVolume = 0;
        let totalWeight = 0;
        let weightedX = 0;
        let weightedY = 0;
        let weightedZ = 0;

        // Calculate volume and weighted position for each element
        canvasElements.forEach(el => {
          // Calculate volume based on element type
          let volume = 0;

          switch (el.type) {
            case "cube":
              volume = (el.width || 0) * (el.height || 0) * (el.depth || 0);
              break;
            case "sphere":
              volume = (4 / 3) * Math.PI * Math.pow(el.radius || 0, 3);
              break;
            case "cylinder":
              volume = Math.PI * Math.pow(el.radius || 0, 2) * (el.height || 0);
              break;
            case "cone":
              volume = (1 / 3) * Math.PI * Math.pow(el.radius || 0, 2) * (el.height || 0);
              break;
            case "torus":
              volume = 2 * Math.pow(Math.PI, 2) * (el.radius || 0) * Math.pow(el.tubeRadius || (el.radius || 0) / 4, 2);
              break;
            // Add more element types as needed
            default:
              // For other types, use a simple bounding box approximation
              volume = (el.width || 0) * (el.height || 0) * (el.depth || 0);
          }

          // Convert from mm³ to m³ if dimensions are in mm
          const volumeInCubicMeters = volume / 1000000000;
          const elementWeight = volumeInCubicMeters * density;

          // Add to totals
          totalVolume += volumeInCubicMeters;
          totalWeight += elementWeight;

          // For center of gravity calculation
          weightedX += el.x * elementWeight;
          weightedY += el.y * elementWeight;
          weightedZ += el.z * elementWeight;
        });

        // Add requested properties to result
        if (properties.includes("weight")) {
          result.weight = {
            value: totalWeight,
            unit: "kg"
          };
        }

        if (properties.includes("center_of_gravity") && totalWeight > 0) {
          result.center_of_gravity = {
            x: weightedX / totalWeight,
            y: weightedY / totalWeight,
            z: weightedZ / totalWeight,
            unit: "mm" // Assuming coordinates are in mm
          };
        }

        if (properties.includes("moment_of_inertia")) {
          // Simplified calculation - would be more complex for real applications
          result.moment_of_inertia = {
            xx: calculateSimplifiedInertia(canvasElements, totalWeight, "x"),
            yy: calculateSimplifiedInertia(canvasElements, totalWeight, "y"),
            zz: calculateSimplifiedInertia(canvasElements, totalWeight, "z"),
            unit: "kg·m²"
          };
        }

        if (properties.includes("stress")) {
          result.stress = {
            message:
              "Basic stress analysis would require finite element analysis (FEA) which is not implemented in this simplified simulation."
          };
        }

        if (properties.includes("thermal")) {
          // Thermal conductivity values (W/(m·K))
          const thermalConductivity: Record<string, number> = {
            "aluminum": 237,
            "steel": 45,
            "plastic": 0.2,
            "wood": 0.15,
            "glass": 1.0,
            "pla": 0.13,
            "abs": 0.17,
            "copper": 400,
            "titanium": 22
          };

          result.thermal = {
            conductivity: thermalConductivity[material.toLowerCase()] || 237,
            unit: "W/(m·K)",
            message: "Detailed thermal analysis would require more sophisticated simulation."
          };
        }

        resolve({
          success: true,
          message: `Simulated physical properties for ${material}: ${Object.keys(result)
            .filter(k => k !== "material" && k !== "density" && k !== "unit")
            .join(", ")}.`,
          properties: result
        });
      } catch (error) {
        console.error("Error in handleSimulatePhysicalProperties:", error);
        resolve({
          success: false,
          message: error instanceof Error ? error.message : "Error simulating physical properties"
        });
      }
    });

    // Helper function for simplified moment of inertia calculation
    function calculateSimplifiedInertia(elements: any[], totalWeight: number, axis: string) {
      let inertia = 0;

      // For a very simplified calculation
      elements.forEach(el => {
        const dim1 = axis === "x" ? el.height || el.radius || 0 : el.width || el.radius || 0;
        const dim2 = axis === "z" ? el.height || el.radius || 0 : el.depth || el.radius || 0;

        // Simplified formula for a cuboid
        const elementVolume = ((el.width || 0) * (el.height || 0) * (el.depth || 0)) / 1000000000; // Convert to m³
        const elementWeight = elementVolume * (payload.material || 2700);
        const elementInertia = ((elementWeight / 12) * (dim1 * dim1 + dim2 * dim2)) / 1000000; // Convert to m²

        inertia += elementInertia;
      });

      return inertia;
    }
  }

  // Handler implementations
  function handleGenerateCADElement(payload: any): Promise<{ success: boolean; message: string }> {
    return new Promise(resolve => {
      try {
        if (!payload.elements || !Array.isArray(payload.elements)) {
          throw new Error('Invalid elements payload: "elements" array is required.');
        }

        let addedCount = 0;
        let skippedCount = 0;
        const errorMessages: string[] = [];

        const processedElements = payload.elements
          .map((el: any, index: number): Element | null => {
            // Basic validation/defaults
            if (!el || typeof el !== "object" || !el.type) {
              console.warn(`Skipping element at index ${index}: Invalid or missing element data.`);
              skippedCount++;
              errorMessages.push(`Element at index ${index} skipped: Invalid or missing data.`);
              return null;
            }

            const baseElement: Omit<Element, "type" | "id"> & { id?: string } = {
              // Let the AI assign the ID if provided, otherwise generate one
              id: el.id || uuidv4(),
              type: el.type, // Type is already validated above
              x: el.x ?? 0,
              y: el.y ?? 0,
              z: el.z ?? 0,
              name: el.name,
              material: el.material,
              color: el.color ?? "#1e88e5",
              rotation: el.rotation
                ? {
                    x: el.rotation.x ?? 0,
                    y: el.rotation.y ?? 0,
                    z: el.rotation.z ?? 0
                  }
                : { x: 0, y: 0, z: 0 },
              scale: el.scale
                ? {
                    x: el.scale.x ?? 1,
                    y: el.scale.y ?? 1,
                    z: el.scale.z ?? 1
                  }
                : { x: 1, y: 1, z: 1 },
              additionalProps: el.additionalProps ?? {},
              thickness: el.thickness // Only include if provided, don't default object
                ? {
                    x: el.thickness.x ?? 0,
                    y: el.thickness.y ?? 0,
                    z: el.thickness.z ?? 0
                  }
                : undefined,
              wireframe: el.wireframe ?? false,
              visible: el.visible ?? true,
              layer: el.layer ?? "default",
              // Include any other common properties passed by the AI
              ...Object.fromEntries(
                Object.entries(el).filter(
                  ([key]) =>
                    ![
                      "id",
                      "type",
                      "x",
                      "y",
                      "z",
                      "name",
                      "material",
                      "color",
                      "rotation",
                      "scale",
                      "additionalProps",
                      "thickness",
                      "wireframe",
                      "visible",
                      "layer",
                      "width",
                      "height",
                      "depth",
                      "radius" // Handle dimensions separately below
                    ].includes(key)
                )
              )
            };

            // Add dimension/radius properties based on type and payload
            // Default values should match CADCanvas defaults where possible for consistency
            let specificProps: Partial<Element> = {};
            switch (el.type) {
              case "cube":
              case "rectangle": // Includes 2D rectangle
              case "workpiece":
              case "wall": // Has length, height, thickness, but thickness is already handled
              case "floor": // Has width, length, thickness
              case "window": // Has width, height, thickness
              case "door": // Has width, height, thickness
                specificProps = {
                  width: el.width ?? (el.type === "wall" || el.type === "floor" ? 100 : 50),
                  height:
                    el.height ?? (el.type === "wall" ? 30 : el.type === "window" ? 15 : el.type === "door" ? 20 : 50),
                  depth: el.depth ?? (el.type === "workpiece" ? 50 : undefined) // Depth may not apply to all (e.g., 2D rect)
                };
                if (el.type === "wall" || el.type === "floor" || el.type === "window" || el.type === "door") {
                  // Overwrite thickness if provided specifically for these types
                  specificProps.thickness =
                    el.thickness?.x ??
                    (el.type === "wall"
                      ? 5
                      : el.type === "floor"
                        ? 2
                        : el.type === "window"
                          ? 0.5
                          : el.type === "door"
                            ? 1
                            : undefined);
                }
                break;
              case "sphere":
              case "hemisphere":
              case "ellipsoid": // Uses radiusX, radiusY, radiusZ instead
              case "capsule": // Uses radius, height
              case "circle": // Includes 2D circle
              case "torus": // Needs tubeRadius in additionalProps maybe? Handled by generic spread
              case "cylinder": // Needs height as well
              case "cone": // Needs height as well
              case "prism": // Needs height and sides
              case "gear": // Needs moduleValue, teeth, thickness
              case "spring": // Needs wireRadius, turns, height
              case "column": // Needs height
                specificProps = {
                  radius: el.radius ?? (el.type === "spring" ? 1 : el.type === "column" ? 5 : 25),
                  height:
                    el.height ??
                    (["cylinder", "cone", "prism"].includes(el.type)
                      ? 50
                      : el.type === "capsule"
                        ? 2
                        : el.type === "spring"
                          ? 5
                          : el.type === "column"
                            ? 30
                            : undefined),
                  ...(el.type === "ellipsoid" && {
                    radiusX: el.radiusX ?? 1,
                    radiusY: el.radiusY ?? 0.75,
                    radiusZ: el.radiusZ ?? 0.5
                  }),
                  ...(el.type === "capsule" && {
                    capSegments: el.capSegments ?? 8,
                    radialSegments: el.radialSegments ?? 16
                  }),
                  ...(el.type === "prism" && { sides: el.sides ?? 6 }),
                  ...(el.type === "gear" && {
                    moduleValue: el.moduleValue ?? 1,
                    teeth: el.teeth ?? 20,
                    thickness: el.thickness?.x ?? 5
                  }), // Assume thickness.x is gear thickness
                  ...(el.type === "spring" && { wireRadius: el.wireRadius ?? 0.1, turns: el.turns ?? 5 })
                };
                // Torus tubeRadius might come via additionalProps or specific payload prop
                if (el.type === "torus") specificProps.tubeRadius = el.tubeRadius ?? (el.radius ?? 25) / 4;
                break;
              case "pyramid":
                specificProps = { baseWidth: el.baseWidth ?? 1, baseDepth: el.baseDepth ?? 1, height: el.height ?? 1 };
                break;
              case "line":
                specificProps = {
                  x1: el.x1,
                  y1: el.y1,
                  z1: el.z1,
                  x2: el.x2,
                  y2: el.y2,
                  z2: el.z2,
                  linewidth: el.linewidth ?? 1
                };
                if (
                  specificProps.x1 === undefined ||
                  specificProps.y1 === undefined ||
                  specificProps.x2 === undefined ||
                  specificProps.y2 === undefined
                ) {
                  console.warn(
                    `Skipping element at index ${index} ('line'): Missing start/end points (x1, y1, x2, y2).`
                  );
                  skippedCount++;
                  errorMessages.push(`Element 'line' at index ${index} skipped: Missing start/end points.`);
                  return null;
                }
                break;
              case "triangle":
              case "polygon":
              case "spline":
              case "bezier":
              case "nurbs":
              case "revolution": // Needs profile points
              case "sweep": // Needs profile and path points
              case "loft": // Needs array of profiles and positions
              case "path3d":
              case "point-cloud":
              case "mesh": // Needs vertices and faces
              case "drawing-pen":
              case "drawing-highlighter":
              case "drawing-eraser":
                specificProps = {
                  points: el.points,
                  vertices: el.vertices,
                  faces: el.faces,
                  profile: el.profile,
                  path: el.path,
                  profiles: el.profiles,
                  positions: el.positions
                };
                // Basic validation for point-based elements
                if (
                  [
                    "spline",
                    "bezier",
                    "nurbs",
                    "revolution",
                    "sweep",
                    "loft",
                    "path3d",
                    "drawing-pen",
                    "drawing-highlighter",
                    "drawing-eraser"
                  ].includes(el.type)
                ) {
                  if (
                    !specificProps.points &&
                    !specificProps.profile &&
                    !specificProps.path &&
                    !(specificProps.profiles && specificProps.positions)
                  ) {
                    console.warn(
                      `Skipping element at index ${index} ('${el.type}'): Missing required points/profile/path data.`
                    );
                    skippedCount++;
                    errorMessages.push(
                      `Element '${el.type}' at index ${index} skipped: Missing points/profile/path data.`
                    );
                    return null;
                  }
                }
                if (el.type === "mesh" && (!specificProps.vertices || !specificProps.faces)) {
                  console.warn(`Skipping element at index ${index} ('mesh'): Missing vertices or faces.`);
                  skippedCount++;
                  errorMessages.push(`Element 'mesh' at index ${index} skipped: Missing vertices or faces.`);
                  return null;
                }
                // Pass through other relevant props
                specificProps.divisions = el.divisions;
                specificProps.linewidth = el.linewidth;
                specificProps.penSize = el.penSize;
                specificProps.highlighterSize = el.highlighterSize;
                specificProps.opacity = el.opacity;
                specificProps.showEraserPath = el.showEraserPath;
                specificProps.pointSize = el.pointSize;
                specificProps.colors = el.colors; // For point cloud
                specificProps.closed = el.closed; // For sweep, path3d
                specificProps.segments = el.segments;
                specificProps.radialSegments = el.radialSegments;
                break;
              case "extrusion":
                specificProps = {
                  shape: el.shape, // 'rect', 'circle', or uses profile
                  profile: el.profile, // Alternative to shape
                  width: el.width ?? (el.shape === "rect" ? 50 : undefined),
                  height: el.height ?? (el.shape === "rect" ? 30 : undefined),
                  radius: el.radius ?? (el.shape === "circle" ? 25 : undefined),
                  depth: el.depth ?? 10,
                  bevel: el.bevel ?? false,
                  bevelThickness: el.bevelThickness ?? 1,
                  bevelSize: el.bevelSize ?? 1,
                  bevelSegments: el.bevelSegments ?? 1
                };
                if (!specificProps.shape && !specificProps.profile) {
                  console.warn(`Skipping element at index ${index} ('extrusion'): Missing shape or profile.`);
                  skippedCount++;
                  errorMessages.push(`Element 'extrusion' at index ${index} skipped: Missing shape or profile.`);
                  return null;
                }
                break;
              case "boolean-union":
              case "boolean-subtract":
              case "boolean-intersect":
                specificProps = { operands: el.operands };
                if (
                  !specificProps.operands ||
                  !Array.isArray(specificProps.operands) ||
                  specificProps.operands.length < 2
                ) {
                  console.warn(`Skipping element at index ${index} ('${el.type}'): Requires at least two operand IDs.`);
                  skippedCount++;
                  errorMessages.push(
                    `Element '${el.type}' at index ${index} skipped: Requires at least two operand IDs.`
                  );
                  return null;
                }
                break;
              case "thread":
                specificProps = {
                  diameter: el.diameter ?? 5,
                  length: el.length ?? 10,
                  pitch: el.pitch ?? 1,
                  handedness: el.handedness ?? "right"
                };
                break;
              case "chamfer":
              case "fillet":
                specificProps = {
                  targetId: el.targetId, // ID of the element to modify
                  edges: el.edges, // Indices or identifiers of edges
                  distance: el.distance, // For chamfer
                  radius: el.radius, // For fillet
                  width: el.width, // For placeholder viz
                  height: el.height, // For placeholder viz
                  depth: el.depth // For placeholder viz
                };
                // Note: Actual chamfer/fillet needs more complex handling, maybe separate actions
                // This handles the placeholder generation if the AI sends these types
                break;
              case "screw":
              case "bolt":
              case "nut":
              case "washer":
              case "rivet":
                specificProps = {
                  size: el.size, // e.g., "M5"
                  length: el.length, // For screw/bolt/rivet
                  diameter: el.diameter, // For rivet/thread fallback
                  thickness: el.thickness?.x // For nut/washer - use thickness prop
                };
                // Need size or diameter/length for most
                if (!specificProps.size && !specificProps.diameter && !specificProps.length) {
                  console.warn(`Skipping element at index ${index} ('${el.type}'): Missing size or dimensions.`);
                  skippedCount++;
                  errorMessages.push(`Element '${el.type}' at index ${index} skipped: Missing size or dimensions.`);
                  return null;
                }
                break;
              case "stair":
                specificProps = {
                  width: el.width ?? 10,
                  height: el.height ?? 20,
                  depth: el.depth ?? 30,
                  steps: el.steps ?? 10
                };
                break;
              case "roof":
                specificProps = {
                  width: el.width ?? 100,
                  length: el.length ?? 100,
                  height: el.height ?? 20, // Pitch height for pitched roof
                  style: el.style ?? "pitched", // 'pitched', 'flat'
                  thickness: el.thickness?.x // For flat roof - use thickness prop
                };
                break;
              case "text3d":
                specificProps = {
                  text: el.text,
                  height: el.height ?? 5, // Font size essentially
                  depth: el.depth ?? 2, // Extrusion depth
                  font: el.font // Font name (requires font loading)
                };
                if (!specificProps.text) {
                  console.warn(`Skipping element at index ${index} ('text3d'): Missing text content.`);
                  skippedCount++;
                  errorMessages.push(`Element 'text3d' at index ${index} skipped: Missing text content.`);
                  return null;
                }
                break;
              case "group":
              case "component": // Components can also have child elements
                specificProps = {
                  elements: el.elements ?? [], // Array of child element definitions
                  // For component placeholder viz:
                  width: el.width,
                  height: el.height,
                  depth: el.depth
                };
                // Recursively process child elements? Might be complex.
                // Assume child elements in payload are already valid definitions.
                break;
              case "linear-dimension":
              case "radius-dimension":
              case "diameter-dimension":
              case "angular-dimension":
                specificProps = {
                  startPoint: el.startPoint, // {x, y, z}
                  endPoint: el.endPoint, // {x, y, z}
                  center: el.center, // {x, y, z}
                  pointOnCircle: el.pointOnCircle, // {x, y, z}
                  vertex: el.vertex, // {x, y, z} - for angular
                  offsetDirection: el.offsetDirection, // 'x', 'y', 'z' - for linear
                  offsetAmount: el.offsetAmount,
                  radius: el.radius, // For angular arc representation
                  value: el.value, // Override calculated value
                  unit: el.unit,
                  linewidth: el.linewidth ?? 1
                };
                // Add validation for required points per dimension type
                if (el.type === "linear-dimension" && (!specificProps.startPoint || !specificProps.endPoint)) {
                  /* skip */
                }
                if (el.type === "radius-dimension" && (!specificProps.center || !specificProps.pointOnCircle)) {
                  /* skip */
                }
                if (el.type === "diameter-dimension" && (!specificProps.center || !specificProps.pointOnCircle)) {
                  /* skip */
                }
                if (
                  el.type === "angular-dimension" &&
                  (!specificProps.vertex || !specificProps.startPoint || !specificProps.endPoint)
                ) {
                  /* skip */
                }
                // Simplified skip logic - replace with proper error handling
                if (false) {
                  // Placeholder for actual skip logic
                  console.warn(`Skipping element at index ${index} ('${el.type}'): Missing required points.`);
                  skippedCount++;
                  errorMessages.push(`Element '${el.type}' at index ${index} skipped: Missing required points.`);
                  return null;
                }
                break;
              case "drawing-text":
                specificProps = {
                  position: el.position, // {x, y, z}
                  text: el.text,
                  textSize: el.textSize ?? 12,
                  font: el.font ?? "Arial"
                };
                if (!specificProps.position || !specificProps.text) {
                  console.warn(`Skipping element at index ${index} ('drawing-text'): Missing position or text.`);
                  skippedCount++;
                  errorMessages.push(`Element 'drawing-text' at index ${index} skipped: Missing position or text.`);
                  return null;
                }
                break;
              case "drawing-screenshot-area":
                specificProps = {
                  startPoint: el.startPoint, // {x, y, z}
                  endPoint: el.endPoint // {x, y, z}
                };
                if (!specificProps.startPoint || !specificProps.endPoint) {
                  console.warn(
                    `Skipping element at index ${index} ('drawing-screenshot-area'): Missing start or end point.`
                  );
                  skippedCount++;
                  errorMessages.push(
                    `Element 'drawing-screenshot-area' at index ${index} skipped: Missing start or end point.`
                  );
                  return null;
                }
                break;
              // Default case handles types not explicitly listed or those only needing base props + dimensions
              default:
                // Pass through common dimension properties if provided
                specificProps = {
                  ...(el.width && { width: el.width }),
                  ...(el.height && { height: el.height }),
                  ...(el.depth && { depth: el.depth }),
                  ...(el.radius && { radius: el.radius })
                };
                // Log if a type wasn't explicitly handled but maybe should have been?
                // console.log(`Element type "${el.type}" using default property handling.`);
                break;
            }

            // Combine base, specific, and ensure ID and Type are correct
            const finalElement = {
              ...baseElement,
              ...specificProps,
              id: baseElement.id || uuidv4(), // Ensure ID exists
              type: el.type // Ensure type is set from original payload
            } as Element; // Cast might be needed depending on full Element type def

            addedCount++;
            return finalElement;
          })
          .filter((el: Element | null): el is Element => el !== null); // Filter out skipped elements

        if (processedElements.length > 0) {
          addElementsToCanvas(processedElements as Element[]); // Add valid elements
        }

        // Construct final message
        let message = "";
        if (addedCount > 0) {
          message += `Added ${addedCount} element(s) to the canvas.`;
        }
        if (skippedCount > 0) {
          message += ` Skipped ${skippedCount} element(s) due to errors: ${errorMessages.join("; ")}`;
        }
        if (addedCount === 0 && skippedCount === 0) {
          message = "No elements provided in the payload.";
        } else if (addedCount === 0 && skippedCount > 0) {
          message = `Failed to add any elements. Skipped ${skippedCount} element(s) due to errors: ${errorMessages.join("; ")}`;
          resolve({ success: false, message }); // Overall failure if nothing was added
          return;
        }

        resolve({
          success: addedCount > 0, // Success if at least one element was added
          message: message.trim()
        });
      } catch (error) {
        console.error("Error in handleGenerateCADElement:", error);
        resolve({
          success: false,
          message: error instanceof Error ? error.message : "Error adding elements"
        });
      }
    });
  }

  function handleUpdateCADElement(payload: any): Promise<{ success: boolean; message: string }> {
    return new Promise(resolve => {
      try {
        if (!payload.id || !payload.properties) {
          throw new Error("Invalid update payload: id and properties are required");
        }

        const elements = getCanvasElements();
        const elementExists = elements.some(el => el.id === payload.id);

        if (!elementExists) {
          throw new Error(`Element with id ${payload.id} not found`);
        }

        // Ensure properties are applied correctly (handle nested objects like rotation/scale)
        const propertiesToUpdate: Partial<Element> = { ...payload.properties };
        if (propertiesToUpdate.rotation) {
          propertiesToUpdate.rotation = { x: 0, y: 0, z: 0, ...propertiesToUpdate.rotation };
        }
        if (propertiesToUpdate.scale) {
          propertiesToUpdate.scale = { x: 1, y: 1, z: 1, ...propertiesToUpdate.scale };
        }
        if (propertiesToUpdate.thickness) {
          propertiesToUpdate.thickness = { x: 0, y: 0, z: 0, ...propertiesToUpdate.thickness };
        }

        updateElementInCanvas(payload.id, propertiesToUpdate);

        resolve({
          success: true,
          message: `Updated element ${payload.id}`
        });
      } catch (error) {
        console.error("Error in handleUpdateCADElement:", error);
        resolve({
          success: false,
          message: error instanceof Error ? error.message : "Error updating element"
        });
      }
    });
  }

  function handleRemoveCADElement(payload: any): Promise<{ success: boolean; message: string }> {
    return new Promise(resolve => {
      try {
        if (!payload.id) {
          throw new Error("Invalid remove payload: id is required");
        }

        const elements = getCanvasElements();
        const elementExists = elements.some(el => el.id === payload.id);

        if (!elementExists) {
          throw new Error(`Element with id ${payload.id} not found`);
        }

        removeElementFromCanvas(payload.id);

        resolve({
          success: true,
          message: `Removed element ${payload.id}`
        });
      } catch (error) {
        console.error("Error in handleRemoveCADElement:", error);
        resolve({
          success: false,
          message: error instanceof Error ? error.message : "Error removing element"
        });
      }
    });
  }

  function handleGroupCADElements(payload: any): Promise<{ success: boolean; message: string }> {
    return new Promise(resolve => {
      try {
        if (!payload.elementIds || !Array.isArray(payload.elementIds) || payload.elementIds.length === 0) {
          throw new Error("Invalid group payload: elementIds array is required");
        }

        console.log("Grouping elements (placeholder):", payload.elementIds, payload.groupName);
        // TODO: Implement actual grouping logic (e.g., update element store or canvas state)

        resolve({
          success: true,
          message: `Grouped ${payload.elementIds.length} elements${payload.groupName ? ` as \"${payload.groupName}\"` : ""} (Placeholder Implementation)`
        });
      } catch (error) {
        console.error("Error in handleGroupCADElements:", error);
        resolve({
          success: false,
          message: error instanceof Error ? error.message : "Error grouping elements"
        });
      }
    });
  }

  // --- NEW HANDLER IMPLEMENTATIONS (Placeholders) ---

  async function handleExportCADProjectAsZip(payload: any): Promise<{ success: boolean; message: string }> {
    console.log("Exporting project as ZIP:", payload);
    const { includePreviews, fileName: requestedFileName } = payload;
    const fileName = requestedFileName || `cad-project-export-${Date.now()}.zip`;

    if (includePreviews) {
      console.warn("Preview generation during export is not yet implemented and will be skipped.");
      // Optionally, return a specific message indicating previews were skipped
    }

    try {
      const elements = getCanvasElements();
      const metadata = {
        exportedAt: new Date().toISOString(),
        elementCount: elements.length
        // Add any other relevant project metadata here
      };

      const zip = new JSZip();

      // Add elements data
      zip.file("elements.json", JSON.stringify(elements, null, 2));

      // Add metadata
      zip.file("metadata.json", JSON.stringify(metadata, null, 2));

      // Generate the ZIP file content
      const content = await zip.generateAsync({ type: "blob" });

      // Trigger the download
      saveAs(content, fileName);

      return {
        success: true,
        message: `Project exported successfully as ${fileName}.`
      };
    } catch (error) {
      console.error("Error during project export:", error);
      return {
        success: false,
        message: `Project export failed: ${error instanceof Error ? error.message : "Unknown error"}`
      };
    }
  }

  function handleThinkAloudMode(payload: any): Promise<{ success: boolean; message: string; enabled: boolean }> {
    return new Promise(resolve => {
      const enabled = payload.enable ?? true;
      console.log(`Action indicates Think Aloud Mode should be set to ${enabled}`);
      resolve({
        success: true,
        message: `Think Aloud Mode ${enabled ? "enabled" : "disabled"}.`,
        enabled: enabled
      });
    });
  }

  async function handleChainOfThoughtAnalysis(payload: any): Promise<{ success: boolean; message: string }> {
    // Use async here as we are calling the AI service
    console.log("Performing Chain of Thought Analysis:", payload);
    const { goal, context } = payload;

    if (!goal) {
      return { success: false, message: "Analysis failed: Goal is required." };
    }

    try {
      // Construct a focused prompt for the analysis
      let analysisPrompt = `Perform a detailed chain-of-thought analysis for the following goal: "${goal}". Break down the problem, consider constraints, and outline the steps needed to achieve the goal.`;
      if (context && Object.keys(context).length > 0) {
        analysisPrompt += `\n\nConsider the following context:\n${JSON.stringify(context, null, 2)}`;
      }
      analysisPrompt += `\n\nProvide only the step-by-step analysis as your response.`;

      // Prepare minimal messages for this specific task
      const analysisMessages: AIMessage[] = [
        { id: uuidv4(), role: "user", content: analysisPrompt, timestamp: Date.now() }
      ];

      // Call the OpenAI service for the analysis
      // Use appropriate settings for analysis, not necessarily the user's current settings
      const analysisResponse = await openAIService.sendMessage(
        analysisMessages,
        "You are an analytical assistant performing chain-of-thought reasoning.", // Specific system context for this internal call
        [], // No actions available for this internal call
        "detailed", // Ensure detailed output
        "moderate", // Moderate complexity is usually fine for analysis
        "Helpful Assistant" // Role focused on explanation
        // No forceToolChoice needed
      );

      if (analysisResponse.content) {
        // Return the AI's analysis as the message
        return {
          success: true,
          message: `Chain of Thought Analysis Result:\n---\n${analysisResponse.content}`
        };
      } else {
        throw new Error("AI returned no content for the analysis.");
      }
    } catch (error) {
      console.error("Error during Chain of Thought Analysis:", error);
      return {
        success: false,
        message: `Chain of Thought Analysis failed: ${error instanceof Error ? error.message : "Unknown error"}`
      };
    }
  }

  async function handleSuggestOptimizations(payload: any): Promise<{ success: boolean; message: string }> {
    console.log("Suggesting Optimizations:", payload);
    const { target, selectedIds } = payload;

    try {
      let relevantElements = getCanvasElements();
      let contextDescription = "the entire current scene";

      // Filter elements if specific IDs are targeted
      if (selectedIds && Array.isArray(selectedIds) && selectedIds.length > 0) {
        relevantElements = relevantElements.filter(el => selectedIds.includes(el.id));
        if (relevantElements.length === 0 && selectedIds.length > 0) {
          return {
            success: false,
            message: `Optimization suggestion failed: No elements found with the specified IDs: ${selectedIds.join(", ")}.`
          };
        }
        contextDescription = `the following selected element(s):\n${JSON.stringify(
          relevantElements.map(el => ({ id: el.id, type: el.type, name: el.name })),
          null,
          2
        )}`;
      } else if (relevantElements.length === 0) {
        return { success: false, message: "Optimization suggestion failed: The canvas is empty." };
      }

      // Construct a focused prompt for optimization suggestions
      let optimizationPrompt = `Please suggest potential optimizations for ${contextDescription}.`;
      if (target) {
        optimizationPrompt += `\nFocus specifically on optimizations related to: ${target}.`;
      }
      optimizationPrompt += `\n
Consider aspects like performance, manufacturability, cost-effectiveness, or design principles based on the target. Provide actionable suggestions.`;

      // Include summary of relevant elements in the prompt if helpful (avoid overly large prompts)
      const elementSummary = relevantElements.slice(0, 10).map(el => ({
        // Limit summary size
        id: el.id,
        type: el.type,
        name: el.name,
        // Add a few key properties if relevant to optimization target
        ...(target === "geometry" && {
          position: { x: el.x, y: el.y, z: el.z },
          dimensions: { w: el.width, h: el.height, d: el.depth, r: el.radius }
        }),
        ...(target === "materials" && { material: el.material, color: el.color })
      }));

      if (relevantElements.length > 0) {
        optimizationPrompt += `\n\nRelevant Element Summary:\n${JSON.stringify(elementSummary, null, 2)}`;
        if (relevantElements.length > 10) {
          optimizationPrompt += `\n...(summary truncated for brevity, ${relevantElements.length} elements total in scope)`;
        }
      }

      optimizationPrompt += `\n\nProvide only the optimization suggestions as your response.`;

      // Prepare messages for this specific task
      const optimizationMessages: AIMessage[] = [
        { id: uuidv4(), role: "user", content: optimizationPrompt, timestamp: Date.now() }
      ];

      // Call the OpenAI service for the suggestions
      const optimizationResponse = await openAIService.sendMessage(
        optimizationMessages,
        "You are a CAD/CAM optimization expert providing actionable suggestions.", // System context
        [], // No actions
        "detailed",
        "moderate",
        "CAD Expert" // Role
      );

      if (optimizationResponse.content) {
        return {
          success: true,
          message: `Optimization Suggestions:\n---\n${optimizationResponse.content}`
        };
      } else {
        throw new Error("AI returned no content for optimization suggestions.");
      }
    } catch (error) {
      console.error("Error during Suggest Optimizations:", error);
      return {
        success: false,
        message: `Suggest Optimizations failed: ${error instanceof Error ? error.message : "Unknown error"}`
      };
    }
  }
  // --- END NEW HANDLER IMPLEMENTATIONS ---
}
