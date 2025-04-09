// src/contexts/CursorContext.tsx
import React, { createContext, useContext, ReactNode } from 'react';
import { 
  CursorConfig, 
  ElementType, 
  InteractionState, 
  ToolCursorType 
} from '../lib/utils/cursorUtils';
import { useCursor } from '../hooks/useCursor';

interface CursorContextType {
  setCursor: (config: Partial<CursorConfig>) => void;
  resetCursor: () => void;
  setTarget: (element: HTMLElement | null) => void;
  cursorConfig: CursorConfig;
  // Helper methods
  setTool: (tool: ToolCursorType | undefined) => void;
  setInteraction: (state: InteractionState) => void;
  setHover: (isHovered: boolean, elementType?: ElementType) => void;
  setSelected: (isSelected: boolean, options?: { elementType?: ElementType, isEditable?: boolean }) => void;
  setLocked: (isLocked: boolean) => void;
}

const CursorContext = createContext<CursorContextType | undefined>(undefined);

export const CursorProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { setCursor, resetCursor, setTarget, cursorConfig } = useCursor();
  
  // Helper methods for common operations
  const setTool = (tool: ToolCursorType | undefined) => {
    setCursor({ activeTool: tool });
  };
  
  const setInteraction = (state: InteractionState) => {
    setCursor({ interactionState: state });
  };
  
  const setHover = (isHovered: boolean, elementType?: ElementType) => {
    setCursor({ 
      isHovered,
      elementType: elementType || cursorConfig.elementType
    });
  };
  
  const setSelected = (
    isSelected: boolean, 
    options?: { elementType?: ElementType, isEditable?: boolean }
  ) => {
    setCursor({
      isSelected,
      elementType: options?.elementType || cursorConfig.elementType,
      isEditable: options?.isEditable !== undefined ? options.isEditable : cursorConfig.isEditable
    });
  };
  
  const setLocked = (isLocked: boolean) => {
    setCursor({ isLocked });
  };
  
  const contextValue: CursorContextType = {
    setCursor,
    resetCursor,
    setTarget,
    cursorConfig,
    setTool,
    setInteraction,
    setHover,
    setSelected,
    setLocked
  };
  
  return (
    <CursorContext.Provider value={contextValue}>
      {children}
    </CursorContext.Provider>
  );
};

export const useCursorContext = () => {
  const context = useContext(CursorContext);
  if (!context) {
    throw new Error('useCursorContext must be used within a CursorProvider');
  }
  return context;
};