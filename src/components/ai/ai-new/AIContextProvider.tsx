// src/components/ai/ai-new/AIContextProvider.tsx - Aggiornato per supportare OpenAI
import React, { createContext, useContext, useReducer, useEffect } from "react";
import { useRouter } from "next/router";
import {
  AIMode,
  AIHistoryItem,
  AISettings,
  AIModelType,
  TextToCADRequest,
  AIState,
  AIProviderType,
  AIRequest,
  AIResponse,
  AIServiceConfig,
  AIPerformanceMetrics,
  GCodeOptimizationRequest,
  DesignAnalysisRequest,
  TokenUsage,
  AIMessage,
  AssistantRole,
  ResponseStyle,
  ComplexityLevel,
  AIArtifact,
  MessageContent,
  TextContentBlock,
  ImageContentBlock,
  AIAction
} from "@/src/types/AITypes";
import { ToolName } from "./OpenaiAssistant/AIMessageInput";
import { unifiedAIService } from "@/src/lib/ai/unifiedAIService";
import { aiAnalytics } from "@/src/lib/ai/ai-new/aiAnalytics";
import { aiCache } from "@/src/lib/ai/ai-new/aiCache";
import { AI_MODELS, AI_MODES, aiConfigManager, MODEL_CAPABILITIES } from "@/src/lib/ai/ai-new/aiConfigManager";
import { useContextStore } from "@/src/store/contextStore";
import { openAIService } from "@/src/lib/ai/openaiService";
import { v4 as uuidv4 } from "uuid";
import { Element, useElementsStore } from "@/src/store/elementsStore";
import { useEnhancedContext } from "@/src/hooks/useEnhancedContext";
import { aiStreamingService } from "@/src/lib/ai/aiStreamingService";
import { extendedThinkingService } from "@/src/lib/ai/ai-new/extendedThinkingService";

// Ripristina definizione locale di ForceToolChoice
interface ForceToolChoice {
  type: "function";
  function: { name: ToolName };
}

// Stato iniziale dell'AI
const initialState: AIState = {
  isEnabled: true,
  currentModel: AI_MODELS.CLAUDE_SONNET_4,
  temperature: 0.7,
  isProcessing: false,
  mode: "general",
  assistant: {
    isVisible: false,
    isPanelOpen: false,
    suggestions: [],
    lastAction: null
  },
  history: [],
  settings: {
    autoSuggest: true,
    cacheEnabled: true,
    analyticsEnabled: true,
    maxTokens: 6000,
    mcpEnabled: true,
    mcpStrategy: "balanced",
    mcpCacheLifetime: 3600,
    suggestThreshold: 0.7,
    customPrompts: {},
    autoModelSelection: true,
    costOptimization: true,
    multiProviderEnabled: true,
    preferredProvider: "claude"
  },
  performance: {
    averageResponseTime: 0,
    successRate: 100,
    tokenUsage: 0,
    lastSync: Date.now()
  },
  pendingActions: []
};

// Tipi di azioni per il reducer - Rinomina per evitare conflitti
type AIContextAction =
  | { type: "TOGGLE_AI"; payload: boolean }
  | { type: "SET_MODEL"; payload: AIModelType }
  | { type: "SET_TEMPERATURE"; payload: number }
  | { type: "UPDATE_PERFORMANCE"; payload: Partial<AIState["performance"]> }
  | { type: "OPTIMIZE_SETTINGS"; payload: Partial<AISettings> }
  | { type: "START_PROCESSING" }
  | { type: "END_PROCESSING" }
  | { type: "ADD_TO_HISTORY"; payload: AIHistoryItem }
  | { type: "CLEAR_HISTORY" }
  | { type: "UPDATE_SETTINGS"; payload: Partial<AISettings> }
  | { type: "SET_MODE"; payload: AIMode }
  | { type: "TOGGLE_ASSISTANT_VISIBILITY"; payload: boolean }
  | { type: "TOGGLE_ASSISTANT_PANEL"; payload: boolean }
  | { type: "SET_SUGGESTIONS"; payload: any[] }
  | { type: "RECORD_ASSISTANT_ACTION"; payload: string }
  | { type: "SET_PROVIDER"; payload: AIProviderType }
  // Usa AIAction importato per il payload qui
  | { type: "SET_PENDING_ACTIONS"; payload: AIAction[] }
  | { type: "CLEAR_PENDING_ACTIONS" };

