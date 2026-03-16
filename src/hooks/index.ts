// src/hooks/index.ts
// Hooks exports - Enterprise Level

// Export available hooks
export { useSnap } from './useSnap';
export { useAIAssistant } from './useAIAssistant';
export { useAIDesign } from './useAIDesign';
export { useAIToolpath } from './useAIToolpath';

// Library hooks
export { useLibrary } from './useLibrary';
export { useLocalLibrary } from './useLocalLibrary';

// CAD hooks  
export { useCADComponent } from './useCADComponent';
export { useCADShortcuts } from './useCADShortcuts';
export { useDrawingTools } from './useDrawingTools';

// UI hooks
export { useCursor } from './useCursor';
export { useClickOutside } from './useClickOutside';
export { useHotkeys } from './useHotkeys';
export { useDebounce, useThrottle } from './useDebounce';
export { useLocalStorage } from './useLocalStorage';
export { useMediaQuery } from './useMediaQuery';
export { useUndoRedo } from './useUndoRedo';

// Legacy aliases
export { default as useSnapService } from './useSnap';
