// src/components/cad/ComponentBroswerLocal.tsx
import React, { useState, useEffect, useRef } from 'react';
import { Layers, Package, ChevronDown, ChevronUp, Save } from 'react-feather';
import { ComponentItem } from '@/src/hooks/useLocalLibraries';
import LocalComponentLibrary from '../library/LocalComponentLibrary';
import { useElementsStore } from '@/src/store/elementsStore';
import { useLocalComponentsLibraryStore } from '@/src/store/localComponentsLibraryStore';

const ComponentsBrowserLocal: React.FC = () => {
  const [expanded, setExpanded] = useState(true);
  const [selectedComponent, setSelectedComponent] = useState<ComponentItem | null>(null);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveFormData, setSaveFormData] = useState({
    name: '',
    description: '',
    type: '',
    tags: ''
  });

  const { addElement, selectedElement } = useElementsStore();
  const { addComponent } = useLocalComponentsLibraryStore();
  const localComponentLibraryRef = useRef<HTMLDivElement>(null);

  // Effect to update form when an element is selected from CAD canvas
  useEffect(() => {
    if (selectedElement && isSaveModalOpen) {
      // Pre-populate form based on selected element
      const elementType = selectedElement.type;
      const elementName = selectedElement.name || 
        `${elementType.charAt(0).toUpperCase() + elementType.slice(1)}-${Date.now().toString().slice(-6)}`;
      
      let description = `${elementType.charAt(0).toUpperCase() + elementType.slice(1)} element`;
      let type = 'mechanical';
      
      // Infer type based on element type
      if (['circle', 'sphere', 'polygon', 'torus'].includes(elementType)) {
        type = 'geometric';
      } else if (['rectangle', 'extrusion'].includes(elementType)) {
        type = 'structural';
      } else if (['line', 'cube', 'cylinder'].includes(elementType)) {
        type = 'mechanical';
      }
      
      // Add dimensions to description
      if (selectedElement.width && selectedElement.height) {
        description += ` (${selectedElement.width}×${selectedElement.height}`;
        if (selectedElement.depth) description += `×${selectedElement.depth}`;
        description += ')';
      } else if (selectedElement.radius) {
        description += ` (radius: ${selectedElement.radius})`;
      }
      
      // Generate tags based on element properties
      const tags: string[] = [elementType];
      if (selectedElement.color) tags.push('colored');
      if (selectedElement.wireframe) tags.push('wireframe');
      
      setSaveFormData({
        name: elementName,
        description,
        type,
        tags: tags.join(', ')
      });
    }
  }, [selectedElement, isSaveModalOpen]);

  const handleSelectComponent = (component: ComponentItem) => {
    // Add component to CAD canvas
    const newElement = {
      type: 'component',
      ...component.data,
      name: component.name,
      meta: component.meta
    };
    
    addElement(newElement);
  };

  const handleSaveComponent = () => {
    if (!selectedComponent && !selectedElement) return;
    
    const tagsList = saveFormData.tags.split(',').map(tag => tag.trim()).filter(Boolean);

    // If component is selected from library
    if (selectedComponent) {
      const componentData = {
        name: saveFormData.name || selectedComponent.name,
        description: saveFormData.description,
        type: saveFormData.type || selectedComponent.type,
        tags: tagsList,
        data: selectedComponent.data,
        meta: selectedComponent.meta
      };

      addComponent(componentData);
    } 
    // If element is selected from CAD canvas
    else if (selectedElement) {
      const componentData = {
        name: saveFormData.name,
        description: saveFormData.description,
        type: saveFormData.type,
        tags: tagsList,
        data: {
          ...selectedElement,
          id: undefined,  // Remove ID to avoid conflicts
          selected: undefined
        },
        meta: {
          elementType: selectedElement.type,
          specifications: extractSpecifications(selectedElement)
        }
      };

      addComponent(componentData);
    }

    // Close modal and reset form
    setIsSaveModalOpen(false);
    setSelectedComponent(null);
    setSaveFormData({
      name: '',
      description: '',
      type: '',
      tags: ''
    });
    
    // Manually trigger refresh via custom event
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('component-library-updated'));
    }
  };

  const handlePrepareToSave = (component: ComponentItem) => {
    setSelectedComponent(component);
    setSaveFormData({
      name: component.name,
      description: component.description || '',
      type: component.type || '',
      tags: component.tags ? component.tags.join(', ') : ''
    });
    setIsSaveModalOpen(true);
  };
  
  // Opens the save modal for the currently selected element
  const handleOpenSaveModalForSelectedElement = () => {
    if (!selectedElement) return;
    
    // Clear any selected component from library
    setSelectedComponent(null);
    setIsSaveModalOpen(true);
  };
  
  // Extract specifications from an element
  const extractSpecifications = (element: any): Record<string, any> => {
    const specs: Record<string, any> = {};
    
    // Basic properties
    if (element.type) specs.type = element.type;
    
    // Dimensions
    if (element.width) specs.width = element.width;
    if (element.height) specs.height = element.height;
    if (element.depth) specs.depth = element.depth;
    if (element.radius) specs.radius = element.radius;
    
    // Position
    if (element.x !== undefined) specs.position = { 
      x: element.x, 
      y: element.y || 0, 
      z: element.z || 0 
    };
    
    // Visual properties
    if (element.color) specs.color = element.color;
    if (element.wireframe !== undefined) specs.wireframe = element.wireframe;
    
    return specs;
  };

  return (
    <div className="border rounded-md overflow-hidden bg-white">
      <div
        className="flex items-center justify-between px-3 py-2 bg-gray-50 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center">
          <Package size={16} className="mr-2 text-blue-600" />
          <span className="font-medium">Component Local Library</span>
        </div>
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </div>
      
      {!expanded && (
        <div className="flex flex-col">
          {/* Button to save current selection */}
          {selectedElement && (
            <button
              onClick={handleOpenSaveModalForSelectedElement}
              className="w-full py-2 flex items-center justify-center text-blue-600 hover:bg-blue-50 text-sm border-b"
            >
              <Save size={16} className="mr-1" />
              Save Selected Element to Library
            </button>
          )}
          
          {/* Component library */}
          <div className="max-h-80 overflow-y-auto" ref={localComponentLibraryRef}>
            <LocalComponentLibrary 
              onSelectComponent={handleSelectComponent}
              onSaveComponent={handlePrepareToSave}
            />
          </div>
        </div>
      )}

      {/* Save Component Modal */}
      {isSaveModalOpen && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="px-6 py-4 border-b">
              <h3 className="text-lg font-medium text-gray-900">Save Component Details</h3>
            </div>
            
            <div className="px-6 py-4">
              <div className="mb-4">
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                  Component Name
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  value={saveFormData.name}
                  onChange={(e) => setSaveFormData(prev => ({ ...prev, name: e.target.value }))}
                  required
                />
              </div>
              
              <div className="mb-4">
                <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-1">
                  Component Type
                </label>
                <select
                  id="type"
                  name="type"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  value={saveFormData.type}
                  onChange={(e) => setSaveFormData(prev => ({ ...prev, type: e.target.value }))}
                >
                  <option value="">Select a type</option>
                  <option value="mechanical">Mechanical</option>
                  <option value="geometric">Geometric</option>
                  <option value="structural">Structural</option>
                  <option value="electronic">Electronic</option>
                  <option value="custom">Custom</option>
                  <option value="manufacturing">Manufacturing</option>
                  <option value="fixture">Fixture</option>
                  <option value="enclosure">Enclosure</option>
                </select>
              </div>
              
              <div className="mb-4">
                <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                  Description (optional)
                </label>
                <textarea
                  id="description"
                  name="description"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  value={saveFormData.description}
                  onChange={(e) => setSaveFormData(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>
              
              <div className="mb-4">
                <label htmlFor="tags" className="block text-sm font-medium text-gray-700 mb-1">
                  Tags (comma separated, optional)
                </label>
                <input
                  type="text"
                  id="tags"
                  name="tags"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  value={saveFormData.tags}
                  onChange={(e) => setSaveFormData(prev => ({ ...prev, tags: e.target.value }))}
                  placeholder="e.g. mechanical, structural, custom"
                />
              </div>
              
              {/* Show preview of selected element/component properties */}
              {(selectedElement || selectedComponent) && (
                <div className="mb-4 bg-gray-50 p-3 rounded-md">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">
                    {selectedElement ? 'Element Properties' : 'Component Properties'}
                  </h4>
                  <div className="text-xs text-gray-500">
                    {selectedElement && (
                      <div className="grid grid-cols-2 gap-2">
                        <div><span className="font-medium">Type:</span> {selectedElement.type}</div>
                        {selectedElement.width && <div><span className="font-medium">Width:</span> {selectedElement.width}</div>}
                        {selectedElement.height && <div><span className="font-medium">Height:</span> {selectedElement.height}</div>}
                        {selectedElement.depth && <div><span className="font-medium">Depth:</span> {selectedElement.depth}</div>}
                        {selectedElement.radius && <div><span className="font-medium">Radius:</span> {selectedElement.radius}</div>}
                      </div>
                    )}
                    {selectedComponent && selectedComponent.data && (
                      <div>
                        <div><span className="font-medium">Type:</span> {selectedComponent.data.type}</div>
                        <div><span className="font-medium">Original Name:</span> {selectedComponent.name}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            
            <div className="px-6 py-4 bg-gray-50 flex justify-end space-x-3 rounded-b-lg">
              <button
                type="button"
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                onClick={() => setIsSaveModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-4 py-2 bg-blue-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                onClick={handleSaveComponent}
                disabled={!saveFormData.name || !saveFormData.type}
              >
                Save to Library
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ComponentsBrowserLocal;