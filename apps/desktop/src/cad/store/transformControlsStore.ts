// src/store/transformControlsStore.ts
import { create } from "../../state/zustand.ts";
import { useElementsStore, type Element } from "./elementsStore.ts";
import { useSelectionStore, type SelectionBounds } from "./selectorStore.ts";
import { useCADStore } from "./cadStore.ts";
import { useCursorStore } from "./cursorStore.ts";
import { useAssemblyStore } from "./assemblyStore.ts";
import { useLayerStore } from "./layerStore.ts";

export type TransformMode = "translate" | "rotate" | "scale" | "none";
export type TransformSpace = "local" | "world";
export type TransformAxis = "x" | "y" | "z" | "xy" | "xz" | "yz" | "xyz" | "none";
export type SnapMode = "none" | "grid" | "vertex" | "edge" | "center" | "angle";

export interface TransformHandle {
  id: string;
  type: TransformMode;
  axis: TransformAxis;
  position: { x: number; y: number; z: number };
  isActive: boolean;
  isHovered: boolean;
  color: string;
  size: number;
}

export interface TransformConstraints {
  lockX: boolean;
  lockY: boolean;
  lockZ: boolean;
  snapToGrid: boolean;
  snapToAngle: boolean;
  snapDistance: number;
  angleStep: number;
  minScale: number;
  maxScale: number;
  preserveAspectRatio: boolean;
}

export interface TransformSession {
  id: string;
  mode: TransformMode;
  axis: TransformAxis;
  startTime: number;
  initialValues: Record<string, any>;
  currentValues: Record<string, any>;
  isActive: boolean;
  elementIds: string[];
  pivot: { x: number; y: number; z: number };
}

export interface GizmoSettings {
  size: number;
  opacity: number;
  showLabels: boolean;
  showGrid: boolean;
  autoHide: boolean;
  highlightOnHover: boolean;
  colors: {
    x: string;
    y: string;
    z: string;
    selection: string;
    hover: string;
    disabled: string;
  };
}

interface TransformControlsState {
  // Core state
  mode: TransformMode;
  space: TransformSpace;
  activeAxis: TransformAxis;
  isTransforming: boolean;
  
  // Transform session
  currentSession: TransformSession | null;
  
  // Handles and gizmo
  handles: TransformHandle[];
  gizmoVisible: boolean;
  gizmoSettings: GizmoSettings;
  
  // Constraints and snapping
  constraints: TransformConstraints;
  snapMode: SnapMode;
  
  // Real-time values
  transformDelta: { x: number; y: number; z: number };
  rotationDelta: { x: number; y: number; z: number };
  scaleDelta: { x: number; y: number; z: number };
  
  // History and performance
  transformHistory: TransformSession[];
  maxHistorySize: number;
  batchTransforms: boolean;
  
  // Actions - Core transform control
  setMode: (mode: TransformMode) => void;
  setSpace: (space: TransformSpace) => void;
  setActiveAxis: (axis: TransformAxis) => void;
  toggleGizmo: (visible?: boolean) => void;
  
  // Transform session management
  startTransform: (mode: TransformMode, axis: TransformAxis, elementIds?: string[]) => string;
  updateTransform: (sessionId: string, delta: { x?: number; y?: number; z?: number }) => void;
  commitTransform: (sessionId: string) => void;
  cancelTransform: (sessionId: string) => void;
  
  // Advanced transform operations
  transformElements: (
    elementIds: string[],
    transform: {
      translate?: { x: number; y: number; z: number };
      rotate?: { x: number; y: number; z: number };
      scale?: { x: number; y: number; z: number };
    },
    options?: {
      space?: TransformSpace;
      pivot?: { x: number; y: number; z: number };
      constraints?: Partial<TransformConstraints>;
    }
  ) => void;
  
  // Real-time transform methods
  translateRealTime: (elementIds: string[], delta: { x: number; y: number; z: number }) => void;
  rotateRealTime: (elementIds: string[], delta: { x: number; y: number; z: number }, pivot?: { x: number; y: number; z: number }) => void;
  scaleRealTime: (elementIds: string[], delta: { x: number; y: number; z: number }, pivot?: { x: number; y: number; z: number }) => void;
  
  // Handle management
  updateHandles: () => void;
  getHandleAtPosition: (x: number, y: number) => TransformHandle | null;
  setHandleActive: (handleId: string, active: boolean) => void;
  setHandleHovered: (handleId: string, hovered: boolean) => void;
  
