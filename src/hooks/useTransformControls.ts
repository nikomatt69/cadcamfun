// src/hooks/useTransformControls.ts
import { useCallback, useEffect, useMemo } from "react";
import { useTransformControlsStore, TransformMode, TransformAxis, transformControlsUtils } from "../store/transformControlsStore";
import { useSelectionStore } from "../store/selectorStore";
import { useCADStore } from "../store/cadStore";
import { useCursorStore } from "../store/cursorStore";

export interface UseTransformControlsOptions {
  autoUpdateHandles?: boolean;
  enableKeyboardShortcuts?: boolean;
  enableSnapping?: boolean;
  constrainToActiveLayer?: boolean;
}

export interface TransformControlsAPI {
  // State
  mode: TransformMode;
  isTransforming: boolean;
  selectedCount: number;
  canTransform: boolean;
  
  // Transform actions
  setMode: (mode: TransformMode) => void;
  startTransform: (mode: TransformMode, axis: TransformAxis) => void;
  commitTransform: () => void;
  cancelTransform: () => void;
  
  // Quick transform methods
  translateSelection: (delta: { x?: number; y?: number; z?: number }) => void;
  rotateSelection: (delta: { x?: number; y?: number; z?: number }) => void;
  scaleSelection: (delta: { x?: number; y?: number; z?: number }) => void;
  
  // Utility methods
  resetToOrigin: () => void;
  alignToGrid: () => void;
  duplicateInPlace: () => void;
  
  // Preset operations
  moveToLayer: (layerId: string) => void;
  centerOnOrigin: () => void;
  distributeEvenly: (axis: "x" | "y" | "z") => void;
  
  // Event handlers
  onMouseDown: (event: MouseEvent) => void;
  onMouseMove: (event: MouseEvent) => void;
  onMouseUp: (event: MouseEvent) => void;
  onKeyDown: (event: KeyboardEvent) => void;
  onKeyUp: (event: KeyboardEvent) => void;
  
  // Settings
  toggleGizmo: () => void;
  setSnapMode: (mode: "none" | "grid" | "vertex" | "edge" | "center" | "angle") => void;
  setConstraints: (constraints: Partial<{ 
    lockX: boolean; 
    lockY: boolean; 
    lockZ: boolean; 
    preserveAspectRatio: boolean;
    snapDistance: number;
    angleStep: number;
    minScale: number;
    maxScale: number;
  }>) => void;
}

