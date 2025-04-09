// src/hooks/useCADShortcuts.ts
import { useCallback, useEffect, useState } from 'react';
import { useElementsStore } from 'src/store/elementsStore';

import { useCADStore } from 'src/store/cadStore';
import { useLayerStore } from 'src/store/layerStore';
import { useSelectionStore } from '../store/selectorStore';

export function useCADShortcuts() {
  const { deleteElement, undo, redo, addElements } = useElementsStore();
  const { 
    selectedElementIds, 
    clearSelection, 
    saveAsComponent, 
    duplicateSelection,
    deleteSelection 
  } = useSelectionStore();
  const { setViewMode, setActiveTool, toggleGrid, toggleAxis } = useCADStore();
  const { activeLayer, layers } = useLayerStore();
  
  // Track modifier keys
  const [modifiers, setModifiers] = useState({
    ctrl: false,
    shift: false,
    alt: false,
    meta: false
  });
  
  // Handle modifier key down
  const handleModifierDown = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Control' || event.key === 'Meta') {
      setModifiers(prev => ({ ...prev, ctrl: true, meta: true }));
      useCADStore.getState().setCtrlKeyPressed(true);
    } else if (event.key === 'Shift') {
      setModifiers(prev => ({ ...prev, shift: true }));
      useCADStore.getState().setShiftKeyPressed(true);
    } else if (event.key === 'Alt') {
      setModifiers(prev => ({ ...prev, alt: true }));
      useCADStore.getState().setAltKeyPressed(true);
    }
  }, []);
  
  // Handle modifier key up
  const handleModifierUp = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Control' || event.key === 'Meta') {
      setModifiers(prev => ({ ...prev, ctrl: false, meta: false }));
      useCADStore.getState().setCtrlKeyPressed(false);
    } else if (event.key === 'Shift') {
      setModifiers(prev => ({ ...prev, shift: false }));
      useCADStore.getState().setShiftKeyPressed(false);
    } else if (event.key === 'Alt') {
      setModifiers(prev => ({ ...prev, alt: false }));
      useCADStore.getState().setAltKeyPressed(false);
    }
  }, []);
  
  // Main key down handler
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Ignora se si sta editando un input
    if (
      event.target instanceof HTMLInputElement || 
      event.target instanceof HTMLTextAreaElement ||
      event.target instanceof HTMLSelectElement
    ) {
      return;
    }
    
    // Combinazioni Ctrl/Meta + [key]
    if (event.ctrlKey || event.metaKey) {
      switch (event.key.toLowerCase()) {
        case 'a': // Seleziona tutti gli elementi
          event.preventDefault();
          const allElements = useElementsStore.getState().elements;
          useSelectionStore.getState().selectMultiple(
            allElements.filter(el => !el.locked).map(el => el.id)
          );
          break;
          
        case 'c': // Copia elementi selezionati
          if (selectedElementIds.length > 0) {
            event.preventDefault();
            const elementsToCopy = useElementsStore.getState().elements.filter(el => 
              selectedElementIds.includes(el.id)
            );
            
            // Store in localStorage with expiration
            const copyData = {
              timestamp: Date.now(),
              elements: elementsToCopy
            };
            localStorage.setItem('cadClipboard', JSON.stringify(copyData));
            
            // Visual feedback che il sistema ha copiato
            showToast('Elements copied to clipboard');
          }
          break;
          
        case 'v': // Incolla elementi copiati
          event.preventDefault();
          try {
            const clipboardJSON = localStorage.getItem('cadClipboard');
            if (clipboardJSON) {
              const clipboard = JSON.parse(clipboardJSON);
              
              // Check if clipboard data is recent (< 1 hour)
              const isRecent = Date.now() - clipboard.timestamp < 3600000;
              if (!isRecent) {
                showToast('Clipboard data expired', 'error');
                return;
              }
              
              // Get paste position - either at mouse cursor or with small offset from original
              const mousePosition = useElementsStore.getState().mousePosition;
              
              // Generate new ID for each element and add offset for visibility
              const newElements = clipboard.elements.map((el: any) => {
                const { id, ...rest } = el;
                
                // Offset from original position
                const offsetX = rest.x + 20;
                const offsetY = rest.y + 20;
                
                // Or use mouse position if available
                const x = mousePosition.x || offsetX;
                const y = mousePosition.y || offsetY;
                
                return {
                  ...rest,
                  x,
                  y,
                  layerId: activeLayer // Paste to active layer
                };
              });
              
              // Add elements and get new IDs
              const newIds = addElements(newElements);
              
              // Select pasted elements
              useSelectionStore.getState().selectMultiple(newIds);
              
              showToast('Elements pasted');
            } else {
              showToast('Nothing to paste', 'warning');
            }
          } catch (error) {
            console.error('Error pasting elements:', error);
            showToast('Error pasting elements', 'error');
          }
          break;
          
        case 'd': // Duplicate selection
          if (selectedElementIds.length > 0) {
            event.preventDefault();
            duplicateSelection();
            showToast('Elements duplicated');
          }
          break;
          
        case 'g': // Raggruppa elementi selezionati
          if (selectedElementIds.length > 1) {
            event.preventDefault();
            saveAsComponent();
            showToast('Component created');
          } else {
            showToast('Select multiple elements to create a component', 'warning');
          }
          break;
          
        case 'z': // Undo/Redo
          event.preventDefault();
          if (event.shiftKey) {
            redo();
            showToast('Redo');
          } else {
            undo();
            showToast('Undo');
          }
          break;
          
        case 'y': // Redo (alternative)
          event.preventDefault();
          redo();
          showToast('Redo');
          break;
          
        // Switch view modes
        case '1': // 3D view
          event.preventDefault();
          setViewMode('3d');
          showToast('3D View');
          break;
          
        case '2': // 2D view
          event.preventDefault();
          setViewMode('2d');
          showToast('2D View');
          break;
          
        // Toggle grid and axis
        case 'g':
          if (event.shiftKey) {
            event.preventDefault();
            toggleGrid();
            showToast(useCADStore.getState().gridVisible ? 'Grid visible' : 'Grid hidden');
          }
          break;
          
        case 'l':
          if (event.shiftKey) {
            event.preventDefault();
            // Toggle layer panel
            const layerPanelVisible = useCADStore.getState().layerPanelVisible;
            useCADStore.getState().setLayerPanelVisible(!layerPanelVisible);
            showToast(layerPanelVisible ? 'Layer panel hidden' : 'Layer panel visible');
          }
          break;
          
        case 'e':
          if (event.shiftKey) {
            event.preventDefault();
            // Toggle elements panel
            const elementsPanelVisible = useCADStore.getState().elementsPanelVisible;
            useCADStore.getState().setElementsPanelVisible(!elementsPanelVisible);
            showToast(elementsPanelVisible ? 'Elements panel hidden' : 'Elements panel visible');
          }
          break;
      }
      return;
    }
    
    // Standard shortcuts (senza Ctrl)
    switch (event.key) {
      case 'Escape': // Deseleziona tutto
        if (useCADStore.getState().activeTool !== 'select') {
          // If in a tool mode, return to select mode first
          setActiveTool('select');
          showToast('Select tool');
        } else {
          // Otherwise, clear selection
          clearSelection();
          showToast('Selection cleared');
        }
        break;
        
      case 'Delete':
      case 'Backspace': // Elimina elementi selezionati
        if (selectedElementIds.length > 0) {
          event.preventDefault();
          deleteSelection();
          showToast(`Deleted ${selectedElementIds.length} element(s)`);
        }
        break;
        
      // Shortcut per strumenti
      case 'v': // Select (V for Vector select)
        setActiveTool('select');
        showToast('Select tool');
        break;
        
      case 'm': // Move tool
        if (selectedElementIds.length > 0) {
          setActiveTool('move');
          showToast('Move tool');
        } else {
          showToast('Select elements to move', 'warning');
        }
        break;
        
      
      
        
      // Number keys 1-9 for layers
      case '1':
      case '2':
      case '3':
      case '4':
      case '5':
      case '6':
      case '7':
      case '8':
      case '9':
        // If Alt is pressed, switch to layer by index
        if (event.altKey && layers.length > 0) {
          const layerIndex = parseInt(event.key) - 1;
          if (layerIndex >= 0 && layerIndex < layers.length) {
            const targetLayer = layers[layerIndex];
            useLayerStore.getState().setActiveLayer(targetLayer.id);
            showToast(`Layer: ${targetLayer.name}`);
          }
        }
        break;
    }
  }, [
    selectedElementIds, 
    clearSelection, 
    deleteElement, 
    undo, 
    redo, 
    saveAsComponent, 
    setViewMode, 
    setActiveTool,
    toggleGrid,
    toggleAxis,
    duplicateSelection,
    deleteSelection,
    addElements,
    activeLayer,
    layers
  ]);
  
  // Register event listeners
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keydown', handleModifierDown);
    document.addEventListener('keyup', handleModifierUp);
    
    // Reset modifiers on window blur (prevent "stuck" modifier keys)
    window.addEventListener('blur', () => {
      setModifiers({ ctrl: false, shift: false, alt: false, meta: false });
      useCADStore.getState().setCtrlKeyPressed(false);
      useCADStore.getState().setShiftKeyPressed(false);
      useCADStore.getState().setAltKeyPressed(false);
    });
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keydown', handleModifierDown);
      document.removeEventListener('keyup', handleModifierUp);
      window.removeEventListener('blur', () => {});
    };
  }, [handleKeyDown, handleModifierDown, handleModifierUp]);
  
  // Helper function to show toast messages
  const showToast = (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    // Check if toast module is available
    if (typeof window !== 'undefined' && window.toast) {
      window.toast[type](message);
    } else {
      console.log(`[${type.toUpperCase()}] ${message}`);
    }
  };
  
  return null; // Non renderizza nulla, è solo un hook
}

// Add this type declaration to ensure TypeScript recognizes the toast property on window
declare global {
  interface Window {
    toast?: {
      info: (message: string) => void;
      success: (message: string) => void;
      warning: (message: string) => void;
      error: (message: string) => void;
    };
  }
}