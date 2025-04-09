// src/store/selectionStore.ts
import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { useElementsStore } from './elementsStore';
import { useLayerStore } from './layerStore';


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
  boxStartPosition: { x: number, y: number } | null;
  boxEndPosition: { x: number, y: number } | null;
  
  // Actions
  selectElement: (id: string | null, addToSelection?: boolean) => void;
  deselectElement: (id: string) => void;
  selectMultiple: (ids: string[]) => void;
  clearSelection: () => void;
  startBoxSelection: (position: { x: number, y: number }) => void;
  updateBoxSelection: (position: { x: number, y: number }) => void;
  endBoxSelection: () => void;
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
    
    set((state) => ({
      selectedElementIds: addToSelection 
        ? [...state.selectedElementIds.filter(elementId => elementId !== id), id] 
        : [id]
    }));
  },
  
  deselectElement: (id) => {
    set((state) => ({
      selectedElementIds: state.selectedElementIds.filter(elementId => elementId !== id)
    }));
  },
  selectMultiple: (ids) => {
    set({ selectedElementIds: Array.from(new Set(ids)) });
  },
  
  clearSelection: () => {
    set({ selectedElementIds: [] });
  },
  
  startBoxSelection: (position) => {
    set({
      isBoxSelecting: true,
      boxStartPosition: position,
      boxEndPosition: position
    });
  },
  
  updateBoxSelection: (position) => {
    set({ boxEndPosition: position });
  },
  
  endBoxSelection: () => {
    set((state) => {
      // Don't end box selection if we haven't moved the box
      if (state.boxStartPosition && state.boxEndPosition) {
        const dx = Math.abs(state.boxStartPosition.x - state.boxEndPosition.x);
        const dy = Math.abs(state.boxStartPosition.y - state.boxEndPosition.y);
        
        // If the box is too small, it's likely a click, not a drag
        if (dx < 5 && dy < 5) {
          return {
            isBoxSelecting: false,
            boxStartPosition: null,
            boxEndPosition: null
          };
        }
      }
      
      return { isBoxSelecting: false };
    });
    
    get().selectElementsInBox();
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
        case 'rectangle':
        case 'cube':
          width = element.width || 0;
          height = element.height || 0;
          break;
        case 'circle':
        case 'sphere':
          width = (element.radius || 0) * 2;
          height = (element.radius || 0) * 2;
          break;
        case 'line':
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
      
      return elementLeft >= minX && elementRight <= maxX && 
             elementTop >= minY && elementBottom <= maxY;
    });
    
    // Select filtered elements (add to existing selection if shift is pressed)
    const isShiftPressed = useCADStore.getState().isShiftKeyPressed;
    
    if (isShiftPressed) {
      set((state) => ({
        selectedElementIds: Array.from(new Set([...state.selectedElementIds, ...elementsInBox.map(element => element.id)]))
      }));
    } else {
      set({
        selectedElementIds: elementsInBox.map(element => element.id),
        boxStartPosition: null,
        boxEndPosition: null
      });
    }
  },
  
  getSelectionBounds: () => {
    const { selectedElementIds } = get();
    if (selectedElementIds.length === 0) return null;
    
    const elements = useElementsStore.getState().elements;
    const selectedElements = elements.filter(element => 
      selectedElementIds.includes(element.id)
    );
    
    if (selectedElements.length === 0) return null;
    
    // Initialize with extreme values
    let bounds = {
      minX: Infinity,
      maxX: -Infinity,
      minY: Infinity,
      maxY: -Infinity,
      minZ: Infinity,
      maxZ: -Infinity
    };
    
    // Calculate bounds based on element type
    selectedElements.forEach(element => {
      const x = element.x || 0;
      const y = element.y || 0;
      const z = element.z || 0;
      
      let halfWidth = 0;
      let halfHeight = 0;
      let halfDepth = 0;
      
      switch (element.type) {
        case 'rectangle':
          halfWidth = (element.width || 0) / 2;
          halfHeight = (element.height || 0) / 2;
          halfDepth = 0;
          break;
        case 'circle':
          halfWidth = element.radius || 0;
          halfHeight = element.radius || 0;
          halfDepth = 0;
          break;
        case 'cube':
          halfWidth = (element.width || 0) / 2;
          halfHeight = (element.height || 0) / 2;
          halfDepth = (element.depth || 0) / 2;
          break;
        case 'sphere':
          halfWidth = element.radius || 0;
          halfHeight = element.radius || 0;
          halfDepth = element.radius || 0;
          break;
        case 'line':
          // For lines, use the actual endpoints
          const x1 = element.x1 || 0;
          const y1 = element.y1 || 0;
          const z1 = element.z1 || 0;
          const x2 = element.x2 || 0;
          const y2 = element.y2 || 0;
          const z2 = element.z2 || 0;
          
          bounds.minX = Math.min(bounds.minX, x1, x2);
          bounds.maxX = Math.max(bounds.maxX, x1, x2);
          bounds.minY = Math.min(bounds.minY, y1, y2);
          bounds.maxY = Math.max(bounds.maxY, y1, y2);
          bounds.minZ = Math.min(bounds.minZ, z1, z2);
          bounds.maxZ = Math.max(bounds.maxZ, z1, z2);
          return;
        case 'component':
          // For components, include all child elements
          if (element.elements) {
            element.elements.forEach((childElement: any) => {
              const childX = x + (childElement.x || 0);
              const childY = y + (childElement.y || 0);
              const childZ = z + (childElement.z || 0);
              
              let childHalfWidth = 0;
              let childHalfHeight = 0;
              let childHalfDepth = 0;
              
              // Determine dimensions based on child type
              if (childElement.type === 'rectangle' || childElement.type === 'cube') {
                childHalfWidth = (childElement.width || 0) / 2;
                childHalfHeight = (childElement.height || 0) / 2;
                childHalfDepth = (childElement.type === 'cube' ? (childElement.depth || 0) / 2 : 0);
              } else if (childElement.type === 'circle' || childElement.type === 'sphere') {
                childHalfWidth = childElement.radius || 0;
                childHalfHeight = childElement.radius || 0;
                childHalfDepth = childElement.type === 'sphere' ? childElement.radius || 0 : 0;
              }
              
              bounds.minX = Math.min(bounds.minX, childX - childHalfWidth);
              bounds.maxX = Math.max(bounds.maxX, childX + childHalfWidth);
              bounds.minY = Math.min(bounds.minY, childY - childHalfHeight);
              bounds.maxY = Math.max(bounds.maxY, childY + childHalfHeight);
              bounds.minZ = Math.min(bounds.minZ, childZ - childHalfDepth);
              bounds.maxZ = Math.max(bounds.maxZ, childZ + childHalfDepth);
            });
          }
          return;
        default:
          // Default small size for other elements
          halfWidth = 5;
          halfHeight = 5;
          halfDepth = 0;
      }
      
      // Update bounds
      bounds.minX = Math.min(bounds.minX, x - halfWidth);
      bounds.maxX = Math.max(bounds.maxX, x + halfWidth);
      bounds.minY = Math.min(bounds.minY, y - halfHeight);
      bounds.maxY = Math.max(bounds.maxY, y + halfHeight);
      bounds.minZ = Math.min(bounds.minZ, z - halfDepth);
      bounds.maxZ = Math.max(bounds.maxZ, z + halfDepth);
    });
    
    // Calculate width, height, depth and center
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    const depth = bounds.maxZ - bounds.minZ;
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    const centerZ = (bounds.minZ + bounds.maxZ) / 2;
    
    return {
      ...bounds,
      width,
      height,
      depth,
      centerX,
      centerY,
      centerZ
    };
  },
  
  saveAsComponent: () => {
    const { selectedElementIds } = get();
    if (selectedElementIds.length === 0) return '';
    
    const elements = useElementsStore.getState().elements;
    const selectedElements = elements.filter(element => 
      selectedElementIds.includes(element.id)
    );
    
    // Create a new component
    const componentId = uuidv4();
    
    // Get selection bounds
    const bounds = get().getSelectionBounds();
    if (!bounds) return '';
    
    // Create component with elements positioned relative to component center
    const component = {
      id: componentId,
      type: 'component',
      name: `Component-${componentId.slice(0, 6)}`,
      x: bounds.centerX,
      y: bounds.centerY,
      z: bounds.centerZ,
      width: bounds.width,
      height: bounds.height,
      depth: bounds.depth,
      elements: selectedElements.map(element => ({
        ...element,
        x: element.x - bounds.centerX,
        y: element.y - bounds.centerY,
        z: (element.z || 0) - bounds.centerZ
      })),
      layerId: useLayerStore.getState().activeLayer,
      // Add metadata for CAM processing
      metadata: {
        createdAt: new Date().toISOString(),
        isComposite: true,
        elementCount: selectedElements.length,
        elementTypes: Array.from(new Set(selectedElements.map(el => el.type)))
      }
    };
    
    // Add component to elements store
    useElementsStore.getState().addElement(component);
    
    // Remove original elements
    selectedElements.forEach(element => {
      useElementsStore.getState().deleteElement(element.id);
    });
    
    // Select the new component
    set({ selectedElementIds: [componentId] });
    
    return componentId;
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
    const selectedElements = elements.filter(element => 
      selectedElementIds.includes(element.id)
    );
    
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
    if (!element || element.type !== 'component' || !element.elements || element.elements.length === 0) {
      return;
    }
    
    // Extract component position
    const componentX = element.x || 0;
    const componentY = element.y || 0;
    const componentZ = element.z || 0;
    
    // Create copies of all child elements with absolute positions
    const childElements = element.elements.map((childElement: any) => {
      // Generate a new ID for the child
      const newId = uuidv4();
      
      return {
        ...childElement,
        id: newId,
        // Calculate absolute position
        x: componentX + (childElement.x || 0),
        y: componentY + (childElement.y || 0),
        z: componentZ + (childElement.z || 0)
      };
    });
    
    // Add all child elements
    const newIds = useElementsStore.getState().addElements(childElements);
    
    // Delete the component
    useElementsStore.getState().deleteElement(id);
    
    // Select all new elements
    set({ selectedElementIds: newIds });
  }
}));

// Import this at the top of the file
import { useCADStore } from './cadStore';