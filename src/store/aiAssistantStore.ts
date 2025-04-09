import { create } from 'zustand';
import { AIModelType } from '../types/ai';

export type AssistantMode = 'cad' | 'cam' | 'gcode' | 'toolpath' | 'general';

interface AIAssistantState {
  isVisible: boolean;
  isExpanded: boolean;
  currentMode: AssistantMode;
  selectedModel: AIModelType;
  position: { x: number; y: number };
  messageHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
    mode: AssistantMode;
  }>;
  
  // Actions
  toggle: () => void;
  setVisible: (visible: boolean) => void;
  setExpanded: (expanded: boolean) => void;
  setMode: (mode: AssistantMode) => void;
  setModel: (model: AIModelType) => void;
  setPosition: (position: { x: number; y: number }) => void;
  addMessage: (role: 'user' | 'assistant', content: string, mode: AssistantMode) => void;
  clearMessages: () => void;
}

// Safe function to get window dimensions
const getDefaultPosition = () => {
  if (typeof window === 'undefined') {
    return { x: 500, y: 300 }; // Default values for SSR
  }
  return { x: window.innerWidth - 420, y: window.innerHeight - 500 };
};

// We use create with a check for window
export const useAIAssistantStore = create<AIAssistantState>((set) => ({
  isVisible: false,
  isExpanded: false,
  currentMode: 'general',
  selectedModel: 'claude-3-5-sonnet-20240229',
  position: getDefaultPosition(),
  messageHistory: [],
  
  toggle: () => set((state) => ({ isVisible: !state.isVisible })),
  setVisible: (visible) => set({ isVisible: visible }),
  setExpanded: (expanded) => set({ isExpanded: expanded }),
  setMode: (mode) => set({ currentMode: mode }),
  setModel: (model) => set({ selectedModel: model }),
  setPosition: (position) => set({ position }),
  addMessage: (role, content, mode) => set((state) => ({
    messageHistory: [...state.messageHistory, {
      role,
      content,
      mode,
      timestamp: Date.now()
    }]
  })),
  clearMessages: () => set({ messageHistory: [] })
}));
