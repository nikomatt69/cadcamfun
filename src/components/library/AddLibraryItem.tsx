/* eslint-disable react-hooks/rules-of-hooks */
// src/components/library/AddLibraryItem.tsx
import React, { useState } from 'react';
import { Plus, X } from 'react-feather';
import { useLocalLibraries, ComponentItem, MaterialItem, ToolItem } from '@/src/hooks/useLocalLibraries';

interface AddLibraryItemProps {
  type: 'components' | 'materials' | 'tools';
  onItemAdded?: () => void;
}

const AddLibraryItem: React.FC<AddLibraryItemProps> = ({ type, onItemAdded }) => {
  const [showForm, setShowForm] = useState(false);
  
  // Component form state
  const [componentData, setComponentData] = useState<Partial<ComponentItem>>({
    name: '',
    description: '',
    type: '',
    data: { type: '', properties: {}, geometry: { type: '', elements: [] } }
  });
  
  // Material form state
  const [materialData, setMaterialData] = useState<Partial<MaterialItem>>({
    name: '',
    description: '',
    color: '#cccccc',
    density: 1.0,
    hardness: 100,
    properties: {}
  });
  
  // Tool form state
  const [toolData, setToolData] = useState<Partial<ToolItem>>({
    name: '',
    description: '',
    type: 'endmill',
    diameter: 6,
    material: 'HSS',
    numberOfFlutes: 2
  });
  
  // Get the appropriate hook based on type
  const { saveItem } = 
    type === 'components' 
      ? useLocalLibraries<ComponentItem>('components')
      : type === 'materials'
        ? useLocalLibraries<MaterialItem>('materials')
        : useLocalLibraries<ToolItem>('tools');
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    let result;
  let eventName = '';
  
  if (type === 'components') {
    result = saveItem(componentData);
    eventName = 'component-library-updated';
  } else if (type === 'materials') {
    result = saveItem(materialData);
    eventName = 'material-library-updated';
  } else {
    result = saveItem(toolData);
    eventName = 'tool-library-updated';
  }
  
  if (result) {
    setShowForm(false);
      if (onItemAdded) onItemAdded();
      
      // Reset form data
      if (type === 'components') {
        setComponentData({
          name: '',
          description: '',
          type: '',
          data: { type: '', properties: {}, geometry: { type: '', elements: [] } }
        });
      } else if (type === 'materials') {
        setMaterialData({
          name: '',
          description: '',
          color: '#cccccc',
          density: 1.0,
          hardness: 100,
          properties: {}
        });
      } else {
        setToolData({
          name: '',
          description: '',
          type: 'endmill',
          diameter: 6,
          material: 'HSS',
          numberOfFlutes: 2
        });
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(eventName));
      }
      
      if (onItemAdded) onItemAdded();
    }
    
  };
  
  const renderComponentForm = () => (
    <form onSubmit={handleSubmit} className="p-4 space-y-3">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
        <input 
          type="text" 
          className="w-full p-2 border border-gray-300 rounded-md text-sm" 
          value={componentData.name}
          onChange={(e) => setComponentData({...componentData, name: e.target.value})}
          required
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <textarea 
          className="w-full p-2 border border-gray-300 rounded-md text-sm" 
          value={componentData.description}
          onChange={(e) => setComponentData({...componentData, description: e.target.value})}
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
        <select 
          className="w-full p-2 border border-gray-300 rounded-md text-sm"
          value={componentData.type}
          onChange={(e) => {
            const type = e.target.value;
            setComponentData({
              ...componentData, 
              type,
              data: { ...componentData.data, type }
            });
          }}
        >
         <option value="mechanical">Mechanical</option>
                  <option value="electronic">Electronic</option>
                  <option value="geometric">Geometric</option>
                  <option value="composite">Composite</option>
                  <option value="custom">Custom</option>
                  <option value="manufacturing">Electronic</option>
                  <option value="structural">Structural</option>
                  <option value="fixture">Fixture</option>
                  <option value="enclosure">Enclosure</option>
                  <option value="tool">Tool</option>
                  <option value="other">Other</option>
        </select>
      </div>
      
      <div className="flex justify-end pt-2 space-x-2">
        <button
          type="button"
          className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-md text-sm"
          onClick={() => setShowForm(false)}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm"
        >
          Add Component
        </button>
      </div>
    </form>
  );
  
  const renderMaterialForm = () => (
    <form onSubmit={handleSubmit} className="p-4 space-y-3">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
        <input 
          type="text" 
          className="w-full p-2 border border-gray-300 rounded-md text-sm" 
          value={materialData.name}
          onChange={(e) => setMaterialData({...materialData, name: e.target.value})}
          required
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <textarea 
          className="w-full p-2 border border-gray-300 rounded-md text-sm" 
          value={materialData.description}
          onChange={(e) => setMaterialData({...materialData, description: e.target.value})}
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
        <input 
          type="color" 
          className="w-full p-1 h-10 border border-gray-300 rounded-md text-sm" 
          value={materialData.color}
          onChange={(e) => setMaterialData({...materialData, color: e.target.value})}
        />
      </div>
      
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Density (g/cm³)</label>
          <input 
            type="number" 
            className="w-full p-2 border border-gray-300 rounded-md text-sm" 
            value={materialData.density}
            onChange={(e) => setMaterialData({...materialData, density: parseFloat(e.target.value)})}
            min="0.1"
            step="0.1"
            required
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Hardness (HRC)</label>
          <input 
            type="number" 
            className="w-full p-2 border border-gray-300 rounded-md text-sm" 
            value={materialData.hardness}
            onChange={(e) => setMaterialData({...materialData, hardness: parseInt(e.target.value)})}
            min="1"
            max="100"
            required
          />
        </div>
      </div>
      
      <div className="flex justify-end pt-2 space-x-2">
        <button
          type="button"
          className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-md text-sm"
          onClick={() => setShowForm(false)}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm"
        >
          Add Material
        </button>
      </div>
    </form>
  );
  
  const renderToolForm = () => (
    <form onSubmit={handleSubmit} className="p-4 space-y-3">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
        <input 
          type="text" 
          className="w-full p-2 border border-gray-300 rounded-md text-sm" 
          value={toolData.name}
          onChange={(e) => setToolData({...toolData, name: e.target.value})}
          required
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <textarea 
          className="w-full p-2 border border-gray-300 rounded-md text-sm" 
          value={toolData.description}
          onChange={(e) => setToolData({...toolData, description: e.target.value})}
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Tool Type</label>
        <select 
          className="w-full p-2 border border-gray-300 rounded-md text-sm"
          value={toolData.type}
          onChange={(e) => setToolData({...toolData, type: e.target.value})}
        >
          <option value="endmill">End Mill</option>
          <option value="ballendmill">Ball End Mill</option>
          <option value="drillbit">Drill Bit</option>
          <option value="chamfermill">Chamfer Mill</option>
          <option value="facemill">Face Mill</option>
          <option value="engraver">Engraver</option>
          <option value="turningTool">Turning Tool</option>
          <option value="threadingTool">Threading Tool</option>
        </select>
      </div>
      
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Diameter (mm)</label>
          <input 
            type="number" 
            className="w-full p-2 border border-gray-300 rounded-md text-sm" 
            value={toolData.diameter}
            onChange={(e) => setToolData({...toolData, diameter: parseFloat(e.target.value)})}
            min="0.1"
            step="0.1"
            required
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Material</label>
          <select 
            className="w-full p-2 border border-gray-300 rounded-md text-sm"
            value={toolData.material}
            onChange={(e) => setToolData({...toolData, material: e.target.value})}
          >
            <option value="HSS">HSS</option>
            <option value="Carbide">Carbide</option>
            <option value="Cobalt">Cobalt</option>
            <option value="Diamond">Diamond</option>
            <option value="Ceramic">Ceramic</option>
          </select>
        </div>
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Number of Flutes</label>
        <input 
          type="number" 
          className="w-full p-2 border border-gray-300 rounded-md text-sm" 
          value={toolData.numberOfFlutes}
          onChange={(e) => setToolData({...toolData, numberOfFlutes: parseInt(e.target.value)})}
          min="1"
          max="12"
        />
      </div>
      
      <div className="flex justify-end pt-2 space-x-2">
        <button
          type="button"
          className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-md text-sm"
          onClick={() => setShowForm(false)}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm"
        >
          Add Tool
        </button>
      </div>
    </form>
  );
  
  return (
    <div className="border-t">
      {showForm ? (
        <div className="bg-gray-50">
          <div className="flex justify-between items-center px-4 py-2 border-b">
            <h3 className="text-sm font-medium">Add New {type.slice(0, -1)}</h3>
            <button
              onClick={() => setShowForm(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X size={18} />
            </button>
          </div>
          {type === 'components' && renderComponentForm()}
          {type === 'materials' && renderMaterialForm()}
          {type === 'tools' && renderToolForm()}
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="w-full py-2 flex items-center justify-center text-blue-600 hover:bg-blue-50 text-sm"
        >
          <Plus size={16} className="mr-1" />
          Add New {type.slice(0, -1)}
        </button>
      )}
    </div>
  );
};

export default AddLibraryItem;