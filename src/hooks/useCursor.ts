// src/hooks/useCursor.ts
import { useCallback, useEffect, useState } from 'react';
import { 
  CursorConfig, 
  getContextualCursor, 
  ElementType, 
  InteractionState 
} from '../lib/utils/cursorUtils';

export function useCursor() {
  const [cursorConfig, setCursorConfig] = useState<CursorConfig>({
    isSelected: false,
    isHovered: false,
    isEditable: true,
    isLocked: false,
    elementType: ElementType.NODE,
    activeTool: undefined,
    interactionState: InteractionState.DEFAULT,
  });
  
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null);
  
  const setCursor = useCallback((config: Partial<CursorConfig>) => {
    setCursorConfig(prev => ({ ...prev, ...config }));
  }, []);
  
  const resetCursor = useCallback(() => {
    setCursorConfig({
      isSelected: false,
      isHovered: false,
      isEditable: true,
      isLocked: false,
      elementType: ElementType.NODE,
      activeTool: undefined,
      interactionState: InteractionState.DEFAULT,
    });
  }, []);
  
  const setTarget = useCallback((element: HTMLElement | null) => {
    setTargetElement(element);
  }, []);
  
  // Apply cursor style to document root or specific element
  useEffect(() => {
    const cursor = getContextualCursor(cursorConfig);
    
    if (targetElement) {
      targetElement.style.cursor = cursor;
    } else {
      document.documentElement.style.cursor = cursor;
    }
    
    return () => {
      if (targetElement) {
        targetElement.style.cursor = '';
      } else {
        document.documentElement.style.cursor = '';
      }
    };
  }, [cursorConfig, targetElement]);
  
  return { 
    setCursor, 
    resetCursor, 
    setTarget,
    cursorConfig 
  };
}