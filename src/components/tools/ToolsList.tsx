// src/components/tools/ToolsList.tsx

import React, { useState } from 'react';
import { useTools } from 'src/hooks/useTools';
import { Tool } from 'src/types/mainTypes';
import { Edit, Trash2, Plus, Book } from 'react-feather';
import Link from 'next/link';
import Layout from '@/src/components/layout/Layout';
import PredefinedLibrary from '../library/PredefinedLibrary';

interface ToolFilterState {
  type: string;
  material: string;
  search: string;
}

export default function ToolsList() {
  // State for filters
  const [filters, setFilters] = useState<ToolFilterState>({
    type: '',
    material: '',
    search: ''
  });
  
  // State for the modal
  const [showModal, setShowModal] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    type: 'endmill',
    diameter: 6,
    material: 'HSS',
    numberOfFlutes: 2,
    maxRPM: 10000,
    coolantType: 'none'
  });
  
  // Fetch tools data using our custom hook
  const { 
    tools, 
    isLoading, 
    error, 
    refreshTools, 
    addTool 
  } = useTools(filters);
  
  // Handle filter changes
  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  // Handle tool creation
  const handleCreateTool = async (toolData: any) => {
    try {
      await addTool(toolData);
      setShowModal(false);
    } catch (error) {
      console.error('Failed to create tool:', error);
      alert('Failed to create tool. Please try again.');
    }
  };
  
  // Handle opening the edit modal
  const handleEditClick = (tool: Tool) => {
    setSelectedTool(tool);
    setFormData({
      name: tool.name,
      type: tool.type,
      diameter: tool.diameter,
      material: tool.material,
      numberOfFlutes: tool.numberOfFlutes || 2,
      maxRPM: tool.maxRPM || 10000,
      coolantType: tool.coolantType || 'none'
    });
    setShowModal(true);
  };
  
  // Handle tool deletion
  const handleDeleteTool = async (id: string) => {
    if (!confirm('Are you sure you want to delete this tool?')) return;
    
    try {
      // Here we would call a delete function, which we'd implement in our hooks
      // For now, let's just refresh the list
      await refreshTools();
    } catch (error) {
      console.error('Failed to delete tool:', error);
      alert('Failed to delete tool. Please try again.');
    }
  };

  // Handle selecting item from library
  const handleSelectLibraryItem = (item: any) => {
    // Create new tool from library item
    handleCreateTool({
      name: item.name,
      type: item.type,
      diameter: item.diameter,
      material: item.material,
      numberOfFlutes: item.numberOfFlutes,
      maxRPM: item.maxRPM,
      coolantType: item.coolantType,
      cuttingLength: item.cuttingLength,
      totalLength: item.totalLength,
      shankDiameter: item.shankDiameter,
      notes: item.notes
    });
    
    setShowLibrary(false);
  };
  
  if (isLoading) {
    return <div className="p-4 flex justify-center">Loading tools...</div>;
  }
  
  if (error) {
    return <div className="p-4 text-red-500">Error loading tools: {error.message}</div>;
  }
  
  return (
    <Layout>
      <div className="p-4">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Tool Library</h1>
          <div className="flex space-x-2">
            <button
              onClick={() => setShowLibrary(true)}
              className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 flex items-center"
            >
              <Book size={20} className="mr-2" />
              Standard Tools
            </button>
            <button
              onClick={() => {
                setSelectedTool(null);
                setShowModal(true);
              }}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center"
            >
              <Plus size={20} className="mr-2" />
              New Tool
            </button>
          </div>
        </div>
        
        {/* Filters */}
        <div className="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white shadow-md rounded-md p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-1">
                Search
              </label>
              <input
                type="text"
                id="search"
                name="search"
                value={filters.search}
                onChange={handleFilterChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="Search tools..."
              />
            </div>
            
            <div>
              <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-1">
                Tool Type
              </label>
              <select
                id="type"
                name="type"
                value={filters.type}
                onChange={handleFilterChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All Types</option>
                <option value="endmill">End Mill</option>
                <option value="ballendmill">Ball End Mill</option>
                <option value="drillbit">Drill Bit</option>
                <option value="chamfermill">Chamfer Mill</option>
                <option value="facemill">Face Mill</option>
                <option value="engraver">Engraver</option>
                <option value="turningTool">Turning Tool</option>
                <option value="threadingTool">Threading Tool</option>
                <option value="insertTool">Insert Tool</option>
                <option value="tslotcutter">T-Slot Cutter</option>
              </select>
            </div>
            
            <div>
              <label htmlFor="material" className="block text-sm font-medium text-gray-700 mb-1">
                Material
              </label>
              <select
                id="material"
                name="material"
                value={filters.material}
                onChange={handleFilterChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All Materials</option>
                <option value="HSS">HSS</option>
                <option value="Carbide">Carbide</option>
                <option value="Cobalt">Cobalt</option>
                <option value="Diamond">Diamond</option>
                <option value="Ceramic">Ceramic</option>
                <option value="Custom">Custom</option>
              </select>
            </div>
          </div>
        </div>
        
        {/* Tools List */}
        {tools.length === 0 ? (
          <div className="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white shadow-md rounded-lg p-6 text-center">
            <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">🔧</span>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No tools yet</h3>
            <p className="text-gray-600 mb-4">
              Add cutting tools to use in your CAM operations for generating accurate toolpaths or choose from our standard library.
            </p>
            <div className="flex justify-center space-x-4">
              <button
                onClick={() => setShowModal(true)}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Create Tool
              </button>
              <button
                onClick={() => setShowLibrary(true)}
                className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                Use Standard Library
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {tools.map((tool) => (
              <div key={tool.id} className="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white shadow-md rounded-lg overflow-hidden">
                <div className="p-6">
                  <div className="flex items-center mb-4">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center mr-3">
                      <span className="text-xl">
                        {tool.type === 'endmill' ? '🔄' : 
                         tool.type === 'ballendmill' ? '🔵' :
                         tool.type === 'drillbit' ? '🔨' : 
                         tool.type === 'chamfermill' ? '🔺' :
                         tool.type === 'facemill' ? '⬛' :
                         tool.type === 'engraver' ? '✏️' :
                         tool.type === 'turningTool' ? '⚙️' : 
                         tool.type === 'threadingTool' ? '🔩' : '🧩'}
                      </span>
                    </div>
                    <div>
                      <h3 className="text-lg font-medium text-gray-900">{tool.name}</h3>
                      <p className="text-sm text-gray-500 capitalize">{tool.type}</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex flex-col">
                      <span className="text-gray-500">Diameter</span>
                      <span className="font-medium">{tool.diameter} mm</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-gray-500">Material</span>
                      <span className="font-medium">{tool.material}</span>
                    </div>
                    {tool.numberOfFlutes && (
                      <div className="flex flex-col">
                        <span className="text-gray-500">Flutes</span>
                        <span className="font-medium">{tool.numberOfFlutes}</span>
                      </div>
                    )}
                    {tool.maxRPM && (
                      <div className="flex flex-col">
                        <span className="text-gray-500">Max RPM</span>
                        <span className="font-medium">{tool.maxRPM}</span>
                      </div>
                    )}
                    {tool.coolantType && (
                      <div className="flex flex-col">
                        <span className="text-gray-500">Coolant</span>
                        <span className="font-medium capitalize">{tool.coolantType}</span>
                      </div>
                    )}
                    {tool.cuttingLength && (
                      <div className="flex flex-col">
                        <span className="text-gray-500">Cutting Length</span>
                        <span className="font-medium">{tool.cuttingLength} mm</span>
                      </div>
                    )}
                  </div>
                  
                  {tool.notes && (
                    <div className="mt-3 text-sm text-gray-600 border-t pt-2">
                      <p>{tool.notes}</p>
                    </div>
                  )}
                </div>
                
                <div className="border-t border-gray-200 px-4 py-3 bg-gray-50 flex justify-end space-x-2">
                  <button 
                    onClick={() => handleEditClick(tool)}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                    title="Edit Tool"
                  >
                    <Edit size={16} />
                  </button>
                  <button 
                    onClick={() => handleDeleteTool(tool.id)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded"
                    title="Delete Tool"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        
        {/* Tool Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white rounded-lg shadow-xl max-w-md w-full">
              <div className="px-6 py-4 border-b">
                <h3 className="text-lg font-medium text-gray-900">
                  {selectedTool ? 'Edit Tool' : 'Create New Tool'}
                </h3>
              </div>
              
              <form onSubmit={(e) => {
                e.preventDefault();
                handleCreateTool({
                  name: formData.name,
                  type: formData.type,
                  diameter: parseFloat(formData.diameter.toString()),
                  material: formData.material,
                  numberOfFlutes: parseInt(formData.numberOfFlutes.toString()),
                  maxRPM: parseInt(formData.maxRPM.toString()),
                  coolantType: formData.coolantType
                });
              }}>
                <div className="px-6 py-4">
                  <div className="mb-4">
                    <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                      Tool Name
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
                      Tool Type
                    </label>
                    <select
                      id="type"
                      name="type"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      value={formData.type}
                      onChange={handleChange}
                      required
                    >
                      <option value="endmill">End Mill</option>
                      <option value="ballendmill">Ball End Mill</option>
                      <option value="drillbit">Drill Bit</option>
                      <option value="chamfermill">Chamfer Mill</option>
                      <option value="facemill">Face Mill</option>
                      <option value="engraver">Engraver</option>
                      <option value="turningTool">Turning Tool</option>
                      <option value="threadingTool">Threading Tool</option>
                      <option value="insertTool">Insert Tool</option>
                      <option value="tslotcutter">T-Slot Cutter</option>
                    </select>
                  </div>
                  
                  <div className="mb-4">
                    <label htmlFor="diameter" className="block text-sm font-medium text-gray-700 mb-1">
                      Diameter (mm)
                    </label>
                    <input
                      type="number"
                      id="diameter"
                      name="diameter"
                      step="0.1"
                      min="0.1"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      value={formData.diameter}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  
                  <div className="mb-4">
                    <label htmlFor="material" className="block text-sm font-medium text-gray-700 mb-1">
                      Material
                    </label>
                    <select
                      id="material"
                      name="material"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      value={formData.material}
                      onChange={handleChange}
                      required
                    >
                      <option value="HSS">HSS</option>
                      <option value="Carbide">Carbide</option>
                      <option value="Cobalt">Cobalt</option>
                      <option value="Diamond">Diamond</option>
                      <option value="Ceramic">Ceramic</option>
                      <option value="Custom">Custom</option>
                    </select>
                  </div>
                  
                  {(formData.type === 'endmill' || formData.type === 'ballendmill' || formData.type === 'drillbit') && (
                    <div className="mb-4">
                      <label htmlFor="numberOfFlutes" className="block text-sm font-medium text-gray-700 mb-1">
                        Number of Flutes
                      </label>
                      <input
                        type="number"
                        id="numberOfFlutes"
                        name="numberOfFlutes"
                        min="1"
                        max="12"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        value={formData.numberOfFlutes}
                        onChange={handleChange}
                      />
                    </div>
                  )}
                  
                  <div className="mb-4">
                    <label htmlFor="maxRPM" className="block text-sm font-medium text-gray-700 mb-1">
                      Max RPM
                    </label>
                    <input
                      type="number"
                      id="maxRPM"
                      name="maxRPM"
                      min="1000"
                      step="1000"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      value={formData.maxRPM}
                      onChange={handleChange}
                    />
                  </div>
                  
                  <div className="mb-4">
                    <label htmlFor="coolantType" className="block text-sm font-medium text-gray-700 mb-1">
                      Coolant Type
                    </label>
                    <select
                      id="coolantType"
                      name="coolantType"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      value={formData.coolantType}
                      onChange={handleChange}
                    >
                      <option value="none">No Coolant</option>
                      <option value="flood">Flood Coolant</option>
                      <option value="mist">Mist Coolant</option>
                      <option value="air">Air Blast</option>
                      <option value="through">Through Tool</option>
                    </select>
                  </div>
                </div>
                
                <div className="px-6 py-4 bg-gray-50 flex justify-end space-x-3 rounded-b-lg">
                  <button
                    type="button"
                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    onClick={() => {
                      setShowModal(false);
                      setSelectedTool(null);
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  >
                    {selectedTool ? 'Update' : 'Create'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        
        {/* Predefined Library Modal */}
        <PredefinedLibrary
          libraryType="tools"
          onSelectItem={handleSelectLibraryItem}
          isOpen={showLibrary}
          onClose={() => setShowLibrary(false)}
        />
      </div>
    </Layout>
  );
}