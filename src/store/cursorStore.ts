// src/store/cursorStore.ts
import { create } from 'zustand';
import { 
  CursorConfig, 
  ElementType, 
  getContextualCursor, 
  InteractionState, 
  ToolCursorType 
} from '../lib/utils/cursorUtils';

interface CursorState {
  cursorConfig: CursorConfig;
  targetElement: HTMLElement | null;
  setCursor: (config: Partial<CursorConfig>) => void;
  resetCursor: () => void;
  setTarget: (element: HTMLElement | null) => void;
  // Helper methods
  setTool: (tool: ToolCursorType | undefined) => void;
  setInteraction: (state: InteractionState) => void;
  setHover: (isHovered: boolean, elementType?: ElementType) => void;
  setSelected: (isSelected: boolean, options?: { elementType?: ElementType, isEditable?: boolean }) => void;
  setLocked: (isLocked: boolean) => void;
  // Computed
  currentCursor: string;
}

export const useCursorStore = create<CursorState>((set, get) => ({
  cursorConfig: {
    isSelected: false,
    isHovered: false,
    isEditable: true,
    isLocked: false,
    elementType: ElementType.NODE,
    activeTool: undefined,
    interactionState: InteractionState.DEFAULT,
  },
  targetElement: null,
  
  setCursor: (config) => set((state) => {
    const newConfig = { ...state.cursorConfig, ...config };
    const cursor = getContextualCursor(newConfig);
    
    // Apply cursor to target element or document
    if (state.targetElement) {
      state.targetElement.style.cursor = cursor;
    } else {
      document.documentElement.style.cursor = cursor;
    }
    
    return { cursorConfig: newConfig };
  }),
  
  resetCursor: () => set((state) => {
    const defaultConfig = {
      isSelected: false,
      isHovered: false,
      isEditable: true,
      isLocked: false,
      elementType: ElementType.NODE,
      activeTool: undefined,
      interactionState: InteractionState.DEFAULT,
    };
    
    // Reset cursor on target element or document
    if (state.targetElement) {
      state.targetElement.style.cursor = '';
    } else {
      document.documentElement.style.cursor = '';
    }
    
    return { cursorConfig: defaultConfig };
  }),
  
  setTarget: (element) => set({ targetElement: element }),
  
  // Helper methods
  setTool: (tool) => get().setCursor({ activeTool: tool }),
  
  setInteraction: (state) => get().setCursor({ interactionState: state }),
  
  setHover: (isHovered, elementType) => get().setCursor({
    isHovered,
    elementType: elementType || get().cursorConfig.elementType
  }),
  
  setSelected: (isSelected, options) => get().setCursor({
    isSelected,
    elementType: options?.elementType || get().cursorConfig.elementType,
    isEditable: options?.isEditable !== undefined ? options.isEditable : get().cursorConfig.isEditable
  }),
  
  setLocked: (isLocked) => get().setCursor({ isLocked }),
  
  // Computed properties
  get currentCursor() {
    return getContextualCursor(get().cursorConfig);
  }
}));