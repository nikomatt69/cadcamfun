/**
 * CAD State Manager - Consolidates multiple useState into optimized state management
 * Eliminates unnecessary re-renders and batches state updates
 */
import { useReducer, useCallback, useRef, useMemo } from "react";

// Consolidated state interface
interface CADCanvasState {
  // UI State
  ui: {
    isFullscreen: boolean;
    canvasDimensions: { width: number; height: number };
    showKeyboardShortcuts: boolean;
    showPerformanceStats: boolean;
    showShortcutsDialog: boolean;
    showElementsList: boolean;
    showComponentModal: boolean;
    showElementInfo: boolean;
    showSelectionModal: boolean;
    activeRightPanel: "proprieties" | "trasform" | "constraints";
    isPanelOpen: boolean;
  };

  // Interaction State
  interaction: {
    isPlacingComponent: boolean;
    isDragging: boolean;
    isDraggingComponent: boolean;
    isModifying: boolean;
    isSelectionMode: boolean;
    isMultiSelectMode: boolean;
    snapEnabled: boolean;
    transformMode: "translate" | "rotate" | "scale";
  };

  // Element State
  elements: {
    hoveredElementId: string | null;
    hoveredControlPoint: { elementId: string; pointIndex: number } | null;
    activeDragPoint: { elementId: string; pointIndex: number } | null;
    previewPosition: { x: number; y: number; z: number };
    dropPosition: { x: number; y: number; z: number };
    dropScreenPosition: { x: number; y: number } | undefined;
    selectedComponent: string | null;
    draggedComponent: any;
  };

  // Performance State
  performance: {
    isWasmEnabled: boolean;
    isWasmReady: boolean;
    showPerformanceSettings: boolean;
    wasmPerformanceStats: {
      meshOptimizations: number;
      csgOperations: number;
      frustumCulls: number;
      snapCalculations: number;
      totalTimeMS: number;
    };
    performanceSettings: {
      enableWasmCSG: boolean;
      enableWasmMeshOptimization: boolean;
      enableWasmFrustumCulling: boolean;
      enableWasmSnapCalculation: boolean;
      meshReductionFactor: number;
      lodThreshold: number;
      maxVisibleObjects: number;
    };
  };

  // Debug State
  debug: {
    logMessages: string[];
  };
}

// Action types for state updates
type CADCanvasAction =
  | { type: "SET_UI"; payload: Partial<CADCanvasState["ui"]> }
  | { type: "SET_INTERACTION"; payload: Partial<CADCanvasState["interaction"]> }
  | { type: "SET_ELEMENTS"; payload: Partial<CADCanvasState["elements"]> }
  | { type: "SET_PERFORMANCE"; payload: Partial<CADCanvasState["performance"]> }
  | { type: "SET_DEBUG"; payload: Partial<CADCanvasState["debug"]> }
  | { type: "BATCH_UPDATE"; payload: Partial<CADCanvasState> }
  | { type: "RESET_STATE" };

// Initial state
const initialState: CADCanvasState = {
  ui: {
    isFullscreen: false,
    canvasDimensions: { width: 0, height: 0 },
    showKeyboardShortcuts: false,
    showPerformanceStats: false,
    showShortcutsDialog: false,
    showElementsList: false,
    showComponentModal: false,
    showElementInfo: false,
    showSelectionModal: false,
    activeRightPanel: "proprieties",
    isPanelOpen: false
  },
  interaction: {
    isPlacingComponent: false,
    isDragging: false,
    isDraggingComponent: false,
    isModifying: false,
    isSelectionMode: false,
    isMultiSelectMode: false,
    snapEnabled: true,
    transformMode: "translate"
  },
  elements: {
    hoveredElementId: null,
    hoveredControlPoint: null,
    activeDragPoint: null,
    previewPosition: { x: 0, y: 0, z: 0 },
    dropPosition: { x: 0, y: 0, z: 0 },
    dropScreenPosition: undefined,
    selectedComponent: null,
    draggedComponent: null
  },
  performance: {
    isWasmEnabled: false,
    isWasmReady: false,
    showPerformanceSettings: false,
    wasmPerformanceStats: {
      meshOptimizations: 0,
      csgOperations: 0,
      frustumCulls: 0,
      snapCalculations: 0,
      totalTimeMS: 0
    },
    performanceSettings: {
      enableWasmCSG: true,
      enableWasmMeshOptimization: true,
      enableWasmFrustumCulling: true,
      enableWasmSnapCalculation: true,
      meshReductionFactor: 0.1,
      lodThreshold: 100,
      maxVisibleObjects: 1000
    }
  },
  debug: {
    logMessages: []
  }
};

