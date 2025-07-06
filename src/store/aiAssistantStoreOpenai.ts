// src/store/aiAssistantStore.ts
import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import { AIAssistantState, AIMessage, AIAction, AIArtifact, MessageContent } from "../types/AITypes";

interface AIAssistantStore extends AIAssistantState {
  // Actions
  addMessage: (role: "user" | "assistant" | "system", content: MessageContent, artifacts?: AIArtifact[]) => void;
  setProcessing: (isProcessing: boolean) => void;
  toggleAssistant: () => void;
  clearMessages: () => void;
  setError: (error: string | null) => void;
  setContext: (context: string) => void;
  executeAction: (action: AIAction) => Promise<void>;
}

export const useAIAssistantStoreOpenai = create<AIAssistantStore>((set, get) => ({
  messages: [],
  isProcessing: false,
  isOpen: false,
  error: null,
  context: "default",
  availableActions: [
    "generateCADComponent",
    "analyzeDesign",
    "optimizeModel",
    "removeCADElement",
    "exportCADProjectAsZip",
    "thinkAloudMode",
    "chainOfThoughtAnalysis",
    "suggestOptimizations",
    "generate2DTechnicalDrawings",
    "simulatePhysicalProperties",
    "autoQuoteCADElements",
    "analyzeManufacturability"
  ],

  addMessage: (role, content, artifacts = []) => {
    const newMessage: AIMessage = {
      id: uuidv4(),
      role,
      content,
      timestamp: Date.now(),
      artifacts
    };
    set(state => ({
      messages: [...state.messages, newMessage]
    }));
  },

  setProcessing: isProcessing => set({ isProcessing }),

  toggleAssistant: () => set(state => ({ isOpen: !state.isOpen })),

  clearMessages: () => set({ messages: [] }),

  setError: error => set({ error }),

  setContext: context => set({ context }),

  executeAction: async action => {
    // Here we'll implement action execution logic
    set({ isProcessing: true });

    try {
      // Action execution will be implemented in Step 5
      console.log(`Executing action: ${action.type}`, action.payload);

      // Mock successful execution for now
      await new Promise(resolve => setTimeout(resolve, 500));

      // Add system message confirming action execution
      get().addMessage("system", `Action ${action.type} executed successfully.`);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Unknown error occurred" });
    } finally {
      set({ isProcessing: false });
    }
  }
}));
