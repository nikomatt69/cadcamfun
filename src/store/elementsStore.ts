import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { useLayerStore } from './layerStore';

export interface AIDesignSuggestion {
  id: string;
  description: string;
  preview?: string;
  type: string;
}

export interface Point {
  x: number;
  y: number;
  z: number;
}

export interface Element {
  id: string;
  type: string;
  layerId: string;
  [key: string]: any;
  aiSuggestions?: AIDesignSuggestion[];
}

interface ElementsState {
  elements: Element[];
  selectedElement: Element | null;
  mousePosition: Point;
  // Selection state for CAM operations
  selectedElements: string[];
  // History for undo/redo
  history: Element[][];
  currentHistoryIndex: number;
  clipboard: Element | null;
  // Actions
  addElement: (element: Omit<Element, 'id' | 'layerId'> | any) => string;
  addElements: (elements: (Omit<Element, 'id' | 'layerId'> | any)[]) => string[];
  updateElement: (id: string, updates: Partial<Element>) => void;
  deleteElement: (id: string) => void;
  selectElement: (id: string | null) => void;
  setMousePosition: (position: Point) => void;
  duplicateElement: (id: string) => string | undefined;
  clearSelection: () => void;
  getElementsByLayerId: (layerId: string) => Element[];
  // Multiple selection for CAM operations
  toggleElementSelection: (id: string) => void;
  clearSelectedElements: () => void;
  // Element transformation
  moveElement: (id: string, dx: number, dy: number, dz: number) => void;
  rotateElement: (id: string, angle: number, axis?: 'x' | 'y' | 'z') => void;
  rotateElementMultiAxis: (id: string, angleX: number, angleY: number, angleZ: number) => void;
  scaleElement: (id: string, sx: number, sy: number, sz: number) => void;
  // Copy/paste functionality
  copySelectedElement: () => void;
  pasteElement: () => void;
  // History management
  saveHistoryState: () => void;
  undo: () => void;
  redo: () => void;
  // Group operations
  groupElements: (ids: string[]) => string;
  ungroupElement: (groupId: string) => void;
  // AI suggestions
  addAISuggestion: (elementId: string, suggestion: AIDesignSuggestion) => void;
}
function normalizeElement(element: any, activeLayerId: string): Element {
  // If it's already a complete element, just ensure it has a layerId
  if (element.id && element.type && element.layerId) {
    return element;
  }

  // Handle library components with complex geometry
  if (element.data && element.data.geometry && element.data.geometry.elements) {
    // Create a representation based on the first geometry element
    const firstGeomElement = element.data.geometry.elements[0];
    
    return {
      id: uuidv4(),
      layerId: activeLayerId,
      name: element.name || 'Component',
      description: element.description || '',
      type: firstGeomElement.type || element.data.type || 'custom',
      ...firstGeomElement,
      originalData: element // Keep original data for reference
    };
  }

  // Handle simple library items or partial elements
  return {
    id: uuidv4(),
    layerId: activeLayerId,
    type: element.type || 'custom',
    name: element.name || 'New Element',
    description: element.description || '',
    ...element
  };
}

