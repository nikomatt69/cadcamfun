// src/components/cad/SaveElementToLibrary.tsx
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useElementsStore } from '@/src/store/elementsStore';
import { useLocalComponentsLibraryStore } from '@/src/store/localComponentsLibraryStore';
import { Save, AlertCircle } from 'react-feather';

// Define a type for element metadata extraction
type ElementMetadataExtractor = (element: any) => {
  type: string;
  specifications: Record<string, any>;
};

// Metadata extractors for different element types
const elementMetadataExtractors: Record<string, ElementMetadataExtractor> = {
  line: (element) => ({
    type: 'mechanical',
    specifications: {
      start: { x: element.x1, y: element.y1, z: element.z1 },
      end: { x: element.x2, y: element.y2, z: element.z2 },
      length: Math.sqrt(
        Math.pow(element.x2 - element.x1, 2) + 
        Math.pow(element.y2 - element.y1, 2) + 
        Math.pow((element.z2 || 0) - (element.z1 || 0), 2)
      ),
      color: element.color
    }
  }),
  circle: (element) => ({
    type: 'geometric',
    specifications: {
      center: { x: element.x, y: element.y, z: element.z || 0 },
      radius: element.radius,
      color: element.color
    }
  }),
  rectangle: (element) => ({
    type: 'structural',
    specifications: {
      center: { x: element.x, y: element.y, z: element.z || 0 },
      width: element.width,
      height: element.height,
      angle: element.angle || 0,
      color: element.color
    }
  }),
  cube: (element) => ({
    type: 'mechanical',
    specifications: {
      center: { x: element.x, y: element.y, z: element.z || 0 },
      dimensions: {
        width: element.width,
        height: element.height,
        depth: element.depth
      },
      color: element.color,
      wireframe: element.wireframe || false
    }
  }),
  sphere: (element) => ({
    type: 'geometric',
    specifications: {
      center: { x: element.x, y: element.y, z: element.z || 0 },
      radius: element.radius,
      color: element.color,
      wireframe: element.wireframe || false
    }
  }),
  cylinder: (element) => ({
    type: 'mechanical',
    specifications: {
      center: { x: element.x, y: element.y, z: element.z || 0 },
      radius: element.radius,
      height: element.height,
      segments: element.segments || 32,
      color: element.color,
      wireframe: element.wireframe || false
    }
  }),
  cone: (element) => ({
    type: 'geometric',
    specifications: {
      baseCenter: { x: element.x, y: element.y, z: element.z || 0 },
      radius: element.radius,
      height: element.height,
      segments: element.segments || 32,
      color: element.color,
      wireframe: element.wireframe || false
    }
  }),
  torus: (element) => ({
    type: 'geometric',
    specifications: {
      center: { x: element.x, y: element.y, z: element.z || 0 },
      mainRadius: element.radius,
      tubeRadius: element.tube || element.radius / 4,
      color: element.color,
      wireframe: element.wireframe || false
    }
  }),
  polygon: (element) => ({
    type: 'geometric',
    specifications: {
      center: { x: element.x, y: element.y, z: element.z || 0 },
      radius: element.radius,
      sides: element.sides || element.points?.length,
      color: element.color,
      wireframe: element.wireframe || false
    }
  }),
  extrusion: (element) => ({
    type: 'structural',
    specifications: {
      center: { x: element.x, y: element.y, z: element.z || 0 },
      shape: element.shape,
      depth: element.depth,
      width: element.width,
      height: element.height,
      bevel: element.bevel || false,
      color: element.color,
      wireframe: element.wireframe || false
    }
  }),
  tube: (element) => ({
    type: 'mechanical',
    specifications: {
      pathPoints: element.path?.length || 0,
      radius: element.radius,
      tubularSegments: element.tubularSegments || 64,
      radialSegments: element.radialSegments || 8,
      closed: element.closed || false,
      color: element.color,
      wireframe: element.wireframe || false
    }
  }),
  lathe: (element) => ({
    type: 'geometric',
    specifications: {
      center: { x: element.x, y: element.y, z: element.z || 0 },
      profilePoints: element.points?.length || 0,
      segments: element.segments || 12,
      phiStart: element.phiStart || 0,
      phiLength: element.phiLength || Math.PI * 2,
      color: element.color,
      wireframe: element.wireframe || false
    }
  }),
  text: (element) => ({
    type: 'annotation',
    specifications: {
      position: { x: element.x, y: element.y, z: element.z || 0 },
      content: element.text,
      fontSize: element.size,
      depth: element.depth || 0,
      color: element.color
    }
  }),
  grid: (element) => ({
    type: 'reference',
    specifications: {
      position: { x: element.x, y: element.y, z: element.z || 0 },
      size: element.size || 100,
      divisions: element.divisions || 10,
      plane: element.plane || 'xy',
      centerLineColor: element.colorCenterLine,
      gridColor: element.colorGrid
    }
  }),
  workpiece: (element) => ({
    type: 'manufacturing',
    specifications: {
      dimensions: {
        width: element.width,
        height: element.height,
        depth: element.depth
      },
      material: element.material || 'unknown',
      color: element.color,
      wireframe: element.wireframe || false
    }
  }),
  group: (element) => ({
    type: 'composite',
    specifications: {
      center: { x: element.x, y: element.y, z: element.z || 0 },
      elementCount: element.elements?.length || 0
    }
  }),
  default: (element) => ({
    type: 'custom',
    specifications: {
      position: { x: element.x, y: element.y, z: element.z || 0 },
      type: element.type
    }
  })
};

