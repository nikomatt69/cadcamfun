import { create } from "zustand";
import { persist } from "zustand/middleware";
import { AIModelType } from "../types/ai";
import {
  getMCPIntegratedService,
  MCPIntegratedRequest,
  MCPIntegratedResponse
} from "../lib/ai/mcp/mcpIntegratedService";
import { useMCPServerStore, getConnectedServers } from "./mcpServerStore";

export type AssistantMode = "cad" | "cam" | "gcode" | "toolpath" | "general";

interface AIMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  mode: AssistantMode;
  mcpData?: {
    toolsCalled: number;
    processingTime: number;
    thinkingEnabled: boolean;
    serverStatuses: Record<string, string>;
    proactiveSuggestions: string[];
  };
}

interface AIAssistantState {
  isVisible: boolean;
  isExpanded: boolean;
  currentMode: AssistantMode;
  selectedModel: AIModelType;
  position: { x: number; y: number };
  messageHistory: AIMessage[];
  isProcessing: boolean;
  currentRequest: string | null;

  // Claude MCP Integration
  mcpEnabled: boolean;
  thinkingEnabled: boolean;
  preferredServers: string[];
  lastMcpResponse: MCPIntegratedResponse | null;

  // Actions
  toggle: () => void;
  setVisible: (visible: boolean) => void;
  setExpanded: (expanded: boolean) => void;
  setMode: (mode: AssistantMode) => void;
  setModel: (model: AIModelType) => void;
  setPosition: (position: { x: number; y: number }) => void;
  addMessage: (
    role: "user" | "assistant" | "system",
    content: string,
    mode: AssistantMode,
    mcpData?: AIMessage["mcpData"]
  ) => void;
  clearMessages: () => void;
  setProcessing: (processing: boolean) => void;

  // Claude MCP Actions
  sendMessage: (message: string, cadElements?: any[], projectContext?: string) => Promise<MCPIntegratedResponse>;
  setMcpEnabled: (enabled: boolean) => void;
  setThinkingEnabled: (enabled: boolean) => void;
  setPreferredServers: (servers: string[]) => void;
  testMcpIntegration: () => Promise<{ success: boolean; message: string; details: any }>;
}

// Safe function to get window dimensions
const getDefaultPosition = () => {
  if (typeof window === "undefined") {
    return { x: 500, y: 300 }; // Default values for SSR
  }
  return { x: window.innerWidth - 420, y: window.innerHeight - 500 };
};