// Optimized reducer with batching
function cadCanvasReducer(state: CADCanvasState, action: CADCanvasAction): CADCanvasState {
  switch (action.type) {
    case "SET_UI":
      return {
        ...state,
        ui: { ...state.ui, ...action.payload }
      };

    case "SET_INTERACTION":
      return {
        ...state,
        interaction: { ...state.interaction, ...action.payload }
      };

    case "SET_ELEMENTS":
      return {
        ...state,
        elements: { ...state.elements, ...action.payload }
      };

    case "SET_PERFORMANCE":
      return {
        ...state,
        performance: {
          ...state.performance,
          ...action.payload,
          wasmPerformanceStats: {
            ...state.performance.wasmPerformanceStats,
            ...(action.payload.wasmPerformanceStats || {})
          },
          performanceSettings: {
            ...state.performance.performanceSettings,
            ...(action.payload.performanceSettings || {})
          }
        }
      };

    case "SET_DEBUG":
      return {
        ...state,
        debug: { ...state.debug, ...action.payload }
      };

    case "BATCH_UPDATE":
      return {
        ...state,
        ui: { ...state.ui, ...(action.payload.ui || {}) },
        interaction: { ...state.interaction, ...(action.payload.interaction || {}) },
        elements: { ...state.elements, ...(action.payload.elements || {}) },
        performance: {
          ...state.performance,
          ...(action.payload.performance || {}),
          wasmPerformanceStats: {
            ...state.performance.wasmPerformanceStats,
            ...(action.payload.performance?.wasmPerformanceStats || {})
          },
          performanceSettings: {
            ...state.performance.performanceSettings,
            ...(action.payload.performance?.performanceSettings || {})
          }
        },
        debug: { ...state.debug, ...(action.payload.debug || {}) }
      };

    case "RESET_STATE":
      return initialState;

    default:
      return state;
  }
}

// Custom hook for consolidated CAD state management
export function useCADCanvasState() {
  const [state, dispatch] = useReducer(cadCanvasReducer, initialState);

  // Batch update queue for performance
  const updateQueueRef = useRef<Partial<CADCanvasState>>({});
  const flushTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Optimized update functions
  const updateUI = useCallback((updates: Partial<CADCanvasState["ui"]>) => {
    dispatch({ type: "SET_UI", payload: updates });
  }, []);

  const updateInteraction = useCallback((updates: Partial<CADCanvasState["interaction"]>) => {
    dispatch({ type: "SET_INTERACTION", payload: updates });
  }, []);

  const updateElements = useCallback((updates: Partial<CADCanvasState["elements"]>) => {
    dispatch({ type: "SET_ELEMENTS", payload: updates });
  }, []);

  const updatePerformance = useCallback((updates: Partial<CADCanvasState["performance"]>) => {
    dispatch({ type: "SET_PERFORMANCE", payload: updates });
  }, []);

  const updateDebug = useCallback((updates: Partial<CADCanvasState["debug"]>) => {
    dispatch({ type: "SET_DEBUG", payload: updates });
  }, []);

  // Batched update for multiple state changes
  const batchUpdate = useCallback((updates: Partial<CADCanvasState>) => {
    updateQueueRef.current = { ...updateQueueRef.current, ...updates };

    // Clear existing timeout
    if (flushTimeoutRef.current) {
      clearTimeout(flushTimeoutRef.current);
    }

    // Flush updates after a short delay to batch multiple rapid updates
    flushTimeoutRef.current = setTimeout(() => {
      if (Object.keys(updateQueueRef.current).length > 0) {
        dispatch({ type: "BATCH_UPDATE", payload: updateQueueRef.current });
        updateQueueRef.current = {};
      }
    }, 16); // ~60fps batching
  }, []);

  // Immediate update for critical state changes
  const immediateUpdate = useCallback((updates: Partial<CADCanvasState>) => {
    // Clear any pending batched updates
    if (flushTimeoutRef.current) {
      clearTimeout(flushTimeoutRef.current);
      flushTimeoutRef.current = null;
    }

    dispatch({ type: "BATCH_UPDATE", payload: updates });
  }, []);

  // Reset state
  const resetState = useCallback(() => {
    dispatch({ type: "RESET_STATE" });
  }, []);

  // Memoized selectors for performance
  const selectors = useMemo(
    () => ({
      isInteracting:
        state.interaction.isDragging || state.interaction.isDraggingComponent || state.interaction.isPlacingComponent,

      isUIBusy: state.ui.showKeyboardShortcuts || state.ui.showComponentModal || state.ui.showElementsList,

      hasActiveElement: state.elements.hoveredElementId !== null || state.elements.activeDragPoint !== null,

      isPerformanceOptimized:
        state.performance.isWasmEnabled && state.performance.performanceSettings.enableWasmMeshOptimization
    }),
    [
      state.interaction.isDragging,
      state.interaction.isDraggingComponent,
      state.interaction.isPlacingComponent,
      state.ui.showKeyboardShortcuts,
      state.ui.showComponentModal,
      state.ui.showElementsList,
      state.elements.hoveredElementId,
      state.elements.activeDragPoint,
      state.performance.isWasmEnabled,
      state.performance.performanceSettings.enableWasmMeshOptimization
    ]
  );

  return {
    state,
    updateUI,
    updateInteraction,
    updateElements,
    updatePerformance,
    updateDebug,
    batchUpdate,
    immediateUpdate,
    resetState,
    selectors
  };
}

