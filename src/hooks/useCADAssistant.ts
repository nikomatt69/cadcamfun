import { useState, useCallback } from "react";
import { useAIAssistantStoreOpenai } from "@/src/store/aiAssistantStoreOpenai";
import { openAIService } from "@/src/lib/ai/openaiService";
import {
  AIAction,
  AIMessage,
  ResponseStyle,
  ComplexityLevel,
  AssistantRole,
  MessageContent,
  TextContentBlock,
  ImageContentBlock
} from "@/src/types/AITypes";
import { useAI } from "@/src/components/ai/ai-new/AIContextProvider";
import { MCPClient } from "@/src/lib/ai/mcpClient";

export interface UseCADAssistantProps {
  contextData: any;
  actionHandler: {
    executeAction: (action: AIAction) => Promise<{ success: boolean; message: string }>;
    getActionDefinitions: () => any[];
    setThinkAloud?: (enabled: boolean) => void;
  };
}
interface ForceToolChoice {
  type: "function";
  function: { name: string };
}

// --- LISTA DETTAGLIATA TIPI ELEMENTI ---
const ELEMENT_TYPE_DETAILS = `You are a specialized CAD modeling AI assistant. Your task is to convert textual descriptions into valid 3D CAD elements that can be rendered in a web-based CAD application.

Output only valid JSON arrays of CAD elements without explanation or commentary.

Guidelines:
- Create geometrically valid elements with realistic dimensions, proportions, and spatial relationships
- Use a coherent design approach with {{complexity}} complexity 
- Apply a {{style}} design style
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
`;
// --- FINE LISTA ELEMENTI ---

// Helper function to map numeric complexity to ComplexityLevel string
const mapComplexity = (value: number): ComplexityLevel => {
  if (value < 0.33) return "simple";
  if (value < 0.66) return "moderate";
  return "complex";
};