// Generate unique message ID
const generateMessageId = () => `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

export const useAIAssistantStore = create<AIAssistantState>()(
  persist(
    (set, get) => ({
      isVisible: false,
      isExpanded: false,
      currentMode: "general",
      selectedModel: "claude-sonnet-4-20250514",
      position: getDefaultPosition(),
      messageHistory: [],
      isProcessing: false,
      currentRequest: null,

      // Claude MCP Integration
      mcpEnabled: true,
      thinkingEnabled: true,
      preferredServers: ["filesystem", "specialized-tools"],
      lastMcpResponse: null,

      toggle: () => set(state => ({ isVisible: !state.isVisible })),
      setVisible: visible => set({ isVisible: visible }),
      setExpanded: expanded => set({ isExpanded: expanded }),
      setMode: mode => set({ currentMode: mode }),
      setModel: model => set({ selectedModel: model }),
      setPosition: position => set({ position }),

      addMessage: (role, content, mode, mcpData) => {
        const message: AIMessage = {
          id: generateMessageId(),
          role,
          content,
          mode,
          timestamp: Date.now(),
          mcpData
        };

        set(state => ({
          messageHistory: [...state.messageHistory, message]
        }));
      },

      clearMessages: () => set({ messageHistory: [] }),
      setProcessing: processing => set({ isProcessing: processing }),

      // Claude MCP Actions
      sendMessage: async (message, cadElements = [], projectContext = "") => {
        const state = get();
        set({ isProcessing: true, currentRequest: message });

        try {
          // Add user message
          state.addMessage("user", message, state.currentMode);

          // Prepare MCP request
          const mcpRequest: MCPIntegratedRequest = {
            message,
            context: {
              conversationId: `assistant_${Date.now()}`,
              cadElements,
              currentProject: projectContext || `${state.currentMode} Session`,
              userPreferences: {
                mode: state.currentMode,
                model: state.selectedModel,
                mcpEnabled: state.mcpEnabled,
                thinkingEnabled: state.thinkingEnabled
              },
              previousMessages: state.messageHistory.slice(-6).map(msg => ({
                role: msg.role as "user" | "assistant",
                content: msg.content,
                timestamp: msg.timestamp
              }))
            },
            options: {
              enableThinking: state.thinkingEnabled,
              enableMCP: state.mcpEnabled,
              mcpServers: state.mcpEnabled ? state.preferredServers : [],
              model: state.selectedModel,
              temperature: 0.7,
              maxTokens: 4000,
              useCache: true,
              priority: "normal"
            }
          };

          // Execute with Claude MCP
          const mcpService = getMCPIntegratedService();
          const response = await mcpService.processWithMCPAndThinking(mcpRequest);

          // Add assistant response with MCP data
          state.addMessage("assistant", response.response, state.currentMode, {
            toolsCalled: response.mcpToolsCalled.length,
            processingTime: response.processingTime,
            thinkingEnabled: !!response.thinkingSession,
            serverStatuses: response.serverStatuses || {},
            proactiveSuggestions: response.proactiveSuggestions
          });

          set({
            lastMcpResponse: response,
            isProcessing: false,
            currentRequest: null
          });

          return response;
        } catch (error) {
          console.error("Error sending message with Claude MCP:", error);

          const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
          state.addMessage("system", `Error: ${errorMessage}`, state.currentMode);

          set({
            isProcessing: false,
            currentRequest: null
          });

          throw error;
        }
      },

      setMcpEnabled: enabled => {
        set({ mcpEnabled: enabled });

        // Add system message about MCP status change
        const message = enabled
          ? "Claude MCP integration enabled. Enhanced AI capabilities are now available."
          : "Claude MCP integration disabled. Using standard AI responses.";

        get().addMessage("system", message, get().currentMode);
      },

      setThinkingEnabled: enabled => {
        set({ thinkingEnabled: enabled });

        const message = enabled
          ? "Extended thinking enabled. AI will show reasoning process for complex queries."
          : "Extended thinking disabled. AI will provide direct responses.";

        get().addMessage("system", message, get().currentMode);
      },

      setPreferredServers: servers => {
        set({ preferredServers: servers });

        if (servers.length > 0) {
          get().addMessage("system", `Preferred MCP servers updated: ${servers.join(", ")}`, get().currentMode);
        }
      },

      testMcpIntegration: async () => {
        try {
          const mcpService = getMCPIntegratedService();
          const result = await mcpService.testClaudeMCPIntegration();

          const message = result.success
            ? `Claude MCP integration test successful! Response time: ${result.details?.processingTime}ms, Tools called: ${result.details?.toolsCalled}`
            : `Claude MCP integration test failed: ${result.message}`;

          get().addMessage("system", message, get().currentMode);

          return result;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          get().addMessage("system", `MCP integration test error: ${errorMessage}`, get().currentMode);

          return {
            success: false,
            message: "Integration test failed",
            details: { error: errorMessage }
          };
        }
      }
    }),
    {
      name: "ai-assistant-store",
      partialize: state => ({
        isVisible: state.isVisible,
        isExpanded: state.isExpanded,
        currentMode: state.currentMode,
        selectedModel: state.selectedModel,
        position: state.position,
        messageHistory: state.messageHistory.slice(-50), // Keep last 50 messages
        mcpEnabled: state.mcpEnabled,
        thinkingEnabled: state.thinkingEnabled,
        preferredServers: state.preferredServers
      })
    }
  )
);

// Convenience hooks for specific functionalities
export const useAIAssistantMCP = () => {
  const store = useAIAssistantStore();
  return {
    mcpEnabled: store.mcpEnabled,
    thinkingEnabled: store.thinkingEnabled,
    preferredServers: store.preferredServers,
    lastResponse: store.lastMcpResponse,
    setMcpEnabled: store.setMcpEnabled,
    setThinkingEnabled: store.setThinkingEnabled,
    setPreferredServers: store.setPreferredServers,
    testIntegration: store.testMcpIntegration,
    connectedServers: getConnectedServers()
  };
};

export const useAIConversation = () => {
  const store = useAIAssistantStore();
  return {
    messages: store.messageHistory,
    isProcessing: store.isProcessing,
    currentRequest: store.currentRequest,
    sendMessage: store.sendMessage,
    addMessage: store.addMessage,
    clearMessages: store.clearMessages,
    mode: store.currentMode,
    setMode: store.setMode
  };
};

export const useAIAssistantUI = () => {
  const store = useAIAssistantStore();
  return {
    isVisible: store.isVisible,
    isExpanded: store.isExpanded,
    position: store.position,
    toggle: store.toggle,
    setVisible: store.setVisible,
    setExpanded: store.setExpanded,
    setPosition: store.setPosition
  };
};

// Initialize Claude MCP on store creation
if (typeof window !== "undefined") {
  // Test MCP integration on app start
  setTimeout(() => {
    const store = useAIAssistantStore.getState();
    if (store.mcpEnabled) {
      store.testMcpIntegration().catch(console.error);
    }
  }, 2000);
}