  // Snapping and constraints
  setConstraints: (constraints: Partial<TransformConstraints>) => void;
  setSnapMode: (mode: SnapMode) => void;
  applySnapping: (value: number, axis: "x" | "y" | "z") => number;
  checkConstraints: (elementId: string, transform: any) => boolean;
  
  // Selection integration
  transformSelection: (transform: any) => void;
  getSelectionBounds: () => SelectionBounds | null;
  getSelectionCenter: () => { x: number; y: number; z: number } | null;
  
  // Assembly integration
  updateAssemblyJoints: (elementIds: string[]) => void;
  validateAssemblyConstraints: (elementIds: string[]) => boolean;
  
  // Utility methods
  calculatePivotPoint: (elementIds: string[], mode?: "center" | "individual" | "custom") => { x: number; y: number; z: number };
  getElementBounds: (elementId: string) => SelectionBounds | null;
  isElementLocked: (elementId: string) => boolean;
  resetTransform: () => void;
  
  // Performance optimization
  setBatchMode: (enabled: boolean) => void;
  flushBatchedTransforms: () => void;
  
  // Settings and configuration
  updateGizmoSettings: (settings: Partial<GizmoSettings>) => void;
  loadPreset: (presetName: string) => void;
  savePreset: (presetName: string) => void;
}

// Default configurations
const defaultGizmoSettings: GizmoSettings = {
  size: 60,
  opacity: 0.8,
  showLabels: true,
  showGrid: false,
  autoHide: false,
  highlightOnHover: true,
  colors: {
    x: "#ff4444",
    y: "#44ff44",
    z: "#4444ff",
    selection: "#ffaa00",
    hover: "#ffffff",
    disabled: "#888888"
  }
};

const defaultConstraints: TransformConstraints = {
  lockX: false,
  lockY: false,
  lockZ: false,
  snapToGrid: false,
  snapToAngle: false,
  snapDistance: 10,
  angleStep: 15,
  minScale: 0.1,
  maxScale: 10,
  preserveAspectRatio: false
};