// Reducer per gestire lo stato dell'AI - Aggiorna il tipo dell'argomento action
function aiReducer(state: AIState, action: AIContextAction): AIState {
  switch (action.type) {
    case "TOGGLE_AI":
      return { ...state, isEnabled: action.payload };
    case "SET_MODEL":
      return { ...state, currentModel: action.payload };
    case "SET_TEMPERATURE":
      return { ...state, temperature: action.payload };
    case "UPDATE_PERFORMANCE":
      return {
        ...state,
        performance: { ...state.performance, ...action.payload }
      };
    case "OPTIMIZE_SETTINGS":
      return {
        ...state,
        settings: { ...state.settings, ...action.payload }
      };
    case "START_PROCESSING":
      return { ...state, isProcessing: true };
    case "END_PROCESSING":
      return { ...state, isProcessing: false };
    case "ADD_TO_HISTORY":
      return {
        ...state,
        history: [action.payload, ...state.history].slice(0, 50)
      };
    case "CLEAR_HISTORY":
      return { ...state, history: [] };
    case "UPDATE_SETTINGS":
      return {
        ...state,
        settings: { ...state.settings, ...action.payload }
      };
    case "SET_MODE":
      return { ...state, mode: action.payload };
    case "TOGGLE_ASSISTANT_VISIBILITY":
      return {
        ...state,
        assistant: { ...state.assistant, isVisible: action.payload }
      };
    case "TOGGLE_ASSISTANT_PANEL":
      return {
        ...state,
        assistant: { ...state.assistant, isPanelOpen: action.payload }
      };
    case "SET_SUGGESTIONS":
      return {
        ...state,
        assistant: { ...state.assistant, suggestions: action.payload }
      };
    case "RECORD_ASSISTANT_ACTION":
      return {
        ...state,
        assistant: { ...state.assistant, lastAction: action.payload }
      };
    case "SET_PROVIDER":
      // Quando imposta il provider, aggiorna anche la preferenza nelle impostazioni
      return {
        ...state,
        settings: {
          ...state.settings,
          preferredProvider: action.payload
        }
      };
    case "SET_PENDING_ACTIONS":
      return { ...state, pendingActions: action.payload }; // Il payload è già del tipo corretto AIAction[]
    case "CLEAR_PENDING_ACTIONS":
      return { ...state, pendingActions: [] };
    default:
      return state;
  }
}

// Interfaccia del contesto AI
interface AIContextType {
  state: AIState;
  // Aggiorna il tipo del dispatch
  dispatch: React.Dispatch<AIContextAction>;
  // Metodi per operazioni AI core
  textToCAD: (description: string, constraints?: any, context?: string[]) => Promise<any>;
  optimizeGCode: (gcode: string, machineType: string) => Promise<any>;
  analyzeDesign: (elements: any[]) => Promise<any>;
  generateSuggestions: (context: string) => Promise<any[]>;
  // Canvas interaction function
  addElementsToCanvas: (elements: Element[]) => void;
  // Operazioni dell'assistente
  showAssistant: () => void;
  hideAssistant: () => void;
  toggleAssistantPanel: () => void;
  // Selezione del modello
  selectOptimalModel: (taskComplexity: "low" | "medium" | "high") => AIModelType;
  // Gestione del provider
  setProvider: (provider: AIProviderType) => void;
  getProviderForModel: (model: AIModelType) => AIProviderType;
  // Chat dell'assistente
  sendAssistantMessage: (message: string, imageDataUrls?: string[], activeTool?: ToolName | null) => Promise<any>;
}

// Creazione del contesto
const AIContext = createContext<AIContextType | undefined>(undefined);

// Define Props for the Provider
interface AIContextProviderProps {
  children: React.ReactNode;
  addElementsToCanvas: (elements: Element[]) => void;
}

