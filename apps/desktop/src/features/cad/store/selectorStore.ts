// src/store/selectionStore.ts
import { create } from "../../../shared/state/zustand.ts";
const uuidv4 = (): string => crypto.randomUUID();
import { useElementsStore } from "./elementsStore.ts";
import { componentBounds, createComponentAssembly, translateComponentElement, cloneComponentElement } from "../lib/component-assembly.ts";
import { useLayerStore } from "./layerStore.ts";

export interface SelectionBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  width: number;
  height: number;
  depth: number;
  centerX: number;
  centerY: number;
  centerZ: number;
}

interface SelectionState {
  selectedElementIds: string[];
  isBoxSelecting: boolean;
  boxStartPosition: { x: number; y: number } | null;
  boxEndPosition: { x: number; y: number } | null;

  // Actions
  selectElement: (id: string | null, addToSelection?: boolean) => void;
  deselectElement: (id: string) => void;
  selectMultiple: (ids: string[]) => void;
  clearSelection: () => void;
  startBoxSelection: (position: { x: number; y: number }) => void;
  updateBoxSelection: (position: { x: number; y: number }) => void;
  endBoxSelection: (elementIds?: string[], additive?: boolean) => void;
  selectElementsInBox: () => void;
  getSelectionBounds: () => SelectionBounds | null;
  saveAsComponent: () => string;
  moveSelectionToLayer: (layerId: string) => void;
  duplicateSelection: () => void;
  deleteSelection: () => void;
  groupSelection: () => string;
  ungroupElement: (id: string) => void;
}

