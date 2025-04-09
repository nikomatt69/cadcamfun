import { create } from 'zustand';

interface ToolState {
  activeTool: string | null;
  previousTool: string | null;
  toolOptions: Record<string, any>;
  
  setActiveTool: (toolId: string | null) => void;
  setToolOption: (toolId: string, option: string, value: any) => void;
}

export const useToolState = create<ToolState>((set) => ({
  activeTool: null,
  previousTool: null,
  toolOptions: {},
  
  setActiveTool: (toolId) => set((state) => ({ 
    activeTool: toolId,
    previousTool: state.activeTool
  })),
  
  setToolOption: (toolId, option, value) => set((state) => ({
    toolOptions: {
      ...state.toolOptions,
      [toolId]: {
        ...(state.toolOptions[toolId] || {}),
        [option]: value
      }
    }
  }))
}));