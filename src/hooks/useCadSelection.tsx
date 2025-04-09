import { useCallback, useState, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useElementsStore } from 'src/store/elementsStore';
import { useLayerStore } from 'src/store/layerStore';

export interface SelectionBounds {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  width: number;
  height: number;
  depth: number;
  center: THREE.Vector3;
}

/**
 * Custom hook to manage element selection in CAD canvas
 */
export const useCADSelection = (
  sceneRef: React.RefObject<THREE.Scene>,
  cameraRef: React.RefObject<THREE.Camera>,
  canvasRef: React.RefObject<HTMLDivElement>
) => {
  // Reference to store raycaster for mouse interaction
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2());
  
  // Selection box for marquee selection
  const [selectionBox, setSelectionBox] = useState<{
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    active: boolean;
  } | null>(null);
  
  // Track whether we're in multi-select mode 
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  
  // Track whether we're in selection mode
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  // Track visual element for selection box
  const selectionBoxElementRef = useRef<HTMLDivElement | null>(null);

  // Get data from stores
  const { 
    elements, 
    selectedElement, 
    selectedElements, 
    selectElement, 
    toggleElementSelection, 
    clearSelectedElements, 
    updateElement, 
    addElements,
    clearSelection, 
    deleteElement,
    getElementsByLayerId
  } = useElementsStore();

  const { layers, activeLayer } = useLayerStore();

  // Create a visual selection box element
  useEffect(() => {
    if (!selectionBoxElementRef.current && canvasRef.current) {
      const elem = document.createElement('div');
      elem.style.position = 'absolute';
      elem.style.border = '1px dashed #4a90e2';
      elem.style.backgroundColor = 'rgba(74, 144, 226, 0.1)';
      elem.style.pointerEvents = 'none';
      elem.style.zIndex = '100';
      elem.style.display = 'none';
      canvasRef.current.appendChild(elem);
      selectionBoxElementRef.current = elem;
    }

    return () => {
      if (selectionBoxElementRef.current && canvasRef.current) {
        canvasRef.current.removeChild(selectionBoxElementRef.current);
        selectionBoxElementRef.current = null;
      }
    };
  }, [canvasRef]);

  // Update the visual selection box
  useEffect(() => {
    const selBoxElem = selectionBoxElementRef.current;
    if (!selBoxElem) return;

    if (selectionBox && selectionBox.active) {
      const minX = Math.min(selectionBox.startX, selectionBox.endX);
      const maxX = Math.max(selectionBox.startX, selectionBox.endX);
      const minY = Math.min(selectionBox.startY, selectionBox.endY);
      const maxY = Math.max(selectionBox.startY, selectionBox.endY);
      
      selBoxElem.style.display = 'block';
      selBoxElem.style.left = `${minX}px`;
      selBoxElem.style.top = `${minY}px`;
      selBoxElem.style.width = `${maxX - minX}px`;
      selBoxElem.style.height = `${maxY - minY}px`;
    } else {
      selBoxElem.style.display = 'none';
    }
  }, [selectionBox]);

  // Create selection box
  const startSelectionBox = useCallback((x: number, y: number) => {
    if (!isSelectionMode && !isMultiSelectMode) return;

    setSelectionBox({
      startX: x,
      startY: y,
      endX: x,
      endY: y,
      active: true
    });
  }, [isSelectionMode, isMultiSelectMode]);

  // Update selection box as mouse moves
  const updateSelectionBox = useCallback((x: number, y: number) => {
    if (selectionBox && selectionBox.active) {
      setSelectionBox({
        ...selectionBox,
        endX: x,
        endY: y
      });
    }
  }, [selectionBox]);

  // Complete selection and select all elements in the box
  const endSelectionBox = useCallback(() => {
    if (!selectionBox || !selectionBox.active || !sceneRef.current || !cameraRef.current || !canvasRef.current) {
      setSelectionBox(null);
      return;
    }

    // Calculate normalized coordinates for selection box
    const rect = canvasRef.current.getBoundingClientRect();
    const minX = Math.min(selectionBox.startX, selectionBox.endX);
    const maxX = Math.max(selectionBox.startX, selectionBox.endX);
    const minY = Math.min(selectionBox.startY, selectionBox.endY);
    const maxY = Math.max(selectionBox.startY, selectionBox.endY);

    // If the selection box is too small, treat it as a click
    if (Math.abs(maxX - minX) < 5 && Math.abs(maxY - minY) < 5) {
      setSelectionBox(null);
      return;
    }

    // Find all objects inside the selection box
    const selectedIds: string[] = [];
    const camera = cameraRef.current;
    
    // Convert to normalized device coordinates
    const ndcMin = new THREE.Vector2(
      ((minX - rect.left) / rect.width) * 2 - 1,
      -((minY - rect.top) / rect.height) * 2 + 1
    );
    const ndcMax = new THREE.Vector2(
      ((maxX - rect.left) / rect.width) * 2 - 1,
      -((maxY - rect.top) / rect.height) * 2 + 1
    );
    
    // Get all selectable objects from the scene
    const selectableObjects: THREE.Object3D[] = [];
    sceneRef.current.traverse((child) => {
      if (child.userData?.isCADElement && !child.userData?.isHelper) {
        selectableObjects.push(child);
      }
    });

    // Test each object to see if it's in the selection box
    selectableObjects.forEach(object => {
      if (!object.userData.elementId) return;
      
      // Get element from store
      const element = elements.find(el => el.id === object.userData.elementId);
      if (!element) return;
      
      // Skip if element is on a locked or hidden layer
      const layer = layers.find(l => l.id === element.layerId);
      if (!layer || !layer.visible || layer.locked) return;
      
      // Get object's world position
      const position = new THREE.Vector3();
      if ('x' in element && 'y' in element) {
        position.set(element.x, element.y, element.z || 0);
      } else if ('x1' in element && 'y1' in element) {
        // For lines, use midpoint
        position.set(
          (element.x1 + element.x2) / 2, 
          (element.y1 + element.y2) / 2, 
          ((element.z1 || 0) + (element.z2 || 0)) / 2
        );
      }

      // Project to screen space
      const screenPos = position.clone().project(camera);
      
      // Check if the projected position is within the selection box
      if (
        screenPos.x >= ndcMin.x && screenPos.x <= ndcMax.x &&
        screenPos.y <= ndcMin.y && screenPos.y >= ndcMax.y
      ) {
        selectedIds.push(element.id);
      }
    });

    // Make the selection based on the found objects
    if (selectedIds.length > 0) {
      if (!isMultiSelectMode) {
        clearSelectedElements();
      }
      selectedIds.forEach(id => {
        toggleElementSelection(id);
      });
    } else if (!isMultiSelectMode && !isSelectionMode) {
      clearSelectedElements();
    }

    setSelectionBox(null);
  }, [selectionBox, sceneRef, cameraRef, canvasRef, elements, layers, isMultiSelectMode, isSelectionMode, clearSelectedElements, toggleElementSelection]);

  // Toggle multi-select mode
  const toggleMultiSelectMode = useCallback(() => {
    setIsMultiSelectMode(prev => !prev);
  }, []);

  // Set selection mode
  const setSelectionModeActive = useCallback((active: boolean) => {
    setIsSelectionMode(active);
  }, []);

  // Handle single selection (when clicking directly on elements)
  const handleElementSelection = useCallback((
    elementId: string, 
    isMultiSelect: boolean = false
  ) => {
    // Skip if element is on a locked layer
    const element = elements.find(el => el.id === elementId);
    if (!element) return;
    
    const layer = layers.find(l => l.id === element.layerId);
    if (layer?.locked) return;

    if (isMultiSelect || isMultiSelectMode || isSelectionMode) {
      toggleElementSelection(elementId);
    } else {
      clearSelectedElements();
      toggleElementSelection(elementId);
    }
  }, [toggleElementSelection, clearSelectedElements, isMultiSelectMode, isSelectionMode, elements, layers]);

  // Calculate the bounding box of all selected elements
  const getSelectionBounds = useCallback((): SelectionBounds | null => {
    if (selectedElements.length === 0) return null;
    
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    
    // Find all selected elements and calculate their bounds
    const selectedElementsData = elements.filter(el => 
      selectedElements.includes(el.id)
    );
    
    selectedElementsData.forEach(element => {
      if ('x' in element && 'y' in element) {
        // Handle center/dimensions style elements
        const x = element.x;
        const y = element.y;
        const z = element.z || 0;
        
        let width = 0, height = 0, depth = 0;
        
        if ('width' in element && 'height' in element) {
          width = element.width || 0;
          height = element.height || 0;
          depth = element.depth || 0;
        } else if ('radius' in element) {
          width = element.radius * 2;
          height = element.radius * 2;
          depth = element.radius * 2;
        }
        
        minX = Math.min(minX, x - width/2);
        maxX = Math.max(maxX, x + width/2);
        minY = Math.min(minY, y - height/2);
        maxY = Math.max(maxY, y + height/2);
        minZ = Math.min(minZ, z - depth/2);
        maxZ = Math.max(maxZ, z + depth/2);
      } else if ('x1' in element && 'y1' in element) {
        // Handle line type elements
        minX = Math.min(minX, element.x1, element.x2);
        maxX = Math.max(maxX, element.x1, element.x2);
        minY = Math.min(minY, element.y1, element.y2);
        maxY = Math.max(maxY, element.y1, element.y2);
        minZ = Math.min(minZ, element.z1 || 0, element.z2 || 0);
        maxZ = Math.max(maxZ, element.z1 || 0, element.z2 || 0);
      }
    });
    
    // If we couldn't find valid bounds, return null
    if (minX === Infinity || minY === Infinity) return null;
    
    // Calculate dimensions
    const width = maxX - minX;
    const height = maxY - minY;
    const depth = maxZ - minZ;
    
    // Calculate center
    const center = new THREE.Vector3(
      minX + width / 2,
      minY + height / 2,
      minZ + depth / 2
    );
    
    return {
      minX, minY, minZ,
      maxX, maxY, maxZ,
      width, height, depth,
      center
    };
  }, [elements, selectedElements]);

  // Move all selected elements by a delta
  const moveSelectedElements = useCallback((dx: number, dy: number, dz: number) => {
    selectedElements.forEach(id => {
      const element = elements.find(el => el.id === id);
      if (!element) return;
      
      // Skip if element is on a locked layer
      const layer = layers.find(l => l.id === element.layerId);
      if (layer?.locked) return;
      
      if ('x' in element && 'y' in element) {
        // Move center-based elements
        updateElement(id, {
          x: element.x + dx,
          y: element.y + dy,
          z: (element.z || 0) + dz
        });
      } else if ('x1' in element && 'y1' in element) {
        // Move line-type elements
        updateElement(id, {
          x1: element.x1 + dx,
          y1: element.y1 + dy,
          z1: (element.z1 || 0) + dz,
          x2: element.x2 + dx,
          y2: element.y2 + dy,
          z2: (element.z2 || 0) + dz
        });
      }
    });
  }, [selectedElements, elements, layers, updateElement]);

  // Delete all selected elements
  const deleteSelectedElements = useCallback(() => {
    const elementsToDelete = [...selectedElements];
    clearSelectedElements();
    
    elementsToDelete.forEach(id => {
      const element = elements.find(el => el.id === id);
      if (!element) return;
      
      // Skip if element is on a locked layer
      const layer = layers.find(l => l.id === element.layerId);
      if (layer?.locked) return;
      
      deleteElement(id);
    });
  }, [selectedElements, elements, layers, clearSelectedElements, deleteElement]);

  // Duplicate all selected elements with slight offset
  const duplicateSelectedElements = useCallback(() => {
    const newElements = elements
      .filter(el => selectedElements.includes(el.id))
      .map(element => {
        // Skip if element is on a locked layer
        const layer = layers.find(l => l.id === element.layerId);
        if (layer?.locked) return null;
        
        // Create a deep copy of the element
        const newElement = JSON.parse(JSON.stringify(element));
        delete newElement.id; // Remove the ID to let the store generate a new one
        
        // Offset the new element slightly
        if ('x' in newElement && 'y' in newElement) {
          newElement.x += 20;
          newElement.y += 20;
        } else if ('x1' in newElement && 'y1' in newElement) {
          newElement.x1 += 20;
          newElement.y1 += 20;
          newElement.x2 += 20;
          newElement.y2 += 20;
        }
        
        return newElement;
      })
      .filter(el => el !== null);
    
    // Add all new elements at once
    if (newElements.length > 0) {
      const newIds = addElements(newElements);
      
      // Select the new elements
      clearSelectedElements();
      newIds.forEach(id => toggleElementSelection(id));
    }
  }, [elements, selectedElements, layers, addElements, clearSelectedElements, toggleElementSelection]);

  // Group elements in selection (move to specified layer)
  const moveSelectionToLayer = useCallback((layerId: string) => {
    selectedElements.forEach(id => {
      const element = elements.find(el => el.id === id);
      if (!element) return;
      
      // Skip if element is on a locked layer
      const layer = layers.find(l => l.id === element.layerId);
      if (layer?.locked) return;
      
      updateElement(id, { layerId });
    });
  }, [selectedElements, elements, layers, updateElement]);

  // Create JSON representation of selected elements with normalized positions
  const createSelectionData = useCallback(() => {
    if (selectedElements.length === 0) return null;
    
    const bounds = getSelectionBounds();
    if (!bounds) return null;
    
    const selectionData = elements
      .filter(el => selectedElements.includes(el.id))
      .map(element => {
        // Create a deep copy of the element
        const newElement = JSON.parse(JSON.stringify(element));
        delete newElement.id; // Remove the ID
        
        // Normalize positions relative to center
        if ('x' in newElement && 'y' in newElement) {
          newElement.x = newElement.x - bounds.center.x;
          newElement.y = newElement.y - bounds.center.y;
          if ('z' in newElement) {
            newElement.z = (newElement.z || 0) - bounds.center.z;
          }
        } else if ('x1' in newElement && 'y1' in newElement) {
          newElement.x1 = newElement.x1 - bounds.center.x;
          newElement.y1 = newElement.y1 - bounds.center.y;
          newElement.x2 = newElement.x2 - bounds.center.x;
          newElement.y2 = newElement.y2 - bounds.center.y;
          if ('z1' in newElement && 'z2' in newElement) {
            newElement.z1 = (newElement.z1 || 0) - bounds.center.z;
            newElement.z2 = (newElement.z2 || 0) - bounds.center.z;
          }
        }
        
        return newElement;
      });
    
    return {
      elements: selectionData,
      bounds: {
        width: bounds.width,
        height: bounds.height,
        depth: bounds.depth
      }
    };
  }, [elements, selectedElements, getSelectionBounds]);

  return {
    isMultiSelectMode,
    isSelectionMode,
    toggleMultiSelectMode,
    setSelectionModeActive,
    selectionBox,
    startSelectionBox,
    updateSelectionBox,
    endSelectionBox,
    handleElementSelection,
    getSelectionBounds,
    moveSelectedElements,
    deleteSelectedElements,
    duplicateSelectedElements,
    moveSelectionToLayer,
    createSelectionData,
    mouseRef,
    raycasterRef
  };
};

export default useCADSelection;