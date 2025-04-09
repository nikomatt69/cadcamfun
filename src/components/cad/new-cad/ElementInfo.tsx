// src/components/cad/ElementInfo.tsx
import React, { useState } from 'react';
import { Edit, Trash2, Copy, Move, Eye, EyeOff, Lock, Unlock, Layers, ChevronDown, ChevronRight, X, Save } from 'react-feather';
import { useElementsStore } from 'src/store/elementsStore';
import { useLayerStore } from 'src/store/layerStore';
import { useSelectionStore } from 'src/store/selectorStore';
import { useCADStore } from 'src/store/cadStore';
import { motion, AnimatePresence } from 'framer-motion';
import { Element as CADElement } from 'src/store/elementsStore';

interface ElementInfoProps {
  elementId: string;
  onClose?: () => void;
}

const ElementInfo: React.FC<ElementInfoProps> = ({ elementId, onClose }) => {
  const { elements, updateElement, deleteElement, duplicateElement } = useElementsStore();
  const { layers } = useLayerStore();
  const { clearSelection, ungroupElement } = useSelectionStore();
  const { setActiveTool } = useCADStore();
  
  const [editMode, setEditMode] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    general: true,
    position: true,
    dimensions: true,
    appearance: true,
    metadata: false
  });
  const [editedValues, setEditedValues] = useState<Record<string, any>>({});
  
  const element = elements.find(el => el.id === elementId);
  if (!element) return null;
  
  const layer = layers.find(l => l.id === element.layerId);
  
  // Helper per formattare valori numerici
  const formatNumber = (num: number | undefined) => {
    if (num === undefined) return 'N/A';
    return Number(num.toFixed(2)).toString();
  };
  
  // Toggle section expansion
  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };
  
  // Prepare edited values when entering edit mode
  const startEditing = () => {
    const initialValues: Record<string, any> = {
      name: element.name || '',
      color: element.color || '#1e88e5',
      x: element.x || 0,
      y: element.y || 0,
      z: element.z || 0,
      layerId: element.layerId,
      visible: element.visible !== false,
      locked: element.locked || false
    };
    
    // Add type-specific properties
    switch (element.type) {
      case 'rectangle':
        initialValues.width = element.width || 0;
        initialValues.height = element.height || 0;
        break;
      case 'circle':
        initialValues.radius = element.radius || 0;
        break;
      case 'line':
        initialValues.x1 = element.x1 || 0;
        initialValues.y1 = element.y1 || 0;
        initialValues.z1 = element.z1 || 0;
        initialValues.x2 = element.x2 || 0;
        initialValues.y2 = element.y2 || 0;
        initialValues.z2 = element.z2 || 0;
        initialValues.linewidth = element.linewidth || 1;
        break;
      case 'cube':
        initialValues.width = element.width || 0;
        initialValues.height = element.height || 0;
        initialValues.depth = element.depth || 0;
        break;
      case 'sphere':
        initialValues.radius = element.radius || 0;
        break;
      case 'component':
        // No additional properties for now
        break;
    }
    
    setEditedValues(initialValues);
    setEditMode(true);
  };
  
  // Handle input change
  const handleInputChange = (field: string, value: any) => {
    setEditedValues(prev => ({
      ...prev,
      [field]: value
    }));
  };
  
  // Save changes
  const saveChanges = () => {
    // Convert string values to appropriate types
    const processedValues: Record<string, any> = {};
    
    Object.entries(editedValues).forEach(([key, value]) => {
      if (typeof value === 'string' && !isNaN(Number(value)) && key !== 'name' && key !== 'color' && key !== 'layerId') {
        processedValues[key] = Number(value);
      } else {
        processedValues[key] = value;
      }
    });
    
    updateElement(elementId, processedValues);
    setEditMode(false);
  };
  
  // Cancel editing
  const cancelEditing = () => {
    setEditMode(false);
    setEditedValues({});
  };
  
  // Render a property row in display mode
  const renderProperty = (label: string, value: any, unit: string = '') => (
    <div className="flex items-center justify-between py-1 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
      <span className="text-sm text-gray-600 dark:text-gray-300">{label}</span>
      <span className="font-medium">
        {value}
        {unit && <span className="text-xs ml-1 text-gray-500">{unit}</span>}
      </span>
    </div>
  );
  
  // Render an editable property
  const renderEditableProperty = (label: string, field: string, type: string = 'text', options?: any[]) => {
    const value = editedValues[field];
    
    return (
      <div className="flex items-center justify-between py-1 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
        <label htmlFor={field} className="text-sm text-gray-600 dark:text-gray-300">
          {label}
        </label>
        
        {type === 'select' && options ? (
          <select
            id={field}
            value={value}
            onChange={(e) => handleInputChange(field, e.target.value)}
            className="px-2 py-1 border rounded bg-white dark:bg-gray-700 dark:border-gray-600 text-right"
          >
            {options.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : type === 'checkbox' ? (
          <input
            id={field}
            type="checkbox"
            checked={value}
            onChange={(e) => handleInputChange(field, e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
        ) : type === 'color' ? (
          <input
            id={field}
            type="color"
            value={value}
            onChange={(e) => handleInputChange(field, e.target.value)}
            className="w-10 h-8 p-0 border rounded"
          />
        ) : (
          <input
            id={field}
            type={type}
            value={value}
            onChange={(e) => handleInputChange(field, e.target.value)}
            className="px-2 py-1 border rounded bg-white dark:bg-gray-700 dark:border-gray-600 text-right w-24"
          />
        )}
      </div>
    );
  };
  
  // Get all property sections based on element type
  const renderPropertySections = () => {
    return (
      <div className="space-y-3">
        {/* General section */}
        <div className="border rounded dark:border-gray-700">
          <button
            className="w-full flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded-t"
            onClick={() => toggleSection('general')}
          >
            <span className="font-medium">General</span>
            {expandedSections.general ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
          
          <AnimatePresence>
            {expandedSections.general && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="p-3 overflow-hidden"
              >
                {editMode ? (
                  <>
                    {renderEditableProperty('Name', 'name')}
                    {renderEditableProperty('Type', 'type', 'text', [])}
                    {renderEditableProperty('Layer', 'layerId', 'select', 
                      layers.map(l => ({ value: l.id, label: l.name }))
                    )}
                    {renderEditableProperty('Visible', 'visible', 'checkbox')}
                    {renderEditableProperty('Locked', 'locked', 'checkbox')}
                  </>
                ) : (
                  <>
                    {renderProperty('Name', element.name || `${element.type}-${element.id.slice(0, 6)}`)}
                    {renderProperty('Type', element.type)}
                    {renderProperty('Layer', layer?.name || 'No Layer')}
                    {renderProperty('Visible', element.visible !== false ? 'Yes' : 'No')}
                    {renderProperty('Locked', element.locked ? 'Yes' : 'No')}
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        
        {/* Position section */}
        <div className="border rounded dark:border-gray-700">
          <button
            className="w-full flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded-t"
            onClick={() => toggleSection('position')}
          >
            <span className="font-medium">Position</span>
            {expandedSections.position ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
          
          <AnimatePresence>
            {expandedSections.position && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="p-3 overflow-hidden"
              >
                {editMode ? (
                  <>
                    {renderEditableProperty('X', 'x', 'number')}
                    {renderEditableProperty('Y', 'y', 'number')}
                    {renderEditableProperty('Z', 'z', 'number')}
                    
                    {element.type === 'line' && (
                      <>
                        {renderEditableProperty('X1', 'x1', 'number')}
                        {renderEditableProperty('Y1', 'y1', 'number')}
                        {renderEditableProperty('Z1', 'z1', 'number')}
                        {renderEditableProperty('X2', 'x2', 'number')}
                        {renderEditableProperty('Y2', 'y2', 'number')}
                        {renderEditableProperty('Z2', 'z2', 'number')}
                      </>
                    )}
                  </>
                ) : (
                  <>
                    {renderProperty('X', formatNumber(element.x))}
                    {renderProperty('Y', formatNumber(element.y))}
                    {renderProperty('Z', formatNumber(element.z || 0))}
                    
                    {element.type === 'line' && (
                      <>
                        {renderProperty('X1', formatNumber(element.x1))}
                        {renderProperty('Y1', formatNumber(element.y1))}
                        {renderProperty('Z1', formatNumber(element.z1 || 0))}
                        {renderProperty('X2', formatNumber(element.x2))}
                        {renderProperty('Y2', formatNumber(element.y2))}
                        {renderProperty('Z2', formatNumber(element.z2 || 0))}
                      </>
                    )}
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        
        {/* Dimensions section */}
        {(element.type === 'rectangle' || element.type === 'circle' || 
          element.type === 'cube' || element.type === 'sphere' || 
          element.type === 'component') && (
          <div className="border rounded dark:border-gray-700">
            <button
              className="w-full flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded-t"
              onClick={() => toggleSection('dimensions')}
            >
              <span className="font-medium">Dimensions</span>
              {expandedSections.dimensions ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
            
            <AnimatePresence>
              {expandedSections.dimensions && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="p-3 overflow-hidden"
                >
                  {editMode ? (
                    <>
                      {(element.type === 'rectangle' || element.type === 'cube' || element.type === 'component') && (
                        <>
                          {renderEditableProperty('Width', 'width', 'number')}
                          {renderEditableProperty('Height', 'height', 'number')}
                        </>
                      )}
                      
                      {(element.type === 'cube' || element.type === 'component') && (
                        renderEditableProperty('Depth', 'depth', 'number')
                      )}
                      
                      {(element.type === 'circle' || element.type === 'sphere') && (
                        renderEditableProperty('Radius', 'radius', 'number')
                      )}
                    </>
                  ) : (
                    <>
                      {(element.type === 'rectangle' || element.type === 'cube' || element.type === 'component') && (
                        <>
                          {renderProperty('Width', formatNumber(element.width))}
                          {renderProperty('Height', formatNumber(element.height))}
                        </>
                      )}
                      
                      {(element.type === 'cube' || element.type === 'component') && (
                        renderProperty('Depth', formatNumber(element.depth))
                      )}
                      
                      {(element.type === 'circle' || element.type === 'sphere') && (
                        renderProperty('Radius', formatNumber(element.radius))
                      )}
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
        
        {/* Appearance section */}
        <div className="border rounded dark:border-gray-700">
          <button
            className="w-full flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded-t"
            onClick={() => toggleSection('appearance')}
          >
            <span className="font-medium">Appearance</span>
            {expandedSections.appearance ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
          
          <AnimatePresence>
            {expandedSections.appearance && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="p-3 overflow-hidden"
              >
                {editMode ? (
                  <>
                    {renderEditableProperty('Color', 'color', 'color')}
                    
                    {(element.type === 'line' || element.type === 'rectangle' || element.type === 'circle') && (
                      renderEditableProperty('Line Width', 'linewidth', 'number')
                    )}
                    
                    {(element.type !== 'line' && element.type !== 'text') && (
                      renderEditableProperty('Wireframe', 'wireframe', 'checkbox')
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between py-1 border-b border-gray-100 dark:border-gray-700">
                      <span className="text-sm text-gray-600 dark:text-gray-300">Color</span>
                      <div className="flex items-center">
                        <div 
                          className="w-4 h-4 rounded mr-2" 
                          style={{ backgroundColor: element.color || '#1e88e5' }} 
                        />
                        <span className="font-medium">{element.color || '#1e88e5'}</span>
                      </div>
                    </div>
                    
                    {(element.type === 'line' || element.type === 'rectangle' || element.type === 'circle') && (
                      renderProperty('Line Width', formatNumber(element.linewidth), 'px')
                    )}
                    
                    {(element.type !== 'line' && element.type !== 'text') && (
                      renderProperty('Wireframe', element.wireframe ? 'Yes' : 'No')
                    )}
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        
        {/* Metadata section */}
        {element.metadata && (
          <div className="border rounded dark:border-gray-700">
            <button
              className="w-full flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded-t"
              onClick={() => toggleSection('metadata')}
            >
              <span className="font-medium">Metadata</span>
              {expandedSections.metadata ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
            
            <AnimatePresence>
              {expandedSections.metadata && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="p-3 overflow-hidden"
                >
                  <pre className="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-auto max-h-40">
                    {JSON.stringify(element.metadata, null, 2)}
                  </pre>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
        
        {/* Component elements section */}
        {element.type === 'component' && element.elements && element.elements.length > 0 && (
          <div className="border rounded dark:border-gray-700">
            <button
              className="w-full flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded-t"
              onClick={() => toggleSection('elements')}
            >
              <span className="font-medium">Elements ({(element.elements as CADElement[]).length})</span>
              {expandedSections.elements ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
            
            <AnimatePresence>
              {expandedSections.elements && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="p-3 overflow-hidden"
                >
                  <div className="max-h-40 overflow-y-auto">
                    {(element.elements as CADElement[]).map((childElement, index) => (
                      <div 
                        key={childElement.id || index}
                        className="text-sm py-1 border-b border-gray-100 dark:border-gray-700 last:border-b-0 flex items-center"
                      >
                        <div className="w-4 h-4 mr-2 text-gray-600 dark:text-gray-300">
                          {childElement.type === 'rectangle' && <div className="w-4 h-3 border border-current" />}
                          {childElement.type === 'circle' && <div className="w-4 h-4 rounded-full border border-current" />}
                          {childElement.type === 'line' && <div className="w-4 h-0.5 bg-current" />}
                          {childElement.type === 'cube' && <div className="w-4 h-4 bg-current opacity-30" />}
                          {childElement.type === 'sphere' && <div className="w-4 h-4 rounded-full bg-current opacity-30" />}
                        </div>
                        <span>
                          {childElement.name || `${childElement.type}-${index}`}
                        </span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    );
  };
  
  return (
    <div className="bg-white dark:bg-gray-800 dark:text-white rounded-md shadow-md overflow-hidden">
      <div className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700 border-b">
        <h3 className="font-medium truncate flex-1">
          {editMode ? (
            <input
              type="text"
              value={editedValues.name || ''}
              onChange={(e) => handleInputChange('name', e.target.value)}
              className="w-full px-2 py-1 border rounded bg-white dark:bg-gray-700 dark:border-gray-600"
            />
          ) : (
            element.name || `${element.type}-${element.id.slice(0, 6)}`
          )}
        </h3>
        
        <div className="flex space-x-1 ml-2">
          {editMode ? (
            <>
              <button
                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-green-600 dark:text-green-400"
                onClick={saveChanges}
                title="Save changes"
              >
                <Save size={16} />
              </button>
              <button
                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-gray-500"
                onClick={cancelEditing}
                title="Cancel"
              >
                <X size={16} />
              </button>
            </>
          ) : (
            <>
              <button
                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                onClick={startEditing}
                title="Edit properties"
              >
                <Edit size={16} />
              </button>
              {onClose && (
                <button
                  className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                  onClick={onClose}
                  title="Close panel"
                >
                  <X size={16} />
                </button>
              )}
            </>
          )}
        </div>
      </div>
      
      <div className="p-3">
        {renderPropertySections()}
      </div>
      
      {!editMode && (
        <div className="p-3 border-t">
          <div className="flex flex-wrap gap-2">
            <button
              className="flex items-center px-2.5 py-1.5 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
              onClick={() => {
                duplicateElement(element.id);
                clearSelection();
              }}
              title="Duplicate"
            >
              <Copy size={12} className="mr-1" />
              Duplicate
            </button>
            
            <button
              className="flex items-center px-2.5 py-1.5 text-xs bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
              onClick={() => {
                setActiveTool('move');
                // Select this element if not already selected
                if (!useSelectionStore.getState().selectedElementIds.includes(element.id)) {
                  useSelectionStore.getState().selectElement(element.id);
                }
              }}
              title="Move"
            >
              <Move size={12} className="mr-1" />
              Move
            </button>
            
            {element.type === 'component' && (
              <button
                className="flex items-center px-2.5 py-1.5 text-xs bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                onClick={() => {
                  ungroupElement(element.id);
                }}
                title="Ungroup Component"
              >
                <Layers size={12} className="mr-1" />
                Ungroup
              </button>
            )}
            
            <button
              className="flex items-center px-2.5 py-1.5 text-xs bg-red-500 text-white rounded hover:bg-red-600"
              onClick={() => {
                deleteElement(element.id);
                clearSelection();
                if (onClose) onClose();
              }}
              title="Delete"
            >
              <Trash2 size={12} className="mr-1" />
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ElementInfo;