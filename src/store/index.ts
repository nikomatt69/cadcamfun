// src/store/index.ts
// Central store exports - Backward compatible with enterprise enhancements

// ============================================
// Core Stores
// ============================================
export { useElementsStore } from './elementsStore';
export { useLayerStore } from './layerStore';
export { useCADStore } from './cadStore';
export { useSelectionStore } from './selectorStore';
export { useNotificationStore } from './notificationStore';
export { useLibraryStore } from './libraryStore';
export { useToolStore } from './toolStore';
export { useChatStore } from './chatStore';
export { useAIAssistantStore } from './aiAssistantStore';
export { useCamStore } from './camStore';
export { useCursorStore } from './cursorStore';
export { useContextStore } from './contextStore';

// ============================================
// Local Stores
// ============================================
export { useLocalToolsLibraryStore } from './localToolsLibraryStore';
export { useLocalComponentsLibraryStore } from './localComponentsLibraryStore';
export { useLocalMaterialsLibraryStore } from './localMaterialsLibraryStore';
export { useLocalCamLibraryStore } from './localCamLibraryStore';
export { useLocalCadLibraryStore } from './localCadLibraryStore';
export { useUserProfileStore } from './userProfileStore';

// ============================================
// Store Utilities
// ============================================
export { createStoreHooks } from './storeUtils';

// ============================================
// Types (re-export for convenience)
// ============================================
export type { Element, Point, AIDesignSuggestion } from './elementsStore';
export type { Layer, LayerSettings } from './layerStore';
export type { ViewMode, ToolType, WorkpieceConfig } from './cadStore';

// ============================================
// Enterprise Typed Hooks
// ============================================
export * from './hooks';

// ============================================
// Direct Store Access (for advanced use)
// ============================================

/**
 * Get elements store state directly (for non-React contexts)
 */
export const getElementsState = () => {
  const store = useElementsStore.getState();
  return {
    elements: store.elements,
    selectedElement: store.selectedElement,
    mousePosition: store.mousePosition,
  };
};

/**
 * Get CAD store state directly
 */
export const getCADState = () => {
  const store = useCADStore.getState();
  return {
    viewMode: store.viewMode,
    activeTool: store.activeTool,
    gridVisible: store.gridVisible,
    axisVisible: store.axisVisible,
    workpiece: store.workpiece,
  };
};

/**
 * Get layer store state directly
 */
export const getLayerState = () => {
  const store = useLayerStore.getState();
  return {
    layers: store.layers,
    activeLayerId: store.activeLayerId,
  };
};

/**
 * Get selection store state directly
 */
export const getSelectionState = () => {
  const store = useSelectionStore.getState();
  return {
    selectedElementIds: store.selectedElementIds,
  };
};
