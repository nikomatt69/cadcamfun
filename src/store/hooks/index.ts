// src/store/hooks/index.ts
// Typed store hooks for better TypeScript support and performance

import { useState, useCallback, useMemo } from 'react';
import { create } from 'zustand';

// Import all stores
import { useElementsStore, type Element, type Point } from '../elementsStore';
import { useLayerStore, type Layer } from '../layerStore';
import { useCADStore, type ViewMode, type ToolType } from '../cadStore';
import { useSelectionStore } from '../selectorStore';
import { useNotificationStore } from '../notificationStore';
import { useLibraryStore } from '../libraryStore';
import { useToolStore } from '../toolStore';
import { useChatStore } from '../chatStore';
import { useAIAssistantStore } from '../aiAssistantStore';

// ============================================
// Elements Store Hooks
// ============================================

/** Get all elements */
export const useElements = () => useElementsStore((state) => state.elements);

/** Get selected element */
export const useSelectedElement = () => useElementsStore((state) => state.selectedElement);

/** Get element by ID */
export const useElementById = (id: string) => 
  useElementsStore((state) => state.elements.find((el) => el.id === id));

/** Get elements by layer */
export const useElementsByLayer = (layerId: string) =>
  useElementsStore((state) => 
    state.elements.filter((el) => el.layerId === layerId)
  );

/** Get mouse position */
export const useMousePosition = () => useElementsStore((state) => state.mousePosition);

/** Get clipboard */
export const useClipboard = () => useElementsStore((state) => state.clipboard);

/** Element actions */
export const useElementActions = () => {
  const addElement = useElementsStore((state) => state.addElement);
  const updateElement = useElementsStore((state) => state.updateElement);
  const deleteElement = useElementsStore((state) => state.deleteElement);
  const selectElement = useElementsStore((state) => state.selectElement);
  
  return { addElement, updateElement, deleteElement, selectElement };
};

// ============================================
// Layer Store Hooks
// ============================================

/** Get all layers */
export const useLayers = () => useLayerStore((state) => state.layers);

/** Get active layer */
export const useActiveLayer = () => {
  const layers = useLayerStore((state) => state.layers);
  const activeLayerId = useLayerStore((state) => state.activeLayerId);
  return layers.find((l) => l.id === activeLayerId) || null;
};

/** Get layer by ID */
export const useLayerById = (id: string) =>
  useLayerStore((state) => state.layers.find((l) => l.id === id));

// ============================================
// CAD Store Hooks
// ============================================

/** Get view mode */
export const useViewMode = () => useCADStore((state) => state.viewMode);

/** Get active tool */
export const useActiveTool = () => useCADStore((state) => state.activeTool);

/** Get workpiece */
export const useWorkpiece = () => useCADStore((state) => state.workpiece);

/** Get grid visibility */
export const useGridVisible = () => useCADStore((state) => state.gridVisible);

/** Get axis visibility */
export const useAxisVisible = () => useCADStore((state) => state.axisVisible);

/** Get origin offset */
export const useOriginOffset = () => useCADStore((state) => state.originOffset);

// ============================================
// Selection Store Hooks
// ============================================

/** Get selected element IDs */
export const useSelectedIds = () => useSelectionStore((state) => state.selectedElementIds);

/** Check if element is selected */
export const useIsSelected = (id: string) =>
  useSelectionStore((state) => state.selectedElementIds.includes(id));

/** Get selection count */
export const useSelectionCount = () =>
  useSelectionStore((state) => state.selectedElementIds.length);

// ============================================
// Notification Store Hooks
// ============================================

/** Get notifications */
export const useNotifications = () => 
  useNotificationStore((state) => state.notifications);

/** Get unread count */
export const useUnreadCount = () => 
  useNotificationStore((state) => state.unreadCount);

// ============================================
// Library Store Hooks
// ============================================

/** Get library items */
export const useLibraryItems = (category?: string) =>
  useLibraryStore((state) => 
    category 
      ? state.items.filter((item) => item.category === category)
      : state.items
  );

/** Get library loading state */
export const useLibraryLoading = () => 
  useLibraryStore((state) => state.loading);

// ============================================
// Tool Store Hooks
// ============================================

/** Get tools */
export const useTools = () => useToolStore((state) => state.tools);

/** Get tool by ID */
export const useToolById = (id: string) =>
  useToolStore((state) => state.tools.find((t) => t.id === id));

// ============================================
// Chat Store Hooks
// ============================================

/** Get conversations */
export const useConversations = () => useChatStore((state) => state.conversations);

/** Get active conversation */
export const useActiveConversation = () => 
  useChatStore((state) => state.activeConversationId);

// ============================================
// AI Assistant Store Hooks
// ============================================

/** Get AI state */
export const useAIState = () => useAIAssistantStore((state) => state);

/** Get AI processing state */
export const useAIProcessing = () => 
  useAIAssistantStore((state) => state.isProcessing);

// ============================================
// Combined Hooks
// ============================================

/** Hook for CAD canvas - optimized for performance */
export const useCADCanvas = () => {
  const viewMode = useCADStore((state) => state.viewMode);
  const gridVisible = useCADStore((state) => state.gridVisible);
  const axisVisible = useCADStore((state) => state.axisVisible);
  const originOffset = useCADStore((state) => state.originOffset);
  const elements = useElementsStore((state) => state.elements);
  const selectedElement = useElementsStore((state) => state.selectedElement);
  const mousePosition = useElementsStore((state) => state.mousePosition);
  const layers = useLayerStore((state) => state.layers);
  const selectedElementIds = useSelectionStore((state) => state.selectedElementIds);
  
  return {
    viewMode,
    gridVisible,
    axisVisible,
    originOffset,
    elements,
    selectedElement,
    mousePosition,
    layers,
    selectedElementIds,
  };
};

/** Hook for element list panel - optimized */
export const useElementList = () => {
  const elements = useElementsStore((state) => state.elements);
  const layers = useLayerStore((state) => state.layers);
  const selectedElementIds = useSelectionStore((state) => state.selectedElementIds);
  
  const elementsByLayer = useMemo(() => {
    const grouped: Record<string, Element[]> = {};
    layers.forEach((layer) => {
      grouped[layer.id] = elements.filter((el) => el.layerId === layer.id);
    });
    return grouped;
  }, [elements, layers]);
  
  return { elements, layers, selectedElementIds, elementsByLayer };
};

// Re-export store types
export type { Element, Point, Layer, ViewMode, ToolType };