export const useTransformControlsStore = create<TransformControlsState>((set, get) => ({
  // Initial state
  mode: "none",
  space: "world",
  activeAxis: "none",
  isTransforming: false,
  
  currentSession: null,
  handles: [],
  gizmoVisible: true,
  gizmoSettings: defaultGizmoSettings,
  
  constraints: defaultConstraints,
  snapMode: "none",
  
  transformDelta: { x: 0, y: 0, z: 0 },
  rotationDelta: { x: 0, y: 0, z: 0 },
  scaleDelta: { x: 1, y: 1, z: 1 },
  
  transformHistory: [],
  maxHistorySize: 50,
  batchTransforms: false,

  // Core transform control actions
  setMode: (mode) => {
    set({ mode });
    get().updateHandles();
    
    // Update cursor based on mode
    const cursorStore = useCursorStore.getState();
    if (mode === "none") {
      cursorStore.resetCursor();
    } else {
      cursorStore.setTool(mode as any);
    }
  },

  setSpace: (space) => {
    set({ space });
    get().updateHandles();
  },

  setActiveAxis: (axis) => {
    set({ activeAxis: axis });
    
    // Update handles to reflect active axis
    set(state => ({
      handles: state.handles.map(handle => ({
        ...handle,
        isActive: handle.axis === axis
      }))
    }));
  },

  toggleGizmo: (visible) => {
    set(state => ({
      gizmoVisible: visible !== undefined ? visible : !state.gizmoVisible
    }));
  },

  // Transform session management
  startTransform: (mode, axis, elementIds) => {
    const sessionId = `transform_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const selectionStore = useSelectionStore.getState();
    const elementsToTransform = elementIds || selectionStore.selectedElementIds;
    
    if (elementsToTransform.length === 0) return sessionId;

    // Get initial values for all elements
    const elementsStore = useElementsStore.getState();
    const initialValues: Record<string, any> = {};
    
    elementsToTransform.forEach(id => {
      const element = elementsStore.elements.find(el => el.id === id);
      if (element) {
        initialValues[id] = {
          x: element.x || 0,
          y: element.y || 0,
          z: element.z || 0,
          angleX: element.angleX || 0,
          angleY: element.angleY || 0,
          angleZ: element.angleZ || 0,
          width: element.width || 0,
          height: element.height || 0,
          depth: element.depth || 0,
          radius: element.radius || 0
        };
      }
    });

    // Calculate pivot point
    const pivot = get().calculatePivotPoint(elementsToTransform);

    const session: TransformSession = {
      id: sessionId,
      mode,
      axis,
      startTime: Date.now(),
      initialValues,
      currentValues: { ...initialValues },
      isActive: true,
      elementIds: elementsToTransform,
      pivot
    };

    set({
      currentSession: session,
      isTransforming: true,
      mode,
      activeAxis: axis
    });

    // Save to history
    set(state => ({
      transformHistory: [...state.transformHistory.slice(-state.maxHistorySize + 1), session]
    }));

    return sessionId;
  },

  updateTransform: (sessionId, delta) => {
    const session = get().currentSession;
    if (!session || session.id !== sessionId) return;

    const { mode, axis, elementIds, pivot } = session;
    
    // Apply constraints and snapping
    const constrainedDelta = { ...delta };
    const state = get();
    
    if (state.constraints.lockX) constrainedDelta.x = 0;
    if (state.constraints.lockY) constrainedDelta.y = 0;
    if (state.constraints.lockZ) constrainedDelta.z = 0;

    // Apply snapping
    if (constrainedDelta.x !== undefined) {
      constrainedDelta.x = state.applySnapping(constrainedDelta.x, "x");
    }
    if (constrainedDelta.y !== undefined) {
      constrainedDelta.y = state.applySnapping(constrainedDelta.y, "y");
    }
    if (constrainedDelta.z !== undefined) {
      constrainedDelta.z = state.applySnapping(constrainedDelta.z, "z");
    }

    // Apply transform based on mode
    switch (mode) {
      case "translate":
        state.translateRealTime(elementIds, constrainedDelta as { x: number; y: number; z: number });
        break;
      case "rotate":
          state.rotateRealTime(elementIds, constrainedDelta as { x: number; y: number; z: number }, pivot);
        break;
      case "scale":
        state.scaleRealTime(elementIds, constrainedDelta as { x: number; y: number; z: number }, pivot);
        break;
    }

    // Update transform delta for UI feedback
    set(state => {
      const newDelta = { ...state.transformDelta };
      if (constrainedDelta.x !== undefined) newDelta.x += constrainedDelta.x;
      if (constrainedDelta.y !== undefined) newDelta.y += constrainedDelta.y;
      if (constrainedDelta.z !== undefined) newDelta.z += constrainedDelta.z;
      
      return {
        transformDelta: newDelta,
        currentSession: {
          ...session,
          currentValues: { ...session.currentValues, ...constrainedDelta }
        }
      };
    });
  },

  commitTransform: (sessionId) => {
    const session = get().currentSession;
    if (!session || session.id !== sessionId) return;

    // Save state to elements store history
    const elementsStore = useElementsStore.getState();
    elementsStore.saveHistoryState();

    // Update assembly joints if needed
    get().updateAssemblyJoints(session.elementIds);

    // Reset transform state
    set({
      currentSession: null,
      isTransforming: false,
      transformDelta: { x: 0, y: 0, z: 0 },
      rotationDelta: { x: 0, y: 0, z: 0 },
      scaleDelta: { x: 1, y: 1, z: 1 }
    });

    // Reset cursor
    useCursorStore.getState().resetCursor();
  },

  cancelTransform: (sessionId) => {
    const session = get().currentSession;
    if (!session || session.id !== sessionId) return;

    // Restore initial values
    const elementsStore = useElementsStore.getState();
    Object.entries(session.initialValues).forEach(([elementId, initialValues]) => {
      elementsStore.updateElement(elementId, initialValues);
    });

    // Reset transform state
    set({
      currentSession: null,
      isTransforming: false,
      transformDelta: { x: 0, y: 0, z: 0 },
      rotationDelta: { x: 0, y: 0, z: 0 },
      scaleDelta: { x: 1, y: 1, z: 1 }
    });

    // Reset cursor
    useCursorStore.getState().resetCursor();
  },

  // Advanced transform operations
  transformElements: (elementIds, transform, options = {}) => {
    const { space = "world", pivot, constraints } = options;
    const elementsStore = useElementsStore.getState();

    // Apply constraints if provided
    const currentConstraints = constraints ? { ...get().constraints, ...constraints } : get().constraints;

    elementIds.forEach(id => {
      const element = elementsStore.elements.find(el => el.id === id);
      if (!element || get().isElementLocked(id)) return;

      const updates: Partial<Element> = {};

      // Apply translation
      if (transform.translate) {
        const { x, y, z } = transform.translate;
        if (!currentConstraints.lockX) updates.x = (element.x || 0) + x;
        if (!currentConstraints.lockY) updates.y = (element.y || 0) + y;
        if (!currentConstraints.lockZ) updates.z = (element.z || 0) + z;
      }

      // Apply rotation
      if (transform.rotate) {
        const { x, y, z } = transform.rotate;
        updates.angleX = (element.angleX || 0) + x;
        updates.angleY = (element.angleY || 0) + y;
        updates.angleZ = (element.angleZ || 0) + z;
      }

      // Apply scaling
      if (transform.scale) {
        const { x, y, z } = transform.scale;
        
        // Clamp scale values
        const clampedX = Math.max(currentConstraints.minScale, Math.min(currentConstraints.maxScale, x));
        const clampedY = Math.max(currentConstraints.minScale, Math.min(currentConstraints.maxScale, y));
        const clampedZ = Math.max(currentConstraints.minScale, Math.min(currentConstraints.maxScale, z));

        if (element.type === "rectangle" || element.type === "cube") {
          updates.width = (element.width || 0) * clampedX;
          updates.height = (element.height || 0) * clampedY;
          if (element.type === "cube") {
            updates.depth = (element.depth || 0) * clampedZ;
          }
        } else if (element.type === "circle" || element.type === "sphere") {
          const avgScale = currentConstraints.preserveAspectRatio 
            ? (clampedX + clampedY + clampedZ) / 3 
            : (clampedX + clampedY) / 2;
          updates.radius = (element.radius || 0) * avgScale;
        }
      }

      // Apply updates
      if (Object.keys(updates).length > 0) {
        elementsStore.updateElement(id, updates);
      }
    });
  },

  // Real-time transform methods
  translateRealTime: (elementIds, delta) => {
    const elementsStore = useElementsStore.getState();
    
    elementIds.forEach(id => {
      const element = elementsStore.elements.find(el => el.id === id);
      if (!element || get().isElementLocked(id)) return;

      const updates: Partial<Element> = {};
      
      if (delta.x !== undefined) updates.x = (element.x || 0) + delta.x;
      if (delta.y !== undefined) updates.y = (element.y || 0) + delta.y;
      if (delta.z !== undefined) updates.z = (element.z || 0) + delta.z;

      // Handle line elements
      if (element.type === "line") {
        if (delta.x !== undefined) {
          updates.x1 = (element.x1 || 0) + delta.x;
          updates.x2 = (element.x2 || 0) + delta.x;
        }
        if (delta.y !== undefined) {
          updates.y1 = (element.y1 || 0) + delta.y;
          updates.y2 = (element.y2 || 0) + delta.y;
        }
        if (delta.z !== undefined) {
          updates.z1 = (element.z1 || 0) + delta.z;
          updates.z2 = (element.z2 || 0) + delta.z;
        }
      }

      elementsStore.updateElement(id, updates);
    });
  },

  rotateRealTime: (elementIds, delta, pivot) => {
    const elementsStore = useElementsStore.getState();
    
    elementIds.forEach(id => {
      const element = elementsStore.elements.find(el => el.id === id);
      if (!element || get().isElementLocked(id)) return;

      const updates: Partial<Element> = {};
      
      if (delta.x !== undefined) updates.angleX = (element.angleX || 0) + delta.x;
      if (delta.y !== undefined) updates.angleY = (element.angleY || 0) + delta.y;
      if (delta.z !== undefined) updates.angleZ = (element.angleZ || 0) + delta.z;

      // If pivot is provided and different from element center, also translate
      if (pivot && (element.x !== pivot.x || element.y !== pivot.y || element.z !== pivot.z)) {
        // Calculate rotation around pivot point
        const elementPos = { x: element.x || 0, y: element.y || 0, z: element.z || 0 };
        
        // Simplified rotation calculation (for Z-axis rotation)
        if (delta.z !== undefined) {
          const angle = delta.z * Math.PI / 180;
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          
          const relativeX = elementPos.x - pivot.x;
          const relativeY = elementPos.y - pivot.y;
          
          const newX = pivot.x + (relativeX * cos - relativeY * sin);
          const newY = pivot.y + (relativeX * sin + relativeY * cos);
          
          updates.x = newX;
          updates.y = newY;
        }
      }

      elementsStore.updateElement(id, updates);
    });
  },

  scaleRealTime: (elementIds, delta, pivot) => {
    const elementsStore = useElementsStore.getState();
    const { constraints } = get();
    
    elementIds.forEach(id => {
      const element = elementsStore.elements.find(el => el.id === id);
      if (!element || get().isElementLocked(id)) return;

      const updates: Partial<Element> = {};
      
      // Clamp scale values
      const scaleX = Math.max(constraints.minScale, Math.min(constraints.maxScale, delta.x || 1));
      const scaleY = Math.max(constraints.minScale, Math.min(constraints.maxScale, delta.y || 1));
      const scaleZ = Math.max(constraints.minScale, Math.min(constraints.maxScale, delta.z || 1));

      // Apply scaling based on element type
      switch (element.type) {
        case "rectangle":
        case "cube":
          updates.width = (element.width || 0) * scaleX;
          updates.height = (element.height || 0) * scaleY;
          if (element.type === "cube") {
            updates.depth = (element.depth || 0) * scaleZ;
          }
          break;
        case "circle":
        case "sphere":
          const avgScale = constraints.preserveAspectRatio 
            ? (scaleX + scaleY + scaleZ) / 3 
            : (scaleX + scaleY) / 2;
          updates.radius = (element.radius || 0) * avgScale;
          break;
      }

      elementsStore.updateElement(id, updates);
    });
  },

  // Handle management
  updateHandles: () => {
    const { mode, gizmoSettings } = get();
    const selectionStore = useSelectionStore.getState();
    
    if (selectionStore.selectedElementIds.length === 0 || mode === "none") {
      set({ handles: [] });
      return;
    }

    const bounds = get().getSelectionBounds();
    if (!bounds) {
      set({ handles: [] });
      return;
    }

    const handles: TransformHandle[] = [];
    const { centerX, centerY, centerZ } = bounds;

    // Create handles based on mode
    switch (mode) {
      case "translate":
        // Translation arrows
        handles.push(
          {
            id: "translate_x",
            type: "translate",
            axis: "x",
            position: { x: centerX + gizmoSettings.size, y: centerY, z: centerZ },
            isActive: false,
            isHovered: false,
            color: gizmoSettings.colors.x,
            size: gizmoSettings.size * 0.8
          },
          {
            id: "translate_y",
            type: "translate",
            axis: "y",
            position: { x: centerX, y: centerY + gizmoSettings.size, z: centerZ },
            isActive: false,
            isHovered: false,
            color: gizmoSettings.colors.y,
            size: gizmoSettings.size * 0.8
          },
          {
            id: "translate_z",
            type: "translate",
            axis: "z",
            position: { x: centerX, y: centerY, z: centerZ + gizmoSettings.size },
            isActive: false,
            isHovered: false,
            color: gizmoSettings.colors.z,
            size: gizmoSettings.size * 0.8
          }
        );
        break;

      case "rotate":
        // Rotation rings
        handles.push(
          {
            id: "rotate_x",
            type: "rotate",
            axis: "x",
            position: { x: centerX, y: centerY, z: centerZ },
            isActive: false,
            isHovered: false,
            color: gizmoSettings.colors.x,
            size: gizmoSettings.size
          },
          {
            id: "rotate_y",
            type: "rotate",
            axis: "y",
            position: { x: centerX, y: centerY, z: centerZ },
            isActive: false,
            isHovered: false,
            color: gizmoSettings.colors.y,
            size: gizmoSettings.size
          },
          {
            id: "rotate_z",
            type: "rotate",
            axis: "z",
            position: { x: centerX, y: centerY, z: centerZ },
            isActive: false,
            isHovered: false,
            color: gizmoSettings.colors.z,
            size: gizmoSettings.size
          }
        );
        break;

      case "scale":
        // Scale handles
        const offset = gizmoSettings.size * 0.7;
        handles.push(
          {
            id: "scale_x",
            type: "scale",
            axis: "x",
            position: { x: centerX + offset, y: centerY, z: centerZ },
            isActive: false,
            isHovered: false,
            color: gizmoSettings.colors.x,
            size: gizmoSettings.size * 0.6
          },
          {
            id: "scale_y",
            type: "scale",
            axis: "y",
            position: { x: centerX, y: centerY + offset, z: centerZ },
            isActive: false,
            isHovered: false,
            color: gizmoSettings.colors.y,
            size: gizmoSettings.size * 0.6
          },
          {
            id: "scale_z",
            type: "scale",
            axis: "z",
            position: { x: centerX, y: centerY, z: centerZ + offset },
            isActive: false,
            isHovered: false,
            color: gizmoSettings.colors.z,
            size: gizmoSettings.size * 0.6
          },
          {
            id: "scale_uniform",
            type: "scale",
            axis: "xyz",
            position: { x: centerX, y: centerY, z: centerZ },
            isActive: false,
            isHovered: false,
            color: gizmoSettings.colors.selection,
            size: gizmoSettings.size * 0.8
          }
        );
        break;
    }

    set({ handles });
  },

  getHandleAtPosition: (x, y) => {
    const { handles } = get();
    // This would need to be implemented with proper 3D to 2D projection
    // For now, return null as placeholder
    return null;
  },

  setHandleActive: (handleId, active) => {
    set(state => ({
      handles: state.handles.map(handle =>
        handle.id === handleId ? { ...handle, isActive: active } : handle
      )
    }));
  },

  setHandleHovered: (handleId, hovered) => {
    set(state => ({
      handles: state.handles.map(handle =>
        handle.id === handleId ? { ...handle, isHovered: hovered } : handle
      )
    }));

    // Update cursor based on hover state
    if (hovered) {
      const handle = get().handles.find(h => h.id === handleId);
      if (handle) {
        useCursorStore.getState().setTool(handle.type as any);
      }
    } else {
      useCursorStore.getState().resetCursor();
    }
  },

  // Snapping and constraints
  setConstraints: (constraints) => {
    set(state => ({
      constraints: { ...state.constraints, ...constraints }
    }));
  },

  setSnapMode: (mode) => {
    set({ snapMode: mode });
  },

  applySnapping: (value, axis) => {
    const { snapMode, constraints } = get();
    
    if (snapMode === "none" || !constraints.snapToGrid) {
      return value;
    }

    const snapDistance = constraints.snapDistance;
    
    switch (snapMode) {
      case "grid":
        return Math.round(value / snapDistance) * snapDistance;
      case "angle":
        if (constraints.snapToAngle) {
          const angleStep = constraints.angleStep;
          return Math.round(value / angleStep) * angleStep;
        }
        return value;
      default:
        return value;
    }
  },

  checkConstraints: (elementId, transform) => {
    // Check if transform is valid for the element
    const element = useElementsStore.getState().elements.find(el => el.id === elementId);
    if (!element) return false;

    // Check layer constraints
    const layer = useLayerStore.getState().layers.find(l => l.id === element.layerId);
    if (layer?.locked) return false;

    // Check assembly constraints
    return get().validateAssemblyConstraints([elementId]);
  },

  // Selection integration
  transformSelection: (transform) => {
    const selectionStore = useSelectionStore.getState();
    get().transformElements(selectionStore.selectedElementIds, transform);
  },

  getSelectionBounds: () => {
    return useSelectionStore.getState().getSelectionBounds();
  },

  getSelectionCenter: () => {
    const bounds = get().getSelectionBounds();
    return bounds ? { x: bounds.centerX, y: bounds.centerY, z: bounds.centerZ } : null;
  },

  // Assembly integration
  updateAssemblyJoints: (elementIds) => {
    // Update assembly joints when elements are transformed
    const assemblyStore = useAssemblyStore.getState();
    
    elementIds.forEach(elementId => {
      const joints = assemblyStore.getJointsForComponent(elementId);
      // Update joint positions based on new element positions
      // This would need specific implementation based on joint types
    });
  },

  validateAssemblyConstraints: (elementIds) => {
    // Validate that transform doesn't break assembly constraints
    const assemblyStore = useAssemblyStore.getState();
    
    return elementIds.every(elementId => {
      const constraints = assemblyStore.getConstraintsForEntity(elementId);
      // Check if any constraints would be violated
      // This would need specific implementation based on constraint types
      return true; // Placeholder
    });
  },

  // Utility methods
  calculatePivotPoint: (elementIds, mode = "center") => {
    const elementsStore = useElementsStore.getState();
    
    if (elementIds.length === 0) return { x: 0, y: 0, z: 0 };

    if (mode === "center") {
      const bounds = useSelectionStore.getState().getSelectionBounds();
      return bounds ? { x: bounds.centerX, y: bounds.centerY, z: bounds.centerZ } : { x: 0, y: 0, z: 0 };
    }

    // For individual mode, return first element's position
    const firstElement = elementsStore.elements.find(el => el.id === elementIds[0]);
    return firstElement ? 
      { x: firstElement.x || 0, y: firstElement.y || 0, z: firstElement.z || 0 } : 
      { x: 0, y: 0, z: 0 };
  },

  getElementBounds: (elementId) => {
    const element = useElementsStore.getState().elements.find(el => el.id === elementId);
    if (!element) return null;

    const x = element.x || 0;
    const y = element.y || 0;
    const z = element.z || 0;

    let halfWidth = 0;
    let halfHeight = 0;
    let halfDepth = 0;

    switch (element.type) {
      case "rectangle":
        halfWidth = (element.width || 0) / 2;
        halfHeight = (element.height || 0) / 2;
        break;
      case "circle":
        halfWidth = element.radius || 0;
        halfHeight = element.radius || 0;
        break;
      case "cube":
        halfWidth = (element.width || 0) / 2;
        halfHeight = (element.height || 0) / 2;
        halfDepth = (element.depth || 0) / 2;
        break;
      case "sphere":
        halfWidth = element.radius || 0;
        halfHeight = element.radius || 0;
        halfDepth = element.radius || 0;
        break;
    }

    return {
      minX: x - halfWidth,
      maxX: x + halfWidth,
      minY: y - halfHeight,
      maxY: y + halfHeight,
      minZ: z - halfDepth,
      maxZ: z + halfDepth,
      width: halfWidth * 2,
      height: halfHeight * 2,
      depth: halfDepth * 2,
      centerX: x,
      centerY: y,
      centerZ: z
    };
  },

  isElementLocked: (elementId) => {
    const element = useElementsStore.getState().elements.find(el => el.id === elementId);
    if (!element) return true;

    // Check element lock
    if (element.locked) return true;

    // Check layer lock
    const layer = useLayerStore.getState().layers.find(l => l.id === element.layerId);
    return layer?.locked || false;
  },

  resetTransform: () => {
    set({
      mode: "none",
      activeAxis: "none",
      isTransforming: false,
      currentSession: null,
      transformDelta: { x: 0, y: 0, z: 0 },
      rotationDelta: { x: 0, y: 0, z: 0 },
      scaleDelta: { x: 1, y: 1, z: 1 },
      handles: []
    });
    
    useCursorStore.getState().resetCursor();
  },

  // Performance optimization
  setBatchMode: (enabled) => {
    set({ batchTransforms: enabled });
  },

  flushBatchedTransforms: () => {
    // Flush any batched transforms
    // This would be implemented for performance optimization
  },

  // Settings and configuration
  updateGizmoSettings: (settings) => {
    set(state => ({
      gizmoSettings: { ...state.gizmoSettings, ...settings }
    }));
    get().updateHandles();
  },

  loadPreset: (presetName) => {
    // Load transform control preset
    // This would load from localStorage or configuration
  },

  savePreset: (presetName) => {
    // Save current settings as preset
    // This would save to localStorage or configuration
  }
}));

// Export helper functions
export const transformControlsUtils = {
  // Convert screen coordinates to world coordinates
  screenToWorld: (screenX: number, screenY: number, camera: any) => {
    // Implementation would depend on your 3D camera setup
    return { x: screenX, y: screenY, z: 0 };
  },

  // Convert world coordinates to screen coordinates
  worldToScreen: (worldX: number, worldY: number, worldZ: number, camera: any) => {
    // Implementation would depend on your 3D camera setup
    return { x: worldX, y: worldY };
  },

  // Calculate distance between two points
  distance: (p1: { x: number; y: number; z?: number }, p2: { x: number; y: number; z?: number }) => {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dz = (p2.z || 0) - (p1.z || 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  },

  // Normalize angle to 0-360 range
  normalizeAngle: (angle: number) => {
    return ((angle % 360) + 360) % 360;
  },

  // Linear interpolation
  lerp: (start: number, end: number, factor: number) => {
    return start + (end - start) * factor;
  },

  // Clamp value between min and max
  clamp: (value: number, min: number, max: number) => {
    return Math.max(min, Math.min(max, value));
  }
};