/**
 * Generate suggested tags for a component based on its type and properties
 */
const generateSuggestedTags = (element: any, elementType: string, specifications: any): string[] => {
  const tags: string[] = [elementType];
  
  // Add dimension-related tags
  if (element.width && element.height) {
    if (element.width === element.height) {
      tags.push('square');
    } else {
      tags.push('rectangular');
    }
  }
  
  if (element.radius) {
    tags.push('circular');
  }
  
  if (element.depth) {
    tags.push('3d');
  }
  
  // Add color-based tags
  if (element.color) {
    // Common color names
    const colorMap: Record<string, string> = {
      '#ff0000': 'red',
      '#00ff00': 'green',
      '#0000ff': 'blue',
      '#ffff00': 'yellow',
      '#00ffff': 'cyan',
      '#ff00ff': 'magenta',
      '#000000': 'black',
      '#ffffff': 'white',
      '#808080': 'gray'
    };
    
    if (colorMap[element.color.toLowerCase()]) {
      tags.push(colorMap[element.color.toLowerCase()]);
    }
  }
  
  // Add material-based tags
  if (element.material) {
    tags.push(element.material.toLowerCase());
  }
  
  // Add wireframe tag
  if (element.wireframe) {
    tags.push('wireframe');
  }
  
  return Array.from(new Set(tags)); // Rimuove i duplicati
};

interface SaveElementToLibraryProps {
  onSaveComplete?: () => void;
}