// Utility functions for common state operations
export const cadStateUtils = {
  // Toggle functions for common UI states
  toggleFullscreen: (currentState: boolean) => ({ isFullscreen: !currentState }),

  toggleDialog: (dialogName: keyof CADCanvasState["ui"], currentState: boolean) => ({ [dialogName]: !currentState }),

  // Position update utilities
  updateMousePosition: (x: number, y: number, z: number = 0) => ({
    previewPosition: { x, y, z }
  }),

  updateDropPosition: (x: number, y: number, z: number = 0, screenX?: number, screenY?: number) => ({
    dropPosition: { x, y, z },
    dropScreenPosition: screenX !== undefined && screenY !== undefined ? { x: screenX, y: screenY } : undefined
  }),

  // Performance stats utilities
  incrementWasmStat: (
    currentStats: CADCanvasState["performance"]["wasmPerformanceStats"],
    stat: keyof CADCanvasState["performance"]["wasmPerformanceStats"]
  ) => {
    const currentValue = currentStats[stat];
    const newValue = typeof currentValue === "number" ? currentValue + 1 : currentValue;

    return {
      wasmPerformanceStats: {
        ...currentStats,
        [stat]: newValue
      }
    };
  },

  // Batch interaction updates
  setInteractionMode: (isPlacing: boolean = false, isDragging: boolean = false, isModifying: boolean = false) => ({
    isPlacingComponent: isPlacing,
    isDragging,
    isModifying
  }),

  // Element state utilities
  setHoveredElement: (elementId: string | null) => ({
    hoveredElementId: elementId
  }),

  setControlPoint: (elementId: string | null, pointIndex: number | null) => ({
    hoveredControlPoint: elementId && pointIndex !== null ? { elementId, pointIndex } : null
  }),

  setActiveDragPoint: (elementId: string | null, pointIndex: number | null) => ({
    activeDragPoint: elementId && pointIndex !== null ? { elementId, pointIndex } : null
  }),

  // Canvas dimension update
  updateCanvasDimensions: (width: number, height: number) => ({
    canvasDimensions: { width, height }
  }),

  // Performance settings update
  updatePerformanceSettings: (settings: Partial<CADCanvasState["performance"]["performanceSettings"]>) => ({
    performanceSettings: settings
  }),

  // Debug logging
  addLogMessage: (currentMessages: string[], message: string, maxMessages: number = 100) => {
    const newMessages = [...currentMessages, `[${new Date().toISOString()}] ${message}`];
    return {
      logMessages: newMessages.slice(-maxMessages)
    };
  },

  clearLogMessages: () => ({
    logMessages: []
  })
};

// Type exports for external use
export type { CADCanvasState, CADCanvasAction };
