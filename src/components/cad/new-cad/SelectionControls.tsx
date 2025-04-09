// src/components/cad/SelectionControls.tsx
import React, { useState } from 'react';
import { 
  Move, Trash2, Copy, Layers, Box, Edit, Minimize2, Maximize2,
  ToggleLeft, ToggleRight, Eye, EyeOff, Lock, Unlock,
  Tool
} from 'react-feather';
import { useSelectionStore, SelectionBounds } from 'src/store/selectorStore';
import { useElementsStore } from 'src/store/elementsStore';
import { useLayerStore } from 'src/store/layerStore';
import { useCADStore } from 'src/store/cadStore';
import { motion } from 'framer-motion';

interface SelectionControlsProps {
  isSelectionMode: boolean;
  isMultiSelectMode: boolean;
  onSelectionModeChange: (active: boolean) => void;
  onMultiSelectModeToggle: () => void;
  onDeleteSelected: () => void;
  onDuplicateSelected: () => void;
  onMoveToLayer: (layerId: string) => void;
  onCreateComponent: () => void;
  bounds?: SelectionBounds | null;
}

const SelectionControls: React.FC<SelectionControlsProps> = ({
  isSelectionMode,
  isMultiSelectMode,
  onSelectionModeChange,
  onMultiSelectModeToggle,
  onDeleteSelected,
  onDuplicateSelected,
  onMoveToLayer,
  onCreateComponent,
  bounds
}) => {
  const { selectedElementIds } = useSelectionStore();
  const { elements, updateElement } = useElementsStore();
  const { layers } = useLayerStore();
  const [showLayerDropdown, setShowLayerDropdown] = useState(false);
  const [showVisibilityMenu, setShowVisibilityMenu] = useState(false);
  
  const selectedCount = selectedElementIds.length;
  const hasSelection = selectedCount > 0;
  
  // Get selected elements
  const selectedElements = elements.filter(el => selectedElementIds.includes(el.id));
  
  // Check if all selected elements are visible/locked
  const allVisible = selectedElements.every(el => el.visible !== false);
  const allHidden = selectedElements.every(el => el.visible === false);
  const allLocked = selectedElements.every(el => el.locked === true);
  const allUnlocked = selectedElements.every(el => el.locked !== true);
  
  // Toggle visibility for all selected elements
  const toggleVisibility = () => {
    // If all are visible, hide all. Otherwise, show all.
    const newVisibility = !allVisible;
    selectedElementIds.forEach(id => {
      updateElement(id, { visible: newVisibility });
    });
  };
  
  // Toggle locked state for all selected elements
  const toggleLocked = () => {
    // If all are locked, unlock all. Otherwise, lock all.
    const newLocked = !allLocked;
    selectedElementIds.forEach(id => {
      updateElement(id, { locked: newLocked });
    });
  };
  
  // Handle move to layer
  const handleMoveToLayer = (layerId: string) => {
    onMoveToLayer(layerId);
    setShowLayerDropdown(false);
  };
  
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-2 flex flex-col"
    >
      {/* Selection mode toggle */}
      <div className="mb-2 pb-2 border-b dark:border-gray-700">
        <button
          className={`flex items-center px-3 py-1.5 rounded text-sm w-full ${
            isSelectionMode 
              ? 'bg-blue-500 text-white' 
              : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
          }`}
          onClick={() => onSelectionModeChange(!isSelectionMode)}
        >
          <Tool size={16} className="mr-2" />
          Selection Tool
        </button>
      </div>
      
      {/* Selection stats */}
      {hasSelection && (
        <div className="mb-2 text-sm text-gray-700 dark:text-gray-300">
          <div className="flex justify-between items-center">
            <span>{selectedCount} selected</span>
            {bounds && (
              <span className="text-xs text-gray-500">
                {Math.round(bounds.width)}×{Math.round(bounds.height)}
              </span>
            )}
          </div>
        </div>
      )}
      
      {/* Multi-select mode */}
      <div className="mb-2 flex items-center">
        <button
          className={`flex items-center px-2 py-1 rounded text-xs ${
            isMultiSelectMode
              ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
          }`}
          onClick={onMultiSelectModeToggle}
        >
          {isMultiSelectMode ? (
            <>
              <ToggleRight size={14} className="mr-1" />
              Multi-select On
            </>
          ) : (
            <>
              <ToggleLeft size={14} className="mr-1" />
              Multi-select Off
            </>
          )}
        </button>
      </div>
      
      {/* Selection actions */}
      {hasSelection && (
        <div className="space-y-1">
          <div className="flex space-x-1">
            <button
              className="flex-1 flex items-center justify-center px-2 py-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-xs"
              onClick={toggleVisibility}
              title={allVisible ? 'Hide selected' : 'Show selected'}
            >
              {allVisible ? (
                <>
                  <EyeOff size={12} className="mr-1" />
                  Hide
                </>
              ) : (
                <>
                  <Eye size={12} className="mr-1" />
                  Show
                </>
              )}
            </button>
            
            <button
              className="flex-1 flex items-center justify-center px-2 py-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-xs"
              onClick={toggleLocked}
              title={allLocked ? 'Unlock selected' : 'Lock selected'}
            >
              {allLocked ? (
                <>
                  <Unlock size={12} className="mr-1" />
                  Unlock
                </>
              ) : (
                <>
                  <Lock size={12} className="mr-1" />
                  Lock
                </>
              )}
            </button>
          </div>
          
          <div className="flex space-x-1">
            <button
              className="flex-1 flex items-center justify-center px-2 py-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-xs"
              onClick={onDuplicateSelected}
              title="Duplicate selected elements"
            >
              <Copy size={12} className="mr-1" />
              Duplicate
            </button>
            
            <button
              className="flex-1 flex items-center justify-center px-2 py-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-xs"
              onClick={() => useCADStore.getState().setActiveTool('move')}
              title="Move selected elements"
            >
              <Move size={12} className="mr-1" />
              Move
            </button>
          </div>
          
          <div className="relative">
            <button
              className="w-full flex items-center justify-center px-2 py-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-xs"
              onClick={() => setShowLayerDropdown(!showLayerDropdown)}
              title="Move to layer"
            >
              <Layers size={12} className="mr-1" />
              Move to Layer
            </button>
            
            {showLayerDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded shadow-lg z-10 max-h-40 overflow-y-auto">
                {layers.map(layer => (
                  <button
                    key={layer.id}
                    className="w-full text-left px-2 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                    onClick={() => handleMoveToLayer(layer.id)}
                  >
                    <div 
                      className="w-2 h-2 rounded-full mr-2" 
                      style={{ backgroundColor: layer.color }} 
                    />
                    {layer.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          
          {selectedCount > 1 && (
            <button
              className="w-full flex items-center justify-center px-2 py-1.5 bg-blue-500 text-white hover:bg-blue-600 rounded text-xs"
              onClick={onCreateComponent}
              title="Create component from selection"
            >
              <Box size={12} className="mr-1" />
              Create Component
            </button>
          )}
          
          <button
            className="w-full flex items-center justify-center px-2 py-1.5 bg-red-500 text-white hover:bg-red-600 rounded text-xs"
            onClick={onDeleteSelected}
            title="Delete selected elements"
          >
            <Trash2 size={12} className="mr-1" />
            Delete
          </button>
        </div>
      )}
    </motion.div>
  );
};

export default SelectionControls;