export const useElementsStore = create<ElementsState>((set, get) => ({
  elements: [],
  selectedElement: null,
  mousePosition: { x: 0, y: 0, z: 0 },
  selectedElements: [],
  history: [[]],
  currentHistoryIndex: 0,
  clipboard: null,

  addElement: (element) => {
    const layerState = useLayerStore.getState();
    const activeLayerId = layerState.activeLayer;
    
    if (!activeLayerId) {
      console.warn('No active layer selected. Element will not be added.');
      return '';
    }
    
    // Normalize the element to ensure it has the correct structure
    const newElement = normalizeElement(element, activeLayerId);
    
    set((state) => {
      const newElements = [...state.elements, newElement];
      
      // Save state to history
      const newHistory = state.history.slice(0, state.currentHistoryIndex + 1);
      newHistory.push(newElements);
      
      return {
        elements: newElements,
        history: newHistory,
        currentHistoryIndex: state.currentHistoryIndex + 1
      };
    });
    
    return newElement.id;
  },

  // New method to add multiple elements at once
  addElements: (elements) => {
    const layerState = useLayerStore.getState();
    const activeLayerId = layerState.activeLayer;
    
    if (!activeLayerId) {
      console.warn('No active layer selected. Elements will not be added.');
      return [];
    }
    
    // Normalize elements to ensure they have the correct structure
    const newElements = elements.map(element => 
      normalizeElement(element, activeLayerId)
    );
    
    set((state) => {
      const updatedElements = [...state.elements, ...newElements];
      
      // Save state to history
      const newHistory = state.history.slice(0, state.currentHistoryIndex + 1);
      newHistory.push(updatedElements);
      
      return {
        elements: updatedElements,
        history: newHistory,
        currentHistoryIndex: state.currentHistoryIndex + 1,
        // Optionally select the last element added
        selectedElement: newElements.length > 0 ? newElements[newElements.length - 1] : state.selectedElement
      };
    });
    
    return newElements.map(el => el.id);
  },

  updateElement: (id, updates) => {
    set((state) => {
      // Verify the element exists
      const elementExists = state.elements.some(el => el.id === id);
      if (!elementExists) {
        console.warn(`Element with id ${id} not found for update.`);
        return state;
      }
      
      const updatedElements = state.elements.map((element) =>
        element.id === id ? { ...element, ...updates } : element
      );
      
      // Save state to history
      const newHistory = state.history.slice(0, state.currentHistoryIndex + 1);
      newHistory.push(updatedElements);
      
      return {
        elements: updatedElements,
        selectedElement: state.selectedElement?.id === id
          ? { ...state.selectedElement, ...updates }
          : state.selectedElement,
        history: newHistory,
        currentHistoryIndex: state.currentHistoryIndex + 1
      };
    });
  },
  
  addAISuggestion: (elementId, suggestion) => {
    set(state => ({
      elements: state.elements.map(element => 
        element.id === elementId 
          ? { 
              ...element, 
              aiSuggestions: [...(element.aiSuggestions || []), suggestion] 
            }
          : element
      )
    }));
  },

  deleteElement: (id) => {
    set((state) => {
      // Verify the element exists
      const elementExists = state.elements.some(el => el.id === id);
      if (!elementExists) {
        console.warn(`Element with id ${id} not found for deletion.`);
        return state;
      }
      
      const filteredElements = state.elements.filter((element) => element.id !== id);
      
      // Save state to history
      const newHistory = state.history.slice(0, state.currentHistoryIndex + 1);
      newHistory.push(filteredElements);
      
      return {
        elements: filteredElements,
        selectedElement: state.selectedElement?.id === id ? null : state.selectedElement,
        selectedElements: state.selectedElements.filter(eid => eid !== id),
        history: newHistory,
        currentHistoryIndex: state.currentHistoryIndex + 1
      };
    });
  },

  selectElement: (id) => {
    set((state) => {
      if (id === null) {
        return { selectedElement: null };
      }
      
      const elementToSelect = state.elements.find((element) => element.id === id);
      if (!elementToSelect && id !== null) {
        console.warn(`Element with id ${id} not found for selection.`);
      }
      
      return {
        selectedElement: elementToSelect || null
      };
    });
  },

  setMousePosition: (position) => {
    set({ mousePosition: position });
  },

  duplicateElement: (id) => {
    const element = get().elements.find((element) => element.id === id);
    
    if (!element) {
      console.warn(`Element with id ${id} not found for duplication.`);
      return undefined;
    }
    
    // Create a deep copy to ensure all nested objects are also duplicated
    const elementCopy = JSON.parse(JSON.stringify(element));
    const { id: _, ...elementWithoutId } = elementCopy;
    
    // Add slight offset to make the duplicate visible
    if ('x' in elementWithoutId) {
      elementWithoutId.x += 10;
    } else if ('x1' in elementWithoutId) {
      elementWithoutId.x1 += 10;
      elementWithoutId.x2 += 10;
    }
    
    if ('y' in elementWithoutId) {
      elementWithoutId.y += 10;
    } else if ('y1' in elementWithoutId) {
      elementWithoutId.y1 += 10;
      elementWithoutId.y2 += 10;
    }
    
    return get().addElement(elementWithoutId);
  },

  clearSelection: () => {
    set({ selectedElement: null });
  },

  getElementsByLayerId: (layerId) => {
    if (!layerId) {
      console.warn('No layerId provided to getElementsByLayerId');
      return [];
    }
    return get().elements.filter((element) => element.layerId === layerId);
  },

  // Multiple selection for CAM operations
  toggleElementSelection: (id) => {
    set((state) => {
      const isSelected = state.selectedElements.includes(id);
      
      if (isSelected) {
        return {
          selectedElements: state.selectedElements.filter(eid => eid !== id)
        };
      } else {
        return {
          selectedElements: [...state.selectedElements, id]
        };
      }
    });
  },

  clearSelectedElements: () => {
    set({ selectedElements: [] });
  },

  // Element transformation
  moveElement: (id, dx, dy, dz) => {
    const element = get().elements.find(el => el.id === id);
    if (!element) return;
    
    const updates: Partial<Element> = {};
    
    if ('x' in element && 'y' in element && 'z' in element) {
      updates.x = element.x + dx;
      updates.y = element.y + dy;
      updates.z = element.z + dz;
    } else if ('x1' in element && 'y1' in element && 'z1' in element && 
               'x2' in element && 'y2' in element && 'z2' in element) {
      updates.x1 = element.x1 + dx;
      updates.y1 = element.y1 + dy;
      updates.z1 = element.z1 + dz;
      updates.x2 = element.x2 + dx;
      updates.y2 = element.y2 + dy;
      updates.z2 = element.z2 + dz;
    }
    
    get().updateElement(id, updates);
  },

  rotateElement: (id, angle, axis = 'z') => {
    const element = get().elements.find(el => el.id === id);
    if (!element) return;
    
    const updates: Partial<Element> = {};
    
    // Apply rotation based on the specified axis
    if (axis === 'x') {
      updates.angleX = (element.angleX || 0) + angle;
    } else if (axis === 'y') {
      updates.angleY = (element.angleY || 0) + angle;
    } else {
      updates.angleZ = (element.angleZ || 0) + angle;
    }
    
    get().updateElement(id, updates);
  },
  
  rotateElementMultiAxis: (id, angleX, angleY, angleZ) => {
    const element = get().elements.find(el => el.id === id);
    if (!element) return;
    
    const updates: Partial<Element> = {
      angleX: (element.angleX || 0) + angleX,
      angleY: (element.angleY || 0) + angleY,
      angleZ: (element.angleZ || 0) + angleZ
    };
    
    get().updateElement(id, updates);
  },

  scaleElement: (id, sx, sy, sz) => {
    const element = get().elements.find(el => el.id === id);
    if (!element) return;
    
    const updates: Partial<Element> = {};
    
    switch (element.type) {
      case 'rectangle':
        updates.width = element.width * sx;
        updates.height = element.height * sy;
        break;
      case 'circle':
        // For circles, use the average scale factor for radius
        const avgScale = (sx + sy) / 2;
        updates.radius = element.radius * avgScale;
        break;
      case 'cube':
        updates.width = element.width * sx;
        updates.height = element.height * sy;
        updates.depth = element.depth * sz;
        break;
      case 'sphere':
        // For spheres, use the average of all three scale factors
        const avgScale3D = (sx + sy + sz) / 3;
        updates.radius = element.radius * avgScale3D;
        break;
      case 'line':
        // Scale line from its center
        const centerX = (element.x1 + element.x2) / 2;
        const centerY = (element.y1 + element.y2) / 2;
        const centerZ = (element.z1 + element.z2) / 2;
        
        updates.x1 = centerX + (element.x1 - centerX) * sx;
        updates.y1 = centerY + (element.y1 - centerY) * sy;
        updates.z1 = centerZ + (element.z1 - centerZ) * sz;
        updates.x2 = centerX + (element.x2 - centerX) * sx;
        updates.y2 = centerY + (element.y2 - centerY) * sy;
        updates.z2 = centerZ + (element.z2 - centerZ) * sz;
        break;
    }
    
    get().updateElement(id, updates);
  },

  // Copy the selected element to clipboard
  copySelectedElement: () => {
    const { selectedElement } = get();
    if (!selectedElement) return;
    
    // Store a deep copy of the element in the clipboard
    set({ clipboard: JSON.parse(JSON.stringify(selectedElement)) });
  },

  // Paste the previously copied element
  pasteElement: () => {
    const { clipboard } = get();
    if (!clipboard) return;
    
    const { id, ...elementWithoutId } = clipboard;
    
    // Offset the position slightly to make it clear this is a copy
    if ('x' in elementWithoutId) {
      elementWithoutId.x += 20;
    } else if ('x1' in elementWithoutId) {
      elementWithoutId.x1 += 20;
      elementWithoutId.x2 += 20;
    }
    
    if ('y' in elementWithoutId) {
      elementWithoutId.y += 20;
    } else if ('y1' in elementWithoutId) {
      elementWithoutId.y1 += 20;
      elementWithoutId.y2 += 20;
    }
    
    // Add the copied element to the scene
    return get().addElement(elementWithoutId);
  },

  // Save the current state to history for undo/redo
  saveHistoryState: () => {
    set((state) => {
      const newHistory = state.history.slice(0, state.currentHistoryIndex + 1);
      newHistory.push([...state.elements]);
      
      return {
        history: newHistory,
        currentHistoryIndex: state.currentHistoryIndex + 1
      };
    });
  },

  // Undo the last action
  undo: () => {
    set((state) => {
      if (state.currentHistoryIndex <= 0) return state;
      
      const newIndex = state.currentHistoryIndex - 1;
      const previousElements = state.history[newIndex];
      
      return {
        elements: previousElements,
        currentHistoryIndex: newIndex,
        selectedElement: null // Clear selection when undoing
      };
    });
  },

  // Redo a previously undone action
  redo: () => {
    set((state) => {
      if (state.currentHistoryIndex >= state.history.length - 1) return state;
      
      const newIndex = state.currentHistoryIndex + 1;
      const nextElements = state.history[newIndex];
      
      return {
        elements: nextElements,
        currentHistoryIndex: newIndex,
        selectedElement: null // Clear selection when redoing
      };
    });
  },

  // Group multiple elements into a group element
  groupElements: (ids) => {
    const elementsToGroup = get().elements.filter(el => ids.includes(el.id));
    if (elementsToGroup.length < 2) return '';
    
    // Calculate bounding box
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    
    elementsToGroup.forEach(el => {
      if ('x' in el && 'y' in el && 'z' in el) {
        // Elements with center points and dimensions
        const halfWidth = el.width ? el.width / 2 : 0;
        const halfHeight = el.height ? el.height / 2 : 0;
        const halfDepth = el.depth ? el.depth / 2 : 0;
        const radius = el.radius || 0;
        
        // Update min/max coordinates
        minX = Math.min(minX, el.x - Math.max(halfWidth, radius));
        minY = Math.min(minY, el.y - Math.max(halfHeight, radius));
        minZ = Math.min(minZ, el.z - Math.max(halfDepth, radius));
        maxX = Math.max(maxX, el.x + Math.max(halfWidth, radius));
        maxY = Math.max(maxY, el.y + Math.max(halfHeight, radius));
        maxZ = Math.max(maxZ, el.z + Math.max(halfDepth, radius));
      } else if ('x1' in el && 'y1' in el && 'z1' in el && 
                'x2' in el && 'y2' in el && 'z2' in el) {
        // Line elements with start and end points
        minX = Math.min(minX, el.x1, el.x2);
        minY = Math.min(minY, el.y1, el.y2);
        minZ = Math.min(minZ, el.z1, el.z2);
        maxX = Math.max(maxX, el.x1, el.x2);
        maxY = Math.max(maxY, el.y1, el.y2);
        maxZ = Math.max(maxZ, el.z1, el.z2);
      }
    });
    
    // Create a group element
    const layerState = useLayerStore.getState();
    const activeLayerId = layerState.activeLayer;
    
    if (!activeLayerId) {
      console.warn('No active layer selected. Cannot create group.');
      return '';
    }
    
    const width = maxX - minX;
    const height = maxY - minY;
    const depth = maxZ - minZ;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const centerZ = (minZ + maxZ) / 2;
    
    const groupId = uuidv4();
    const groupElement = {
      id: groupId,
      type: 'group',
      layerId: activeLayerId,
      x: centerX,
      y: centerY,
      z: centerZ,
      width,
      height,
      depth,
      elements: elementsToGroup.map(el => ({
        ...el,
        originalId: el.id // Keep reference to original ID
      }))
    };
    
    // Add the group and remove individual elements
    set((state) => {
      const newElements = state.elements.filter(el => !ids.includes(el.id));
      newElements.push(groupElement);
      
      // Save state to history
      const newHistory = state.history.slice(0, state.currentHistoryIndex + 1);
      newHistory.push(newElements);
      
      return {
        elements: newElements,
        selectedElement: groupElement,
        selectedElements: [groupId],
        history: newHistory,
        currentHistoryIndex: state.currentHistoryIndex + 1
      };
    });
    
    return groupId;
  },

  // Ungroup a group element
  ungroupElement: (groupId) => {
    const group = get().elements.find(el => el.id === groupId && el.type === 'group');
    if (!group || !group.elements || group.elements.length === 0) return;
    
    // Extract the group's elements and restore their original IDs
    const ungroupedElements = group.elements.map((el: { originalId: any; }) => {
      // Create new IDs to avoid conflicts
      return {
        ...el,
        id: el.originalId || uuidv4() // Use original ID if available, otherwise create new
      };
    });
    
    // Add the individual elements back and remove the group
    set((state) => {
      const newElements = state.elements.filter(el => el.id !== groupId);
      newElements.push(...ungroupedElements);
      
      // Save state to history
      const newHistory = state.history.slice(0, state.currentHistoryIndex + 1);
      newHistory.push(newElements);
      
      return {
        elements: newElements,
        selectedElement: null,
        selectedElements: ungroupedElements.map((el: { id: any; }) => el.id),
        history: newHistory,
        currentHistoryIndex: state.currentHistoryIndex + 1
      };
    });
  }
}));