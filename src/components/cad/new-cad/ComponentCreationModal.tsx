// src/components/cad/ComponentCreationModal.tsx
import React, { useState, useEffect } from 'react';
import { X, Save, Trash2, Eye, EyeOff, Lock, Unlock, Layers, AlertCircle, RefreshCw } from 'react-feather';
import { useElementsStore } from 'src/store/elementsStore';
import { useSelectionStore } from 'src/store/selectorStore';
import { useLayerStore } from 'src/store/layerStore';
import { motion, AnimatePresence } from 'framer-motion';

interface ComponentCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ComponentCreationModal: React.FC<ComponentCreationModalProps> = ({ 
  isOpen, 
  onClose 
}) => {
  const [componentName, setComponentName] = useState('');
  const [componentDescription, setComponentDescription] = useState('');
  const [targetLayer, setTargetLayer] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [advancedSettings, setAdvancedSettings] = useState(false);
  const [keepOriginals, setKeepOriginals] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { selectedElementIds } = useSelectionStore();
  const { elements } = useElementsStore();
  const { layers, activeLayer } = useLayerStore();
  
  // Selected elements
  const selectedElements = elements.filter(el => 
    selectedElementIds.includes(el.id)
  );
  
  // Calculate bounds for preview
  const bounds = useSelectionStore.getState().getSelectionBounds();
  
  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      // Auto-generate a name based on element types
      const typeCount: Record<string, number> = {};
      selectedElements.forEach(el => {
        if (!typeCount[el.type]) typeCount[el.type] = 0;
        typeCount[el.type]++;
      });
      
      const typesString = Object.entries(typeCount)
        .map(([type, count]) => `${count}×${type}`)
        .join('-');
      
      setComponentName(`Component-${typesString}`);
      setComponentDescription('');
      setTargetLayer(activeLayer);
      setTags([]);
      setTagInput('');
      setAdvancedSettings(false);
      setKeepOriginals(false);
      setError(null);
    }
  }, [isOpen, selectedElements, activeLayer]);
  
  // Add a tag
  const addTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput('');
    }
  };
  
  // Remove a tag
  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };
  
  // Handle tag input key press
  const handleTagKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag();
    } else if (e.key === ',' || e.key === ' ') {
      e.preventDefault();
      addTag();
    }
  };
  
  const handleCreateComponent = () => {
    if (!componentName.trim()) {
      setError('Component name is required');
      return;
    }
    
    if (selectedElements.length === 0) {
      setError('No elements selected');
      return;
    }
    
    if (!targetLayer) {
      setError('Target layer is required');
      return;
    }
    
    try {
      // If we need to keep the originals, we can't use the built-in saveAsComponent
      // because it deletes the original elements
      let newComponentId: string;
      
      if (keepOriginals) {
        // Create component without deleting originals
        // Get selection bounds
        if (!bounds) {
          setError('Could not calculate component bounds');
          return;
        }
        
        // Create a new component manually
        const componentId = useElementsStore.getState().addElement({
          type: 'component',
          name: componentName,
          description: componentDescription,
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
          layerId: targetLayer,
          tags: tags,
          // Add metadata for CAM processing
          metadata: {
            createdAt: new Date().toISOString(),
            isComposite: true,
            elementCount: selectedElements.length,
            elementTypes: Array.from(new Set(selectedElements.map(el => el.type))),
            originalElements: selectedElements.map(el => el.id)
          }
        });
        newComponentId = componentId;
      } else {
        // Use the built-in function that deletes original elements
        newComponentId = useSelectionStore.getState().saveAsComponent();
        
        if (!newComponentId) {
          setError('Failed to create component');
          return;
        }
        
        // Update the new component with additional properties
        useElementsStore.getState().updateElement(newComponentId, {
          name: componentName,
          description: componentDescription,
          layerId: targetLayer,
          tags: tags
        });
      }
      
      // Clean up and close the modal
      onClose();
    } catch (error) {
      console.error('Error creating component:', error);
      setError('An error occurred while creating the component');
    }
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="bg-white dark:bg-gray-800 dark:text-white rounded-lg shadow-xl w-full max-w-md"
      >
        <div className="flex justify-between items-center border-b p-4">
          <h2 className="text-lg font-medium">Create Component</h2>
          <button 
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        
        <div className="p-4">
          {error && (
            <div className="mb-4 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 p-3 rounded flex items-start">
              <AlertCircle size={18} className="mr-2 flex-shrink-0 mt-0.5" />
              <div>{error}</div>
            </div>
          )}
          
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">
              Component Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              className="w-full p-2 border dark:border-gray-600 dark:bg-gray-700 rounded"
              value={componentName}
              onChange={(e) => setComponentName(e.target.value)}
              placeholder="Enter component name"
              required
            />
          </div>
          
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">
              Description
            </label>
            <textarea
              className="w-full p-2 border dark:border-gray-600 dark:bg-gray-700 rounded"
              value={componentDescription}
              onChange={(e) => setComponentDescription(e.target.value)}
              placeholder="Optional description"
              rows={3}
            />
          </div>
          
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">
              Target Layer <span className="text-red-500">*</span>
            </label>
            <select
              className="w-full p-2 border dark:border-gray-600 dark:bg-gray-700 rounded"
              value={targetLayer || activeLayer}
              onChange={(e) => setTargetLayer(e.target.value)}
              required
            >
              <option value="">Select Layer</option>
              {layers.map(layer => (
                <option key={layer.id} value={layer.id}>
                  {layer.name}
                </option>
              ))}
            </select>
          </div>
          
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">
              Tags
            </label>
            <div className="flex items-center">
              <input
                type="text"
                className="flex-1 p-2 border dark:border-gray-600 dark:bg-gray-700 rounded"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyPress}
                placeholder="Add tags (press Enter or comma)"
              />
              <button
                className="ml-2 px-3 py-2 bg-blue-500 text-white rounded"
                onClick={addTag}
              >
                Add
              </button>
            </div>
            
            {tags.length > 0 && (
              <div className="flex flex-wrap mt-2">
                {tags.map(tag => (
                  <div 
                    key={tag} 
                    className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded-full text-sm mr-2 mb-2 flex items-center"
                  >
                    {tag}
                    <button
                      className="ml-1 text-blue-600 dark:text-blue-400 hover:text-blue-800"
                      onClick={() => removeTag(tag)}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <div className="mb-4">
            <button
              className="text-sm text-blue-600 dark:text-blue-400 flex items-center"
              onClick={() => setAdvancedSettings(!advancedSettings)}
            >
              {advancedSettings ? 'Hide' : 'Show'} Advanced Settings
            </button>
            
            <AnimatePresence>
              {advancedSettings && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="mt-2 p-3 border rounded dark:border-gray-600 overflow-hidden"
                >
                  <div className="flex items-center mb-2">
                    <input
                      type="checkbox"
                      id="keepOriginals"
                      checked={keepOriginals}
                      onChange={(e) => setKeepOriginals(e.target.checked)}
                      className="mr-2"
                    />
                    <label htmlFor="keepOriginals" className="text-sm">
                      Keep original elements
                    </label>
                  </div>
                  
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    When enabled, original elements will be preserved and the component will be created as a copy.
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          
          <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded mb-4">
            <div className="text-sm font-medium mb-2 flex justify-between items-center">
              <span>Selected Elements ({selectedElements.length})</span>
              {bounds && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Size: {Math.round(bounds.width)}×{Math.round(bounds.height)}×{Math.round(bounds.depth)}
                </span>
              )}
            </div>
            <div className="max-h-40 overflow-y-auto">
              {selectedElements.map(element => (
                <div 
                  key={element.id}
                  className="text-sm py-1 border-b border-gray-200 dark:border-gray-600 last:border-b-0 flex justify-between items-center"
                >
                  <div className="flex items-center">
                    <div className="w-4 h-4 mr-2 text-gray-600 dark:text-gray-300">
                      {element.type === 'rectangle' && <div className="w-4 h-3 border border-current" />}
                      {element.type === 'circle' && <div className="w-4 h-4 rounded-full border border-current" />}
                      {element.type === 'line' && <div className="w-4 h-0.5 bg-current" />}
                      {element.type === 'cube' && <div className="w-4 h-4 bg-current opacity-30" />}
                      {element.type === 'sphere' && <div className="w-4 h-4 rounded-full bg-current opacity-30" />}
                      {element.type === 'component' && <div className="w-4 h-4 border border-current border-dashed" />}
                    </div>
                    <span>
                      {element.name || `${element.type}-${element.id.slice(0, 6)}`}
                    </span>
                  </div>
                  <div className="flex items-center space-x-1">
                    {element.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                    {element.locked ? <Lock size={12} /> : <Unlock size={12} />}
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <div className="flex justify-end space-x-3">
            <button
              className="px-4 py-2 border dark:border-gray-600 rounded"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="px-4 py-2 bg-blue-500 text-white rounded flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleCreateComponent}
              disabled={!componentName.trim() || selectedElements.length === 0 || !targetLayer}
            >
              <Save size={16} className="mr-2" />
              Create Component
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default ComponentCreationModal;