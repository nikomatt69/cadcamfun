import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  MousePointer, 
  Copy, 
  Trash2, 
  Layers, 
  Save, 
  Package,
  ChevronRight,
  ChevronDown,
  AlertCircle
} from 'react-feather';
import { useElementsStore } from 'src/store/elementsStore';
import { useLayerStore } from 'src/store/layerStore';
import toast from 'react-hot-toast';

interface SelectionControlsProps {
  isSelectionMode: boolean;
  isMultiSelectMode: boolean;
  onSelectionModeChange: (active: boolean) => void;
  onMultiSelectModeToggle: () => void;
  onDeleteSelected: () => void;
  onDuplicateSelected: () => void;
  onMoveToLayer?: (layerId: string) => void;
  onCreateComponent?: () => void;
  bounds?: {
    width: number;
    height: number;
    depth: number;
  } | null;
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
  const [showLayerOptions, setShowLayerOptions] = useState(false);
  const [showComponentForm, setShowComponentForm] = useState(false);
  const [componentName, setComponentName] = useState('');
  const [componentDescription, setComponentDescription] = useState('');

  const { selectedElements } = useElementsStore();
  const { layers } = useLayerStore();

  const hasSelection = selectedElements.length > 0;

  const handleCreateComponent = () => {
    if (!componentName.trim()) {
      toast.error('Please enter a component name');
      return;
    }

    if (onCreateComponent) {
      onCreateComponent();
      setShowComponentForm(false);
      setComponentName('');
      setComponentDescription('');
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 shadow-md rounded-md p-3">
      <div className="flex flex-col space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Selection Tools</h3>
          
          <div className="flex items-center space-x-1">
            <motion.button
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onSelectionModeChange(!isSelectionMode)}
              className={`p-1.5 rounded-md ${
                isSelectionMode 
                  ? 'bg-blue-500 text-white' 
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
              }`}
              title="Selection Mode"
            >
              <MousePointer size={16} />
            </motion.button>
          </div>
        </div>

        {isSelectionMode && (
          <div className="flex flex-col mt-2 space-y-3">
            <div className="flex items-center">
              <input
                id="multi-select"
                type="checkbox"
                checked={isMultiSelectMode}
                onChange={onMultiSelectModeToggle}
                className="h-4 w-4 text-blue-600 rounded border-gray-300 dark:border-gray-600 focus:ring-blue-500"
              />
              <label htmlFor="multi-select" className="ml-2 text-xs text-gray-700 dark:text-gray-300">
                Multi-select Mode
              </label>
            </div>

            <div className={`flex space-x-2 ${!hasSelection ? 'opacity-50 pointer-events-none' : ''}`}>
              <motion.button
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.95 }}
                onClick={onDeleteSelected}
                disabled={!hasSelection}
                className="p-1.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-md hover:bg-red-200 dark:hover:bg-red-900/50"
                title="Delete Selected"
              >
                <Trash2 size={16} />
              </motion.button>
              
              <motion.button
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.95 }}
                onClick={onDuplicateSelected}
                disabled={!hasSelection}
                className="p-1.5 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-md hover:bg-green-200 dark:hover:bg-green-900/50"
                title="Duplicate Selected"
              >
                <Copy size={16} />
              </motion.button>
              
              <motion.button
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowLayerOptions(prev => !prev)}
                disabled={!hasSelection}
                className="p-1.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-md hover:bg-indigo-200 dark:hover:bg-indigo-900/50"
                title="Move to Layer"
              >
                <Layers size={16} />
              </motion.button>
              
              <motion.button
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowComponentForm(prev => !prev)}
                disabled={!hasSelection}
                className="p-1.5 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-md hover:bg-purple-200 dark:hover:bg-purple-900/50"
                title="Save as Component"
              >
                <Package size={16} />
              </motion.button>
            </div>

            {/* Selection statistics */}
            {hasSelection && bounds && (
              <div className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50 p-2 rounded-md">
                <p><span className="font-medium">Selected:</span> {selectedElements.length} elements</p>
                <p><span className="font-medium">Size:</span> {bounds.width.toFixed(1)} x {bounds.height.toFixed(1)} x {bounds.depth.toFixed(1)}</p>
              </div>
            )}

            {/* Layer selection dropdown */}
            {showLayerOptions && hasSelection && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-md p-2"
              >
                <h4 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Move to Layer</h4>
                <div className="max-h-32 overflow-y-auto">
                  {layers.length > 0 ? (
                    layers.map(layer => (
                      <button
                        key={layer.id}
                        onClick={() => {
                          onMoveToLayer?.(layer.id);
                          setShowLayerOptions(false);
                        }}
                        className="w-full text-left px-2 py-1 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                      >
                        <div className="flex items-center">
                          <div 
                            className="w-3 h-3 rounded-full mr-2" 
                            style={{ backgroundColor: layer.color }}
                          />
                          <span>{layer.name}</span>
                        </div>
                      </button>
                    ))
                  ) : (
                    <p className="text-xs text-gray-500 dark:text-gray-400">No layers available</p>
                  )}
                </div>
              </motion.div>
            )}

            {/* Component form */}
            {showComponentForm && hasSelection && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-md p-3"
              >
                <h4 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Save as Component</h4>
                
                <div className="space-y-3">
                  <div>
                    <label htmlFor="componentName" className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                      Component Name*
                    </label>
                    <input
                      id="componentName"
                      type="text"
                      value={componentName}
                      onChange={e => setComponentName(e.target.value)}
                      className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-900"
                      placeholder="Enter name"
                    />
                  </div>
                  
                  <div>
                    <label htmlFor="componentDescription" className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                      Description
                    </label>
                    <textarea
                      id="componentDescription"
                      value={componentDescription}
                      onChange={e => setComponentDescription(e.target.value)}
                      className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-900"
                      placeholder="Optional description"
                      rows={2}
                    />
                  </div>
                  
                  <div className="flex justify-end space-x-2">
                    <button
                      onClick={() => setShowComponentForm(false)}
                      className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateComponent}
                      className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 focus:ring-2 focus:ring-blue-500"
                    >
                      Create Component
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SelectionControls;