export function useCADAssistant({ contextData, actionHandler }: UseCADAssistantProps) {
  const { messages, addMessage, isProcessing, setProcessing, isOpen, toggleAssistant, setError, clearMessages } =
    useAIAssistantStoreOpenai();

  const { state: aiState, dispatch: aiDispatch } = useAI();

  const [pendingActions, setPendingActions] = useState<AIAction[]>([]);
  const [isThinkAloudEnabled, setIsThinkAloudEnabled] = useState<boolean>(false);

  // --- Function to update think-aloud state ---
  const setThinkAloudEnabled = useCallback((enabled: boolean) => {
    setIsThinkAloudEnabled(enabled);
    console.log(`Think Aloud Mode state updated to: ${enabled}`);
  }, []);
  // --- End function ---

  // --- Update System Prompt for Image Capability ---
  const CAD_SYSTEM_PROMPT = `You are a specialized CAD modeling AI assistant acting as a {{assistantRole}}. Your primary task is to convert textual descriptions, **potentially accompanied by images**, into valid 3D CAD element JSON arrays based on the user request and context.

**IMAGE INPUT:** If images are provided, analyze them in conjunction with the text prompt to understand the user's request fully. 

RESPONSE STYLE & COMPLEXITY:
- Respond in a '{{responseStyle}}' manner.
- Tailor complexity to a '{{complexityLevel}}' level.

CURRENT CANVAS CONTEXT:
{{canvasContext}}

ADDITIONAL FILE CONTEXT:
{{additionalFileContext}}

// ELEMENT TYPE REFERENCE:
{{elementTypeList}} // Placeholder per la lista dettagliata

GUIDELINES & OUTPUT FORMAT:
- Create geometrically valid elements with realistic dimensions, proportions, and spatial relationships
- Use a coherent design approach with {{complexity}} complexity 
- Apply a {{style}} design style
- Ensure all elements include required properties for their type
- Position elements appropriately in 3D space with proper relative positions
- Use consistent units (mm) and scale
- For complex assemblies, use hierarchical organization
- All elements can optionally include:
  - rotation: {x, y, z} in degrees
  - name: descriptive string
  - description: additional information

Think of each element as a precise engineering specification.
AVAILABLE TOOLS: {{availableTools}}

Focus on generating the JSON array accurately when requested, incorporating visual information from images if provided.
`;
  // --- End System Prompt Update ---

  // Send a message to the AI assistant
  const sendMessage = useCallback(
    async (
      userInput: string,
      additionalContextStrings?: string[],
      options?: Record<string, any>,
      imageDataUrls?: string[] // <-- New parameter
    ) => {
      let messageToSend = userInput;
      let forceToolChoice = undefined;

      // --- Derive settings from options or defaults ---
      const assistantRole: AssistantRole = options?.role || "CAD Expert";
      const responseStyle: ResponseStyle = options?.responseStyle || "detailed";
      const complexityLevel: ComplexityLevel =
        options?.complexity !== undefined ? mapComplexity(options.complexity) : "moderate";
      const currentModel = options?.model || aiState.currentModel;
      const currentTemperature = options?.temperature || aiState.temperature;
      const currentMaxTokens = options?.max_tokens;
      const currentConstraints = options?.constraints;
      const forceToolName = options?.forceToolName;
      // --- End settings derivation ---

      // --- NEW forcing logic based on options ---
      if (forceToolName) {
        forceToolChoice = { type: "function" as const, function: { name: forceToolName } };
        console.log(`Forcing tool via UI button: ${forceToolName} for message:`, messageToSend);
        // Optionally, add a system message or modify user input display to indicate forced tool?
        // For now, just log it.
      }
      // --- End new forcing logic ---

      // --- Prepare the content for the last user message ---
      let lastMessageContent: MessageContent = [{ type: "text", text: userInput }];
      if (imageDataUrls && imageDataUrls.length > 0) {
        imageDataUrls.forEach(url => {
          // OpenAI recommends sending images first, then text, if order matters.
          // Let's prepend images before the initial text block.
          (lastMessageContent as (TextContentBlock | ImageContentBlock)[]).unshift({
            type: "image_url",
            image_url: { url: url }
          });
        });
        console.log(`Attaching ${imageDataUrls.length} images to the message.`);
      }
      // --- End content preparation ---

      // --- Add user message to the store using the complex content ---
      addMessage("user", lastMessageContent);
      setProcessing(true);
      setPendingActions([]);

      // Get current messages AFTER adding the new one
      const currentMessages = useAIAssistantStoreOpenai.getState().messages;

      try {
        const contextString = contextData
          ? `Current CAD canvas state:\n${JSON.stringify(contextData, null, 2)}`
          : "Canvas is currently empty.";

        const availableActions = actionHandler.getActionDefinitions().map(def => def.name);

        // --- Construct message history with potential image data ---
        const messageHistory: AIMessage[] = currentMessages.map((msg, index) => {
          // If it's the last message AND it's the user message we just added,
          // use the potentially complex content (text + images).
          if (index === currentMessages.length - 1 && msg.role === "user") {
            return {
              ...msg,
              // Ensure content is typed correctly for the API call
              content: lastMessageContent as (TextContentBlock | ImageContentBlock)[] | string
            };
          }
          // For older messages or non-user messages, ensure content is just text string
          // This prevents sending complex content from previous turns if state wasn't perfectly managed
          let simpleContent = "";
          if (typeof msg.content === "string") {
            simpleContent = msg.content;
          } else if (Array.isArray(msg.content)) {
            // Attempt to extract only text from previous complex messages for history
            simpleContent = msg.content
              .filter((block): block is TextContentBlock => block.type === "text")
              .map(block => block.text)
              .join("\n");
          }
          return {
            ...msg,
            content: simpleContent || "[Previous message content unavailable]"
          };
        });
        // --- End message history construction ---

        let additionalContextSection = "No additional file context provided.";
        if (additionalContextStrings && additionalContextStrings.length > 0) {
          additionalContextSection = "\n" + additionalContextStrings.join("\n---\n");
          additionalContextSection += "\nPlease consider the content of the documents above.";
        }

        let finalSystemPrompt =
          CAD_SYSTEM_PROMPT.replace("{{assistantRole}}", assistantRole)
            .replace("{{responseStyle}}", responseStyle)
            .replace("{{complexityLevel}}", complexityLevel)
            .replace("{{canvasContext}}", contextString)
            .replace("{{additionalFileContext}}", additionalContextSection)
            .replace("{{elementTypeList}}", ELEMENT_TYPE_DETAILS)
            .replace("{{availableTools}}", availableActions.join(", ") || "No tools available") +
          (currentConstraints
            ? `\n\nAPPLY THE FOLLOWING CONSTRAINTS:\n${JSON.stringify(currentConstraints, null, 2)}`
            : "");

        // --- Modify prompt if think-aloud is enabled ---
        if (isThinkAloudEnabled) {
          finalSystemPrompt += `\n\nIMPORTANT: Think Aloud Mode is enabled. Please verbalize your thought process and reasoning step-by-step before providing the final output or executing an action.`;
          console.log("Think Aloud Mode is ON, modifying system prompt.");
        }
        // --- End prompt modification ---

        console.log("Final System Prompt:", finalSystemPrompt);
        console.log("Sending message history:", JSON.stringify(messageHistory, null, 2)); // Log the potentially complex history

        // --- Call OpenAI Service ---
        try {
          console.log("Using direct OpenAI Service with options:", { forceToolChoice });
          const openAIResponse = await openAIService.sendMessage(
            messageHistory, // Pass the potentially complex history
            finalSystemPrompt,
            availableActions,
            responseStyle,
            complexityLevel,
            assistantRole,
            forceToolChoice
          );

          // Add assistant response (assuming it's text for now)
          addMessage("assistant", openAIResponse.content, openAIResponse.artifacts);

          if (openAIResponse.actions && openAIResponse.actions.length > 0) {
            const aiActions: AIAction[] = openAIResponse.actions.map(action => ({
              type: action.type,
              payload: action.payload,
              description: action.description || `Execute ${action.type}`
            }));
            setPendingActions(aiActions);
          }
        } catch (error) {
          console.error("Error sending message to AI (OpenAI):", error);
          const errorMessage = error instanceof Error ? error.message : "Error communicating with AI";
          setError(errorMessage);
          addMessage("system", `Sorry, I encountered an error: ${errorMessage}`);
        } finally {
          setProcessing(false);
        }
        // --- End Call OpenAI Service ---
      } catch (error) {
        console.error("Error sending message to AI:", error);
        setError(error instanceof Error ? error.message : "Error communicating with AI");
        addMessage("system", "Sorry, I encountered an error. Please try again.");
      }
    },
    [
      addMessage,
      setProcessing,
      contextData,
      actionHandler,
      setError,
      aiState.settings.mcpEnabled,
      aiState.settings.mcpEndpoint,
      aiState.settings.mcpApiKey,
      aiState.settings.mcpStrategy,
      aiState.settings.mcpCacheLifetime,
      aiState.currentModel,
      aiState.temperature,
      isThinkAloudEnabled,
      setThinkAloudEnabled
    ]
  );

  // Execute a pending action
  const executePendingAction = useCallback(
    async (action: AIAction) => {
      setProcessing(true);
      let result: { success: boolean; message: string; [key: string]: any } = {
        success: false,
        message: `Failed to execute action: ${action.type}`
      }; // Default result

      try {
        // Execute the action using the handler passed in props
        result = await actionHandler.executeAction(action);

        // Add system message with the result message
        addMessage("system", result.message);

        // If the action was thinkAloudMode, update the local state
        if (action.type === "thinkAloudMode" && result.success) {
          setThinkAloudEnabled(result.enabled); // Update state based on handler result
        }

        // Remove the executed action from pending actions
        setPendingActions(current => current.filter(a => a !== action));
      } catch (error) {
        console.error("Error executing action:", error);
        const errorMsg = error instanceof Error ? error.message : "Error executing action";
        setError(errorMsg);
        addMessage("system", `Failed to execute action ${action.type}: ${errorMsg}`);
        result = { success: false, message: `Failed to execute action ${action.type}: ${errorMsg}` };
      } finally {
        setProcessing(false);
      }
      return result; // Return the result object
    },
    [actionHandler, addMessage, setProcessing, setError, setThinkAloudEnabled]
  );

  return {
    messages,
    isProcessing,
    isOpen,
    pendingActions,
    sendMessage,
    toggleAssistant,
    clearMessages,
    executePendingAction,
    isThinkAloudEnabled,
    setThinkAloudEnabled
  };
}