export const useSelectionStore = create<SelectionState>((set, get) => ({
  selectedElementIds: [],
  isBoxSelecting: false,
  boxStartPosition: null,
  boxEndPosition: null,

  selectElement: (id, addToSelection = false) => {
    if (id === null) {
      set({ selectedElementIds: [] });
      return;
    }

    set(state => ({
      selectedElementIds: addToSelection
        ? [...state.selectedElementIds.filter(elementId => elementId !== id), id]
        : [id]
    }));
  },

  deselectElement: id => {
    set(state => ({
      selectedElementIds: state.selectedElementIds.filter(elementId => elementId !== id)
    }));
  },
  selectMultiple: ids => {
    set({ selectedElementIds: Array.from(new Set(ids)) });
  },

  clearSelection: () => {
    set({ selectedElementIds: [] });
  },

  startBoxSelection: position => {
    set({
      isBoxSelecting: true,
      boxStartPosition: position,
      boxEndPosition: position
    });
  },

  updateBoxSelection: position => {
    set({ boxEndPosition: position });
  },

  endBoxSelection: (elementIds, additive = false) => {
    const state = get();
    if (elementIds) {
      const moved = state.boxStartPosition && state.boxEndPosition
        ? Math.hypot(
            state.boxEndPosition.x - state.boxStartPosition.x,
            state.boxEndPosition.y - state.boxStartPosition.y
          ) >= 1e-3
        : false;
      const next = !moved
        ? state.selectedElementIds
        : additive
        ? Array.from(new Set([...state.selectedElementIds, ...elementIds]))
        : elementIds;
      set({
        selectedElementIds: next,
        isBoxSelecting: false,
        boxStartPosition: null,
        boxEndPosition: null
      });
      return;
    }
    set({ isBoxSelecting: false, boxStartPosition: null, boxEndPosition: null });
  },

  selectElementsInBox: () => {
    const { boxStartPosition, boxEndPosition } = get();

    if (!boxStartPosition || !boxEndPosition) return;

    // Calculate box boundaries
    const minX = Math.min(boxStartPosition.x, boxEndPosition.x);
    const maxX = Math.max(boxStartPosition.x, boxEndPosition.x);
    const minY = Math.min(boxStartPosition.y, boxEndPosition.y);
    const maxY = Math.max(boxStartPosition.y, boxEndPosition.y);

    // Get elements from store
    const elements = useElementsStore.getState().elements;
    const { originOffset } = useCADStore.getState();

    // Filter elements that are inside the box
    const elementsInBox = elements.filter(element => {
      // Skip locked elements
      if (element.locked) return false;

      // Get element position
      const elementX = (element.x || 0) + originOffset.x;
      const elementY = (element.y || 0) + originOffset.y;

      // Get element dimensions
      let width = 0;
      let height = 0;

      switch (element.type) {
        case "rectangle":
        case "cube":
          width = element.width || 0;
          height = element.height || 0;
          break;
        case "circle":
        case "sphere":
          width = (element.radius || 0) * 2;
          height = (element.radius || 0) * 2;
          break;
        case "line":
          // Use bounding box of the line
          const x1 = element.x1 || 0;
          const y1 = element.y1 || 0;
          const x2 = element.x2 || 0;
          const y2 = element.y2 || 0;
          width = Math.abs(x2 - x1);
          height = Math.abs(y2 - y1);
          break;
        default:
          // Default small dimensions for other element types
          width = 10;
          height = 10;
      }

      // Check if element is inside the box (center point is sufficient for most elements)
      const halfWidth = width / 2;
      const halfHeight = height / 2;

      // Check if element is fully inside the box
      const elementLeft = elementX - halfWidth;
      const elementRight = elementX + halfWidth;
      const elementTop = elementY - halfHeight;
      const elementBottom = elementY + halfHeight;

      return elementLeft >= minX && elementRight <= maxX && elementTop >= minY && elementBottom <= maxY;
    });

    // Select filtered elements (add to existing selection if shift is pressed)
    const isShiftPressed = useCADStore.getState().isShiftKeyPressed;

    if (isShiftPressed) {
      set(state => ({
        selectedElementIds: Array.from(
          new Set([...state.selectedElementIds, ...elementsInBox.map(element => element.id)])
        )
      }));
    } else {
      set({
        selectedElementIds: elementsInBox.map(element => element.id),
        boxStartPosition: null,
        boxEndPosition: null
      });
    }
  },

  getSelectionBounds: () => componentBounds(useElementsStore.getState().elements.filter(element => get().selectedElementIds.includes(element.id))),

  saveAsComponent: () => {
    const selected = useElementsStore.getState().elements.filter(element => get().selectedElementIds.includes(element.id));
    const layerId = useLayerStore.getState().activeLayer;
    if (!selected.length || !layerId) return "";
    const component = createComponentAssembly(selected, { name: "Component", layerId });
    useElementsStore.getState().insertComponent(component, selected.map(element => element.id), false);
    set({ selectedElementIds: [component.id] });
    return component.id;
  },

  moveSelectionToLayer: (layerId: string) => {
    const { selectedElementIds } = get();
    if (selectedElementIds.length === 0) return;

    // Update each selected element to the new layer
    selectedElementIds.forEach(id => {
      useElementsStore.getState().updateElement(id, { layerId });
    });
  },

  duplicateSelection: () => {
    const { selectedElementIds } = get();
    if (selectedElementIds.length === 0) return;

    const elements = useElementsStore.getState().elements;
    const selectedElements = elements.filter(element => selectedElementIds.includes(element.id));

    // Create copies with offset
    const copies = selectedElements.map(element => {
      const { id, ...rest } = element;
      return {
        ...rest,
        x: rest.x + 20, // Offset to make it visible
        y: rest.y + 20
      };
    });

    // Add all copies at once for better performance
    const newIds = useElementsStore.getState().addElements(copies);

    // Select the new elements
    set({ selectedElementIds: newIds });
  },

  deleteSelection: () => {
    const { selectedElementIds } = get();
    if (selectedElementIds.length === 0) return;

    // Delete each selected element
    selectedElementIds.forEach(id => {
      useElementsStore.getState().deleteElement(id);
    });

    // Clear selection
    set({ selectedElementIds: [] });
  },

  groupSelection: () => {
    return get().saveAsComponent();
  },

  ungroupElement: (id: string) => {
    const elements = useElementsStore.getState().elements;
    const element = elements.find(el => el.id === id);

    // Only ungroup elements of type 'component'
    if (!element || element.type !== "component" || !element.elements || element.elements.length === 0) {
      return;
    }

    // Extract component position
    const componentX = element.x || 0;
    const componentY = element.y || 0;
    const componentZ = element.z || 0;

    // Create copies of all child elements with absolute positions
    const childElements = element.elements.map((childElement: import("./elementsStore.ts").Element) =>
      cloneComponentElement(translateComponentElement(childElement, componentX, componentY, componentZ), true));

    // Add all child elements
    const newIds = useElementsStore.getState().addElements(childElements);

    // Delete the component
    useElementsStore.getState().deleteElement(id);

    // Select all new elements
    set({ selectedElementIds: newIds });
  }
}));

// Import this at the top of the file
import { useCADStore } from "./cadStore.ts";