export const useTransformControls = (options: UseTransformControlsOptions = {}): TransformControlsAPI => {
  const {
    autoUpdateHandles = true,
    enableKeyboardShortcuts = true,
    enableSnapping = true,
    constrainToActiveLayer = false
  } = options;

  // Store hooks
  const transformStore = useTransformControlsStore();
  const selectionStore = useSelectionStore();
  const cadStore = useCADStore();
  const cursorStore = useCursorStore();

  // Derived state
  const selectedCount = selectionStore.selectedElementIds.length;
  const canTransform = selectedCount > 0 && !transformStore.isTransforming;

  // Auto-update handles when selection changes
  useEffect(() => {
    if (autoUpdateHandles && selectedCount > 0) {
      transformStore.updateHandles();
    }
  }, [selectedCount, transformStore.mode, autoUpdateHandles]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!enableKeyboardShortcuts) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't trigger shortcuts if typing in input fields
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      const { ctrlKey, shiftKey, altKey } = event;

      switch (event.key.toLowerCase()) {
        case "g": // Translate mode
          if (!ctrlKey && !shiftKey) {
            event.preventDefault();
            transformStore.setMode("translate");
          }
          break;
        case "r": // Rotate mode
          if (!ctrlKey && !shiftKey) {
            event.preventDefault();
            transformStore.setMode("rotate");
          }
          break;
        case "s": // Scale mode
          if (!ctrlKey && !shiftKey) {
            event.preventDefault();
            transformStore.setMode("scale");
          }
          break;
        case "escape": // Cancel transform or reset mode
          event.preventDefault();
          if (transformStore.isTransforming && transformStore.currentSession) {
            transformStore.cancelTransform(transformStore.currentSession.id);
          } else {
            transformStore.setMode("none");
          }
          break;
        case "enter": // Commit transform
          if (transformStore.isTransforming && transformStore.currentSession) {
            event.preventDefault();
            transformStore.commitTransform(transformStore.currentSession.id);
          }
          break;
        case "x": // Constrain to X axis
          if (transformStore.mode !== "none") {
            event.preventDefault();
            transformStore.setActiveAxis("x");
          }
          break;
        case "y": // Constrain to Y axis
          if (transformStore.mode !== "none") {
            event.preventDefault();
            transformStore.setActiveAxis("y");
          }
          break;
        case "z": // Constrain to Z axis
          if (transformStore.mode !== "none") {
            event.preventDefault();
            transformStore.setActiveAxis("z");
          }
          break;
        case "shift": // Enable precise mode
          transformStore.setConstraints({ snapToGrid: true });
          break;
        case "control": // Enable multi-axis
          transformStore.setActiveAxis("xyz");
          break;
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      switch (event.key.toLowerCase()) {
        case "shift":
          if (enableSnapping) {
            transformStore.setConstraints({ snapToGrid: false });
          }
          break;
        case "control":
          transformStore.setActiveAxis("none");
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [enableKeyboardShortcuts, transformStore.mode, transformStore.isTransforming]);

  // Transform actions
  const setMode = useCallback((mode: TransformMode) => {
    if (!canTransform && mode !== "none") return;
    transformStore.setMode(mode);
  }, [canTransform, transformStore.setMode]);

  const startTransform = useCallback((mode: TransformMode, axis: TransformAxis) => {
    if (!canTransform) return;
    transformStore.startTransform(mode, axis, selectionStore.selectedElementIds);
  }, [canTransform, selectionStore.selectedElementIds]);

  const commitTransform = useCallback(() => {
    if (transformStore.currentSession) {
      transformStore.commitTransform(transformStore.currentSession.id);
    }
  }, [transformStore.currentSession]);

  const cancelTransform = useCallback(() => {
    if (transformStore.currentSession) {
      transformStore.cancelTransform(transformStore.currentSession.id);
    }
  }, [transformStore.currentSession]);

  // Quick transform methods
  const translateSelection = useCallback((delta: { x?: number; y?: number; z?: number }) => {
    if (!canTransform) return;
    
    const normalizedDelta = {
      x: delta.x || 0,
      y: delta.y || 0,
      z: delta.z || 0
    };
    
    transformStore.transformElements(selectionStore.selectedElementIds, { translate: normalizedDelta });
  }, [canTransform, selectionStore.selectedElementIds]);

  const rotateSelection = useCallback((delta: { x?: number; y?: number; z?: number }) => {
    if (!canTransform) return;
    
    const normalizedDelta = {
      x: delta.x || 0,
      y: delta.y || 0,
      z: delta.z || 0
    };
    
    transformStore.transformElements(selectionStore.selectedElementIds, { rotate: normalizedDelta });
  }, [canTransform, selectionStore.selectedElementIds]);

  const scaleSelection = useCallback((delta: { x?: number; y?: number; z?: number }) => {
    if (!canTransform) return;
    
    const normalizedDelta = {
      x: delta.x || 1,
      y: delta.y || 1,
      z: delta.z || 1
    };
    
    transformStore.transformElements(selectionStore.selectedElementIds, { scale: normalizedDelta });
  }, [canTransform, selectionStore.selectedElementIds]);

  // Utility methods
  const resetToOrigin = useCallback(() => {
    if (!canTransform) return;
    
    const bounds = transformStore.getSelectionBounds();
    if (!bounds) return;

    const deltaToOrigin = {
      x: -bounds.centerX,
      y: -bounds.centerY,
      z: -bounds.centerZ
    };
    
    translateSelection(deltaToOrigin);
  }, [canTransform, translateSelection]);

  const alignToGrid = useCallback(() => {
    if (!canTransform || !enableSnapping) return;
    
    const gridSize = transformStore.constraints.snapDistance;
    
    selectionStore.selectedElementIds.forEach(elementId => {
      const bounds = transformStore.getElementBounds(elementId);
      if (!bounds) return;

      const alignedX = Math.round(bounds.centerX / gridSize) * gridSize;
      const alignedY = Math.round(bounds.centerY / gridSize) * gridSize;
      const alignedZ = Math.round(bounds.centerZ / gridSize) * gridSize;

      const delta = {
        x: alignedX - bounds.centerX,
        y: alignedY - bounds.centerY,
        z: alignedZ - bounds.centerZ
      };

      transformStore.translateRealTime([elementId], delta);
    });
  }, [canTransform, enableSnapping, selectionStore.selectedElementIds]);

  const duplicateInPlace = useCallback(() => {
    if (!canTransform) return;
    
    // Use selection store's duplicate functionality
    selectionStore.duplicateSelection();
  }, [canTransform]);

  // Preset operations
  const moveToLayer = useCallback((layerId: string) => {
    if (!canTransform) return;
    selectionStore.moveSelectionToLayer(layerId);
  }, [canTransform]);

  const centerOnOrigin = useCallback(() => {
    resetToOrigin();
  }, [resetToOrigin]);

  const distributeEvenly = useCallback((axis: "x" | "y" | "z") => {
    if (!canTransform || selectedCount < 3) return;

    const bounds = transformStore.getSelectionBounds();
    if (!bounds) return;

    const elements = selectionStore.selectedElementIds.map(id => {
      const elementBounds = transformStore.getElementBounds(id);
      return { id, bounds: elementBounds };
    }).filter(item => item.bounds !== null);

    if (elements.length < 3) return;

    // Sort elements by the specified axis
    elements.sort((a, b) => {
      const posA = axis === "x" ? a.bounds!.centerX : axis === "y" ? a.bounds!.centerY : a.bounds!.centerZ;
      const posB = axis === "x" ? b.bounds!.centerX : axis === "y" ? b.bounds!.centerY : b.bounds!.centerZ;
      return posA - posB;
    });

    const firstPos = axis === "x" ? elements[0].bounds!.centerX : 
                    axis === "y" ? elements[0].bounds!.centerY : elements[0].bounds!.centerZ;
    const lastPos = axis === "x" ? elements[elements.length - 1].bounds!.centerX : 
                   axis === "y" ? elements[elements.length - 1].bounds!.centerY : elements[elements.length - 1].bounds!.centerZ;

    const totalDistance = lastPos - firstPos;
    const spacing = totalDistance / (elements.length - 1);

    // Apply distribution
    elements.forEach((element, index) => {
      if (index === 0 || index === elements.length - 1) return; // Don't move first and last elements

      const targetPos = firstPos + (spacing * index);
      const currentPos = axis === "x" ? element.bounds!.centerX : 
                        axis === "y" ? element.bounds!.centerY : element.bounds!.centerZ;
      
      const delta = { x: 0, y: 0, z: 0 };
      delta[axis] = targetPos - currentPos;

      transformStore.translateRealTime([element.id], delta);
    });
  }, [canTransform, selectedCount, selectionStore.selectedElementIds]);

  // Event handlers
  const onMouseDown = useCallback((event: MouseEvent) => {
    // Handle mouse down for transform operations
    if (transformStore.mode === "none" || !canTransform) return;

    const rect = (event.target as HTMLElement).getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Check if clicking on a handle
    const handle = transformStore.getHandleAtPosition(x, y);
    if (handle) {
      startTransform(handle.type, handle.axis);
    }
  }, [transformStore.mode, canTransform, startTransform]);

  const onMouseMove = useCallback((event: MouseEvent) => {
    if (!transformStore.isTransforming || !transformStore.currentSession) return;

    // Calculate mouse delta and update transform
    const deltaX = event.movementX;
    const deltaY = event.movementY;

    // Convert screen delta to world delta (simplified)
    const worldDelta = transformControlsUtils.screenToWorld(deltaX, deltaY, null);
    
    transformStore.updateTransform(transformStore.currentSession.id, worldDelta);
  }, [transformStore.isTransforming, transformStore.currentSession]);

  const onMouseUp = useCallback((event: MouseEvent) => {
    if (transformStore.isTransforming && transformStore.currentSession) {
      commitTransform();
    }
  }, [transformStore.isTransforming, commitTransform]);

  const onKeyDown = useCallback((event: KeyboardEvent) => {
    // Additional key handling can be added here
  }, []);

  const onKeyUp = useCallback((event: KeyboardEvent) => {
    // Additional key handling can be added here
  }, []);

  // Settings
  const toggleGizmo = useCallback(() => {
    transformStore.toggleGizmo();
  }, []);

  const setSnapMode = useCallback((mode: "none" | "grid" | "vertex" | "edge" | "center" | "angle") => {
    transformStore.setSnapMode(mode);
  }, []);

  const setConstraints = useCallback((constraints: Partial<{ lockX: boolean; lockY: boolean; lockZ: boolean }>) => {
    transformStore.setConstraints(constraints);
  }, []);

  // Return API
  return useMemo(() => ({
    // State
    mode: transformStore.mode,
    isTransforming: transformStore.isTransforming,
    selectedCount,
    canTransform,
    
    // Transform actions
    setMode,
    startTransform,
    commitTransform,
    cancelTransform,
    
    // Quick transform methods
    translateSelection,
    rotateSelection,
    scaleSelection,
    
    // Utility methods
    resetToOrigin,
    alignToGrid,
    duplicateInPlace,
    
    // Preset operations
    moveToLayer,
    centerOnOrigin,
    distributeEvenly,
    
    // Event handlers
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onKeyDown,
    onKeyUp,
    
    // Settings
    toggleGizmo,
    setSnapMode,
    setConstraints
  }), [
    transformStore.mode,
    transformStore.isTransforming,
    selectedCount,
    canTransform,
    setMode,
    startTransform,
    commitTransform,
    cancelTransform,
    translateSelection,
    rotateSelection,
    scaleSelection,
    resetToOrigin,
    alignToGrid,
    duplicateInPlace,
    moveToLayer,
    centerOnOrigin,
    distributeEvenly,
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onKeyDown,
    onKeyUp,
    toggleGizmo,
    setSnapMode,
    setConstraints
  ]);
};

// Export additional utility hooks
export const useTransformShortcuts = (enabled = true) => {
  const transformControls = useTransformControls({ enableKeyboardShortcuts: enabled });
  return transformControls;
};

export const useTransformGizmo = () => {
  const transformStore = useTransformControlsStore();
  
  return {
    visible: transformStore.gizmoVisible,
    handles: transformStore.handles,
    settings: transformStore.gizmoSettings,
    updateSettings: transformStore.updateGizmoSettings,
    toggle: transformStore.toggleGizmo
  };
};

export const useTransformConstraints = () => {
  const transformStore = useTransformControlsStore();
  
  return {
    constraints: transformStore.constraints,
    snapMode: transformStore.snapMode,
    setConstraints: transformStore.setConstraints,
    setSnapMode: transformStore.setSnapMode,
    applySnapping: transformStore.applySnapping
  };
};

export const useTransformSession = () => {
  const transformStore = useTransformControlsStore();
  
  return {
    session: transformStore.currentSession,
    isActive: transformStore.isTransforming,
    history: transformStore.transformHistory,
    start: transformStore.startTransform,
    update: transformStore.updateTransform,
    commit: transformStore.commitTransform,
    cancel: transformStore.cancelTransform
  };
};