// Provider del contesto
export const AIContextProvider: React.FC<AIContextProviderProps> = ({ children, addElementsToCanvas }) => {
  const [state, dispatch] = useReducer(aiReducer, initialState);
  const router = useRouter();
  const { getActiveContexts } = useContextStore();

  // Usa il nuovo hook per il contesto avanzato
  const { getContextDescription, getStructuredContext } = useEnhancedContext();

  /**
   * Imposta il provider AI preferito
   */
  const setProvider = (provider: AIProviderType): void => {
    dispatch({ type: "SET_PROVIDER", payload: provider });

    // Aggiorna il model se necessario
    const currentModel = state.currentModel;
    const currentProviderType = getProviderForModel(currentModel);

    // Normalize providers for comparison
    const normalizedCurrentProvider = currentProviderType.toLowerCase();
    const normalizedNewProvider = provider.toLowerCase();

    // Se il modello attuale non è compatibile con il nuovo provider, seleziona un nuovo modello
    if (normalizedCurrentProvider !== normalizedNewProvider) {
      // Convert to the format expected by MODEL_CAPABILITIES
      const providerKey = normalizedNewProvider === "openai" ? "OPENAI" : "CLAUDE";

      const models = Object.entries(MODEL_CAPABILITIES)
        .filter(([_, capability]) => capability.provider === provider)
        .map(([model]) => model as AIModelType);

      if (models.length > 0) {
        dispatch({ type: "SET_MODEL", payload: models[0] });
      }
    }
  };

  /**
   * Ottiene il provider associato a un modello
   */
  const getProviderForModel = (model: AIModelType): AIProviderType => {
    // Get the provider in the format expected by the rest of the application
    return MODEL_CAPABILITIES[model]?.provider as AIProviderType;
  };

  // Seleziona il modello ottimale in base alla complessità del task
  const selectOptimalModel = (taskComplexity: "low" | "medium" | "high"): AIModelType => {
    if (!state.settings.autoModelSelection) return state.currentModel;

    // Considera il provider preferito nelle impostazioni (se multi-provider è abilitato)
    const preferredProvider = state.settings.multiProviderEnabled
      ? state.settings.preferredProvider
      : getProviderForModel(state.currentModel);

    return aiConfigManager.selectOptimalModel(taskComplexity, preferredProvider as "CLAUDE" | "OPENAI");
  };

  // Monitora le prestazioni dell'AI
  useEffect(() => {
    const interval = setInterval(() => {
      const stats = aiAnalytics.getStats();
      dispatch({
        type: "UPDATE_PERFORMANCE",
        payload: {
          averageResponseTime: stats.averageResponseTime,
          successRate: stats.successRate,
          tokenUsage: stats.tokenUsage,
          lastSync: Date.now()
        }
      });
    }, 300000); // Ogni 5 minuti

    return () => clearInterval(interval);
  }, []);

  // Imposta la modalità in base al percorso URL
  useEffect(() => {
    const path = router.pathname;

    if (path.includes("/cad")) {
      dispatch({ type: "SET_MODE", payload: "cad" });
    } else if (path.includes("/cam")) {
      dispatch({ type: "SET_MODE", payload: "cam" });
    } else if (path.includes("/gcode")) {
      dispatch({ type: "SET_MODE", payload: "gcode" });
    } else if (path.includes("/toolpath")) {
      dispatch({ type: "SET_MODE", payload: "toolpath" });
    } else if (path.includes("/analysis")) {
      dispatch({ type: "SET_MODE", payload: "analysis" });
    } else {
      dispatch({ type: "SET_MODE", payload: "general" });
    }
  }, [router.pathname]);

  // Aggiorna la configurazione quando cambiano le impostazioni
  useEffect(() => {
    // Aggiorna la configurazione AI
    aiConfigManager.updateConfig({
      defaultModel: state.currentModel,
      maxTokens: state.settings.maxTokens,
      mcpEnabled: state.settings.mcpEnabled,
      mcpStrategy: state.settings.mcpStrategy,
      mcpCacheLifetime: state.settings.mcpCacheLifetime * 1000, // Convert to ms
      openaiApiKey: state.settings.openaiApiKey || "",
      openaiOrgId: state.settings.openaiOrgId || ""
    });

    // Aggiorna anche il servizio OpenAI direttamente
  }, [
    state.currentModel,
    state.settings.maxTokens,
    state.settings.mcpEnabled,
    state.settings.mcpStrategy,
    state.settings.mcpCacheLifetime,
    state.settings.openaiApiKey,
    state.settings.openaiOrgId
  ]);

  // Conversione da testo a elementi CAD
  const textToCAD = async (description: string, constraints?: any, providedContext?: string[]) => {
    if (!state.isEnabled) return { success: false, data: null, error: "AI is disabled" };

    dispatch({ type: "START_PROCESSING" });
    let historyUserItemId = uuidv4();
    let historyAssistantItemId = uuidv4();

    try {
      let model = state.currentModel;
      if (state.settings.autoModelSelection) {
        model = selectOptimalModel("medium");
      }
      const startTime = Date.now();
      const activeContextFiles = getActiveContexts();
      const contextTexts = [...(providedContext || []), ...activeContextFiles.map(file => file.content)];

      // Usa il contesto arricchito
      const enhancedContext = getContextDescription();
      const structuredContext = getStructuredContext();

      // Aggiungi il contesto arricchito ai testi di contesto se disponibile
      if (enhancedContext) {
        contextTexts.push(enhancedContext);
      }

      const requestWithContext: TextToCADRequest = {
        description,
        constraints,
        complexity: "moderate",
        style: "precise",
        context: contextTexts.length > 0 ? contextTexts : undefined,
        structuredContext: Object.keys(structuredContext).length > 0 ? structuredContext : undefined
      };

      const result = await unifiedAIService.textToCADElements(requestWithContext);
      const processingTime = Date.now() - startTime;

      if (result.success && result.data && Array.isArray(result.data) && result.data.length > 0) {
        const generatedElements: Element[] = result.data;
        const elementCount = generatedElements.length;

        const cadArtifact: AIArtifact = {
          id: uuidv4(),
          type: "cad_elements",
          content: generatedElements,
          title: `Generated ${elementCount} CAD Element(s)`
        };

        console.log("[AIContextProvider] Created cad_elements artifact:", cadArtifact);

        const historyPayload: AIHistoryItem = {
          id: historyAssistantItemId,
          type: "assistant_response",
          timestamp: Date.now(),
          prompt: description,
          result: `Ho generato ${elementCount} element${elementCount > 1 ? "i" : "o"}. Aggiungil${elementCount > 1 ? "i" : "o"} alla tela?`,
          modelUsed: result.model || model,
          processingTime,
          tokenUsage: result.usage
            ? {
                prompt: result.usage.promptTokens,
                completion: result.usage.completionTokens,
                total: result.usage.totalTokens
              }
            : undefined,
          artifacts: [cadArtifact]
        };

        console.log("[AIContextProvider] Dispatching ADD_TO_HISTORY with payload:", historyPayload);

        dispatch({
          type: "ADD_TO_HISTORY",
          payload: historyPayload satisfies AIHistoryItem
        });
        return { ...result, data: null };
      } else if (result.success) {
        dispatch({
          type: "ADD_TO_HISTORY",
          payload: {
            id: historyAssistantItemId,
            type: "assistant_response",
            timestamp: Date.now(),
            prompt: description,
            result: "AI generated no elements.",
            modelUsed: result.model || model,
            processingTime,
            tokenUsage: result.usage
              ? {
                  prompt: result.usage.promptTokens,
                  completion: result.usage.completionTokens,
                  total: result.usage.totalTokens
                }
              : undefined
          } satisfies AIHistoryItem
        });
        return { ...result, error: "AI generated no elements." };
      } else {
        dispatch({
          type: "ADD_TO_HISTORY",
          payload: {
            id: historyAssistantItemId,
            type: "assistant_error",
            timestamp: Date.now(),
            modelUsed: result.model || model,
            processingTime,
            result: `Error: ${result.error || "Unknown AI error"}`,
            prompt: description
          } satisfies AIHistoryItem
        });
        return result;
      }
    } catch (error) {
      console.error("Error in textToCAD:", error);
      dispatch({
        type: "ADD_TO_HISTORY",
        payload: {
          id: historyAssistantItemId,
          type: "system_error",
          timestamp: Date.now(),
          modelUsed: state.currentModel,
          processingTime: 0,
          result: `System Error: ${error instanceof Error ? error.message : "Unknown system error"}`,
          prompt: description
        } satisfies AIHistoryItem
      });
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    } finally {
      dispatch({ type: "END_PROCESSING" });
    }
  };

  // Ottimizzazione del G-code
  const optimizeGCode = async (gcode: string, machineType: string) => {
    if (!state.isEnabled) return { success: false, data: null, error: "AI is disabled" };

    dispatch({ type: "START_PROCESSING" });

    try {
      const model = selectOptimalModel("medium");
      const provider = state.settings.preferredProvider;
      const startTime = Date.now();

      // Aggiungi il contesto arricchito
      const enhancedContext = getContextDescription();
      const structuredContext = getStructuredContext();

      const result = await unifiedAIService.optimizeGCode(
        gcode,
        machineType,
        enhancedContext || undefined,
        Object.keys(structuredContext).length > 0 ? structuredContext : undefined
      );

      const processingTime = Date.now() - startTime;

      if (result.success) {
        dispatch({
          type: "ADD_TO_HISTORY",
          payload: {
            id: `gcode_${Date.now()}`,
            type: "gcode_optimization",
            timestamp: Date.now(),
            prompt: `Optimize G-code for ${machineType}`,
            modelUsed: result.model || model,
            processingTime,
            tokenUsage: result.usage
              ? {
                  prompt: result.usage.promptTokens,
                  completion: result.usage.completionTokens,
                  total: result.usage.totalTokens
                }
              : undefined
          }
        });
      }
      return result;
    } catch (error) {
      console.error("Error in optimizeGCode:", error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    } finally {
      dispatch({ type: "END_PROCESSING" });
    }
  };

  // Analisi del design
  const analyzeDesign = async (elements: any[]) => {
    if (!state.isEnabled) return { success: false, data: null, error: "AI is disabled" };

    dispatch({ type: "START_PROCESSING" });

    try {
      const model = selectOptimalModel("high");
      const provider = state.settings.preferredProvider;
      const startTime = Date.now();

      // Aggiungi il contesto arricchito
      const enhancedContext = getContextDescription();
      const structuredContext = getStructuredContext();

      const result = await unifiedAIService.analyzeDesign(
        elements,
        enhancedContext || undefined,
        Object.keys(structuredContext).length > 0 ? structuredContext : undefined
      );

      const processingTime = Date.now() - startTime;

      if (result.success) {
        dispatch({
          type: "ADD_TO_HISTORY",
          payload: {
            id: `analysis_${Date.now()}`,
            type: "design_analysis",
            timestamp: Date.now(),
            result: result.data,
            modelUsed: result.model || model,
            processingTime,
            tokenUsage: result.usage
              ? {
                  prompt: result.usage.promptTokens,
                  completion: result.usage.completionTokens,
                  total: result.usage.totalTokens
                }
              : undefined
          }
        });
      }
      return result;
    } catch (error) {
      console.error("Error in analyzeDesign:", error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    } finally {
      dispatch({ type: "END_PROCESSING" });
    }
  };

  // Generazione di suggerimenti contestuali
  const generateSuggestions = async (context: string) => {
    if (!state.isEnabled || !state.settings.autoSuggest) {
      return [];
    }

    try {
      const model = selectOptimalModel("low");
      const provider = state.settings.preferredProvider;

      // Aggiungi il contesto arricchito
      const enhancedContext = getContextDescription();
      const combinedContext = context + (enhancedContext ? `\n\n${enhancedContext}` : "");

      const result = await unifiedAIService.generateSuggestions(combinedContext, state.mode);

      if (result.success && result.data) {
        dispatch({ type: "SET_SUGGESTIONS", payload: result.data });
        return result.data;
      }

      return [];
    } catch (error) {
      console.error("Error generating suggestions:", error);
      return [];
    }
  };

  // Invia un messaggio all'assistente
  const sendAssistantMessage = async (messageText: string, imageDataUrls?: string[], activeTool?: ToolName | null) => {
    if (!state.isEnabled) return;
    dispatch({ type: "START_PROCESSING" });

    // Check if Extended Thinking is enabled in localStorage
    const getExtendedThinkingEnabled = () => {
      if (typeof window !== "undefined") {
        const saved = localStorage.getItem("cad-assistant-extended-thinking");
        return saved ? JSON.parse(saved) : true;
      }
      return true;
    };

    const extendedThinkingEnabled = getExtendedThinkingEnabled();
    const reasoningEnabled =
      extendedThinkingEnabled && (state.currentModel.includes("claude") || state.currentModel.includes("sonnet"));

    // Initialize Extended Thinking Session
    let thinkingSessionId: string | null = null;
    if (reasoningEnabled) {
      const conversationId = `ai_context_${Date.now()}`;
      const context = `AI Context Provider - User: ${messageText.substring(0, 100)}... Model: ${state.currentModel}`;
      thinkingSessionId = extendedThinkingService.startThinkingSession(conversationId, context);

      // Add initial thinking step
      extendedThinkingService.addThinkingStep(
        thinkingSessionId,
        "analysis",
        `Starting to process user message: "${messageText}"`,
        0.9,
        "Beginning analysis of user intent and context",
        [messageText, "context_analysis"]
      );
    }

    // 1. Format the new user message
    let userMessageContent: MessageContent = messageText;
    if (imageDataUrls && imageDataUrls.length > 0) {
      const contentBlocks: (TextContentBlock | ImageContentBlock)[] = [];
      if (messageText.trim()) {
        contentBlocks.push({ type: "text", text: messageText.trim() });
      }
      imageDataUrls.forEach(url => {
        contentBlocks.push({ type: "image_url", image_url: { url } });
      });
      userMessageContent = contentBlocks;
    }

    const newUserMessage: AIMessage = {
      id: uuidv4(),
      role: "user",
      content: userMessageContent,
      timestamp: Date.now()
    };

    // Map history to AIMessage format
    const currentMessages: AIMessage[] = state.history.reduce((acc: AIMessage[], item: AIHistoryItem) => {
      if (item.type === "user_message" && item.prompt) {
        // Handle potential complex content stored in prompt if needed later
        acc.push({ id: item.id, role: "user", content: item.prompt, timestamp: item.timestamp });
      } else if (item.type === "assistant_response" && item.result) {
        acc.push({
          id: item.id,
          role: "assistant",
          content: typeof item.result === "string" ? item.result : JSON.stringify(item.result),
          timestamp: item.timestamp
        });
      }
      return acc;
    }, []);

    const messagesToSend = [...currentMessages, newUserMessage];

    // 2. Gather context and parameters
    const activeContextFiles = getActiveContexts();
    const canvasElements = useElementsStore.getState().elements;

    // Usa il contesto arricchito
    const enhancedContext = getContextDescription();
    const structuredContext = getStructuredContext();

    let elementContextString = "Current Canvas Elements:\n";
    if (canvasElements.length > 0) {
      elementContextString += canvasElements
        .map(el => `- ID: ${el.id}, Type: ${el.type}, Name: ${el.name || "Unnamed"}`)
        .join("\n");
    } else {
      elementContextString += "(No elements on canvas)";
    }

    // Build file context with session info
    let fileContextString = "";
    if (activeContextFiles.length > 0) {
             const session = useContextStore.getState().currentSession;
      if (session?.title || session?.description) {
        fileContextString += "--- Context Session ---\n";
        if (session.title) fileContextString += `Title: ${session.title}\n`;
        if (session.description) fileContextString += `Description: ${session.description}\n`;
        fileContextString += "\n";
      }
      fileContextString += activeContextFiles.map(f => `--- File: ${f.name} ---\n${f.content}`).join("\n\n");
    }
    const contextString = `${elementContextString}\n\n${fileContextString}\n\n${enhancedContext || ""}`.trim();

    const assistantActions = [
      "generateCADElement",
      "updateCADElement",
      "removeCADElement",
      "suggestOptimizations",
      "chainOfThoughtAnalysis",
      "thinkAloudMode",
      "exportCADProjectAsZip",
      "generate2DTechnicalDrawings",
      "simulatePhysicalProperties",
      "autoQuoteCADElements",
      "analyzeManufacturability"
    ];
    const assistantRole: AssistantRole = "CAD Assistant";
    const responseStyle: ResponseStyle = "detailed";
    const complexityLevel: ComplexityLevel = "moderate";
    const modelToUse: AIModelType = "gpt-4.1";

    let historyUserItemId = uuidv4();
    let historyAssistantItemId = uuidv4();

    // --- Add user message history item --- (Do this once)
    const userHistoryPayload: AIHistoryItem = {
      id: historyUserItemId,
      type: "user_message",
      timestamp: newUserMessage.timestamp,
      userContent: userMessageContent,
      prompt:
        typeof userMessageContent === "string"
          ? userMessageContent
          : userMessageContent.map(block => (block.type === "text" ? block.text : "[Image]")).join(" "),
      modelUsed: modelToUse,
      processingTime: 0,
      result: null
    };
    dispatch({ type: "ADD_TO_HISTORY", payload: userHistoryPayload });

    try {
      let response: any; // Use 'any' for now to hold response from either service

      // --- Decide which service to call ---
      if (activeTool) {
        // --- Call OpenAI Service Directly for specific tools ---
        console.log(`[AIContextProvider] Calling openaiService directly for tool: ${activeTool}`);
        const forceToolChoice: ForceToolChoice = { type: "function", function: { name: activeTool } };

        // Call openaiService.sendMessage
        // Note: Assuming openaiService is imported and instantiated correctly
        response = await openAIService.sendMessage(
          messagesToSend,
          contextString, // Pass context, though formatMessagesForApi might rebuild it
          assistantActions,
          responseStyle,
          complexityLevel,
          assistantRole,
          forceToolChoice
          // Passa il contesto strutturato
        );
        console.log("[AIContextProvider] Received response from openaiService:", response);
        // Manually add success: true/false based on whether content/actions exist,
        // and map the response to the structure expected by the processing logic below
        // The structure from processResponse in openaiService.ts is { content, actions, artifacts, fromCache }
        response = {
          success: !!(response.content || response.actions || response.artifacts),
          data: {
            content: response.content,
            tool_calls: response.actions // Map 'actions' from OpenAIResponse to 'tool_calls'
            // Assuming 'artifacts' from openaiService are not relevant here or handled differently
          },
          error: !(response.content || response.actions || response.artifacts)
            ? "No content or actions received from OpenAI"
            : null,
          processingTime: 0, // TODO: Calculate processing time if possible
          usage: undefined, // TODO: Map token usage if returned by openaiService
          fromCache: response.fromCache
        };
      } else {
        // --- Call Unified AI Service for general chat ---
        console.log("[AIContextProvider] Calling unifiedAIService for general message.");
        response = await unifiedAIService.getAssistantCompletion(
          messagesToSend,
          contextString,
          assistantActions,
          responseStyle,
          complexityLevel,
          assistantRole,
          undefined, // No forceToolChoice for general chat
          modelToUse,
          structuredContext,
          reasoningEnabled // Pass the reasoning flag
        );
        console.log("[AIContextProvider] Received response from getAssistantCompletion:", response);
      }

      // --- 4. Process Response (Common logic for both services) ---
      if (response.success && response.data) {
        const assistantResponseContent = response.data.content || "";
        let toolCalls = response.data.tool_calls; // This should now contain data from either service

        // Finalize thinking session if it was created
        let finalThinkingSession: any = null;
        if (thinkingSessionId) {
          extendedThinkingService.addThinkingStep(
            thinkingSessionId,
            "reasoning",
            `Generated response with ${toolCalls?.length || 0} tool calls`,
            0.95,
            "Successfully completed message processing",
            ["response_generation", "completion"]
          );
          finalThinkingSession = extendedThinkingService.finalizeThinkingSession(thinkingSessionId);
        }

        // --- START MODIFICATION: Populate missing fields ---
        if (toolCalls && toolCalls.length > 0) {
          const userMessageText =
            typeof userMessageContent === "string"
              ? userMessageContent
              : userMessageContent.map(block => (block.type === "text" ? block.text : "[Image]")).join(" ");
          toolCalls = toolCalls.map((call: AIAction) => {
            // Handle Chain of Thought Analysis
            if (call.type === "chainOfThoughtAnalysis" && !call.payload?.goal && userMessageText) {
              console.log(
                `[AIContextProvider] Populating missing 'goal' for chainOfThoughtAnalysis with user message: "${userMessageText}"`
              );
              return {
                ...call,
                payload: { ...call.payload, goal: userMessageText }
              };
            }
            // Handle Export
            else if (call.type === "exportCADProjectAsZip" && !call.payload?.filename) {
              const defaultFilename = "cad-project-export.zip";
              console.log(
                `[AIContextProvider] Populating missing 'filename' for exportCADProjectAsZip with default: "${defaultFilename}"`
              );
              return {
                ...call,
                payload: { ...call.payload, filename: defaultFilename }
              };
            }
            // Handle Update (Log missing ID)
            else if (call.type === "updateCADElement" && !call.payload?.id) {
              console.warn(`[AIContextProvider] Missing 'id' in payload for updateCADElement. Action may fail.`);
            }
            // Handle Remove (Log missing ID)
            else if (call.type === "removeCADElement" && !call.payload?.id) {
              console.warn(`[AIContextProvider] Missing 'id' in payload for removeCADElement. Action may fail.`);
            }
            // Return call unmodified if no specific handling needed
            return call;
          });
        }
        // --- END MODIFICATION ---

        let artifacts: AIArtifact[] = [];
        if (toolCalls && toolCalls.length > 0) {
          console.log("[AIContextProvider] Creating tool_calls artifact:", toolCalls);
          artifacts.push({
            id: uuidv4(),
            type: "tool_calls",
            content: toolCalls,
            title: "Pending Actions"
          });
          dispatch({ type: "SET_PENDING_ACTIONS", payload: toolCalls });
        } else {
          console.log("[AIContextProvider] Clearing pending actions as none were returned.");
          dispatch({ type: "CLEAR_PENDING_ACTIONS" });
        }

        if (
          (assistantResponseContent && assistantResponseContent !== "(No text content received)") ||
          artifacts.length > 0
        ) {
          const assistantHistoryPayload: AIHistoryItem = {
            id: historyAssistantItemId,
            type: "assistant_response",
            timestamp: Date.now(),
            result:
              assistantResponseContent && assistantResponseContent !== "(No text content received)"
                ? assistantResponseContent
                : "(Pending Actions)",
            modelUsed: modelToUse,
            processingTime: response.processingTime ?? 0,
            tokenUsage: response.usage
              ? {
                  prompt: response.usage.promptTokens,
                  completion: response.usage.completionTokens,
                  total: response.usage.totalTokens
                }
              : undefined,
            prompt: userHistoryPayload.prompt,
            artifacts: artifacts.length > 0 ? artifacts : undefined,
            thinking: finalThinkingSession?.summary,
            thinkingDuration: finalThinkingSession?.totalDuration
              ? Math.round(finalThinkingSession.totalDuration / 1000)
              : undefined
          };

          console.log(
            "[AIContextProvider] Dispatching Assistant History Item:",
            JSON.stringify(assistantHistoryPayload, null, 2)
          );
          dispatch({ type: "ADD_TO_HISTORY", payload: assistantHistoryPayload });
        }
      } else {
        // Error handling
        console.log("[AIContextProvider] Clearing pending actions due to failed response.");
        dispatch({ type: "CLEAR_PENDING_ACTIONS" });
        const errorHistoryPayload: AIHistoryItem = {
          id: historyAssistantItemId,
          type: "assistant_error",
          timestamp: Date.now(),
          modelUsed: modelToUse,
          processingTime: response.processingTime ?? 0,
          result: `Error: ${response.error || "Unknown AI error"}`,
          prompt: userHistoryPayload.prompt // Usa il prompt utente associato
        };
        dispatch({ type: "ADD_TO_HISTORY", payload: errorHistoryPayload });
      }
    } catch (error) {
      // Exception handling
      console.log("[AIContextProvider] Clearing pending actions due to caught error.");
      dispatch({ type: "CLEAR_PENDING_ACTIONS" });
      const systemErrorPayload: AIHistoryItem = {
        id: historyAssistantItemId,
        type: "system_error",
        timestamp: Date.now(),
        modelUsed: modelToUse,
        processingTime: 0,
        result: `System Error: ${error instanceof Error ? error.message : "Unknown system error"}`,
        prompt: userHistoryPayload.prompt // Usa il prompt utente associato
      };
      dispatch({ type: "ADD_TO_HISTORY", payload: systemErrorPayload });
    } finally {
      dispatch({ type: "END_PROCESSING" });
    }
  };

  // Operazioni dell'assistente
  const showAssistant = () => {
    dispatch({ type: "TOGGLE_ASSISTANT_VISIBILITY", payload: true });
  };

  const hideAssistant = () => {
    dispatch({ type: "TOGGLE_ASSISTANT_VISIBILITY", payload: false });
  };

  const toggleAssistantPanel = () => {
    dispatch({
      type: "TOGGLE_ASSISTANT_PANEL",
      payload: !state.assistant.isPanelOpen
    });
  };

  // Valore del contesto
  const contextValue: AIContextType = {
    state,
    dispatch,
    textToCAD,
    optimizeGCode,
    analyzeDesign,
    generateSuggestions,
    addElementsToCanvas,
    showAssistant,
    hideAssistant,
    toggleAssistantPanel,
    selectOptimalModel,
    setProvider,
    getProviderForModel,
    sendAssistantMessage
  };

  return <AIContext.Provider value={contextValue}>{children}</AIContext.Provider>;
};

// Hook personalizzato per utilizzare il contesto AI
export const useAI = () => {
  const context = useContext(AIContext);
  if (context === undefined) {
    throw new Error("useAI must be used within an AIContextProvider");
  }
  return context;
};