const SaveElementToLibrary: React.FC<SaveElementToLibraryProps> = ({ onSaveComplete }) => {
  const { selectedElement } = useElementsStore();
  const { addComponent } = useLocalComponentsLibraryStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: 'mechanical',
    tags: ''
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Update form data when selectedElement changes
  useEffect(() => {
    if (selectedElement && isModalOpen) {
      // Extract metadata based on element type
      const metadataExtractor = elementMetadataExtractors[selectedElement.type] || elementMetadataExtractors.default;
      const { type, specifications } = metadataExtractor(selectedElement);
      
      // Generate element name based on type and timestamp
      const elementName = selectedElement.name || 
        `${selectedElement.type.charAt(0).toUpperCase() + selectedElement.type.slice(1)}-${Date.now().toString().slice(-6)}`;
      
      // Generate suggested tags
      const suggestedTags = generateSuggestedTags(selectedElement, selectedElement.type, specifications);
      
      // Build description based on specifications
      let description = `${selectedElement.type.charAt(0).toUpperCase() + selectedElement.type.slice(1)} element`;
      
      // Add key specifications to description
      if (selectedElement.type === 'cube' || selectedElement.type === 'rectangle') {
        description += ` (${selectedElement.width} × ${selectedElement.height}`;
        if (selectedElement.depth) description += ` × ${selectedElement.depth}`;
        description += ')';
      } else if (selectedElement.type === 'circle' || selectedElement.type === 'sphere') {
        description += ` (radius: ${selectedElement.radius})`;
      } else if (selectedElement.type === 'cylinder' || selectedElement.type === 'cone') {
        description += ` (radius: ${selectedElement.radius}, height: ${selectedElement.height})`;
      }
      
      setFormData({
        name: elementName,
        description: description,
        type: type,
        tags: suggestedTags.join(', ')
      });
    }
  }, [selectedElement, isModalOpen]);

  const handleOpenModal = () => {
    if (!selectedElement) {
      setError('Please select an element first');
      setTimeout(() => setError(null), 3000);
      return;
    }
    
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (!selectedElement) return;
    
    try {
      const tagsList = formData.tags.split(',').map(tag => tag.trim()).filter(Boolean);
      
      // Extract metadata based on element type
      const metadataExtractor = elementMetadataExtractors[selectedElement.type] || elementMetadataExtractors.default;
      const { type, specifications } = metadataExtractor(selectedElement);
      
      // Process the selected element into a component format
      const componentData = {
        name: formData.name,
        description: formData.description,
        type: formData.type,
        tags: tagsList,
        data: {
          ...selectedElement,
          // Remove properties that shouldn't be saved
          id: undefined,
          selected: undefined
        },
        meta: {
          specifications,
          elementType: selectedElement.type
        }
      };
      
      // Add to local components library
      addComponent(componentData);
      
      setSuccess('Component saved to library successfully');
      setTimeout(() => setSuccess(null), 3000);
      setIsModalOpen(false);
      
      if (onSaveComplete) {
        onSaveComplete();
      }
    } catch (err) {
      setError('Failed to save component to library');
      console.error('Error saving component:', err);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Helper to generate preview description for component based on specifications
  const generatePreviewDescription = (element: any): string => {
    if (!element) return '';
    
    let description = `${element.type.charAt(0).toUpperCase() + element.type.slice(1)}`;
    
    switch (element.type) {
      case 'cube':
        return `${description}: ${element.width}×${element.height}×${element.depth}`;
      case 'rectangle':
        return `${description}: ${element.width}×${element.height}`;
      case 'circle':
        return `${description}: R=${element.radius}`;
      case 'sphere':
        return `${description}: R=${element.radius}`;
      case 'cylinder':
        return `${description}: R=${element.radius}, H=${element.height}`;
      case 'cone':
        return `${description}: R=${element.radius}, H=${element.height}`;
      default:
        return description;
    }
  };

  // Render as a button to match the PropertyPanel context
  return (
    <>
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={handleOpenModal}
        className="p-1 rounded-full text-blue-600 hover:bg-blue-100 focus:outline-none"
        title="Save Element to Library"
        disabled={!selectedElement}
      >
        <Save size={18} />
      </motion.button>
      
      {error && (
        <div className="fixed bottom-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded z-50 flex items-center">
          <AlertCircle size={16} className="mr-2" />
          {error}
        </div>
      )}
      
      {success && (
        <div className="fixed bottom-4 right-4 bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded z-50">
          {success}
        </div>
      )}
      
      {isModalOpen && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white rounded-lg shadow-xl max-w-md w-full">
            <div className="px-6 py-4 border-b flex justify-between items-center">
              <h3 className="text-lg font-medium text-gray-900">Save Element to Library</h3>
              {selectedElement && (
                <span className="text-xs text-gray-500">
                  {generatePreviewDescription(selectedElement)}
                </span>
              )}
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
                  value={formData.name}
                  onChange={handleChange}
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
                  value={formData.type}
                  onChange={handleChange}
                >
                  <option value="mechanical">Mechanical</option>
                  <option value="geometric">Geometric</option>
                  <option value="structural">Structural</option>
                  <option value="reference">Reference</option>
                  <option value="annotation">Annotation</option>
                  <option value="manufacturing">Manufacturing</option>
                  <option value="composite">Composite</option>
                  <option value="custom">Custom</option>
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
                  value={formData.description}
                  onChange={handleChange}
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
                  value={formData.tags}
                  onChange={handleChange}
                  placeholder="e.g. bracket, 3d, custom"
                />
              </div>
              
              {selectedElement && (
                <div className="mb-4 bg-blue-50 p-3 rounded-md">
                  <h4 className="text-sm font-medium text-blue-900 mb-2">Element Properties</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm text-gray-700">
                    {Object.entries(selectedElement)
                      .filter(([key]) => !['id', 'selected', 'layerId'].includes(key))
                      .slice(0, 6)
                      .map(([key, value]) => (
                        <div key={key} className="flex flex-col">
                          <span className="text-xs text-gray-500 capitalize">{key}:</span>
                          <span>
                            {typeof value === 'object' 
                              ? JSON.stringify(value).slice(0, 20) 
                              : String(value).slice(0, 20)}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
            
            <div className="px-6 py-4 bg-gray-50 flex justify-end space-x-3 rounded-b-lg">
              <button
                type="button"
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                onClick={() => setIsModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-4 py-2 bg-blue-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                onClick={handleSave}
                disabled={!formData.name}
              >
                Save to Library
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SaveElementToLibrary;