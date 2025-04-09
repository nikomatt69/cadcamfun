// src/components/materials/MaterialsList.tsx

import React, { useState } from 'react';
import { useMaterials } from 'src/hooks/useMaterials';
import { Material } from 'src/types/mainTypes';
import { Edit, Trash2, Plus, Book } from 'react-feather';
import Layout from '@/src/components/layout/Layout';
import PredefinedLibrary from '../library/PredefinedLibrary';

interface MaterialsFilterState {
  search: string;
}

export default function MaterialsList() {
  // State for filters
  const [filters, setFilters] = useState<MaterialsFilterState>({
    search: ''
  });
  
  // State for the modal
  const [showModal, setShowModal] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    density: 0,
    hardness: 0,
    color: '#cccccc'
  });
  
  // Fetch materials data using our custom hook
  const { 
    materials, 
    isLoading, 
    error, 
    refreshMaterials, 
    addMaterial 
  } = useMaterials(filters);
  
  // Handle filter changes
  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };
  
  // Handle material creation
  const handleCreateMaterial = async (materialData: any) => {
    try {
      await addMaterial(materialData);
      setShowModal(false);
    } catch (error) {
      console.error('Failed to create material:', error);
      alert('Failed to create material. Please try again.');
    }
  };
  
  const editMaterial = (material: Material) => {
    setSelectedMaterial(material);
    setFormData({
      name: material.name,
      description: material.description || '',
      density: material.properties.density,
      hardness: material.properties.hardness,
      color: material.properties.color || '#cccccc'
    });
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      density: 0,
      hardness: 0,
      color: '#cccccc'
    });
    setSelectedMaterial(null);
  };
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  // Handle opening the edit modal
  const handleEditClick = (material: Material) => {
    setSelectedMaterial(material);
    setShowModal(true);
  };
  
  // Handle material deletion
  const handleDeleteMaterial = async (id: string) => {
    if (!confirm('Are you sure you want to delete this material?')) return;
    
    try {
      // Here we would call a delete function from our hooks
      // For now, let's just refresh the list
      await refreshMaterials();
    } catch (error) {
      console.error('Failed to delete material:', error);
      alert('Failed to delete material. Please try again.');
    }
  };

  // Handle selecting item from library
  const handleSelectLibraryItem = (item: any) => {
    // Create new material from library item
    handleCreateMaterial({
      name: item.name,
      description: item.description,
      properties: item.properties
    });
    
    setShowLibrary(false);
  };
  
  if (isLoading) {
    return <div className="p-4 flex justify-center">Loading materials...</div>;
  }
  
  if (error) {
    return <div className="p-4 text-red-500">Error loading materials: {error.message}</div>;
  }
  
  return (
    <Layout>
      <div className="p-4">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Materials Library</h1>
          <div className="flex space-x-2">
            <button
              onClick={() => setShowLibrary(true)}
              className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 flex items-center"
            >
              <Book size={20} className="mr-2" />
              Standard Materials
            </button>
            <button
              onClick={() => {
                setSelectedMaterial(null);
                setShowModal(true);
              }}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center"
            >
              <Plus size={20} className="mr-2" />
              New Material
            </button>
          </div>
        </div>
        
        {/* Search */}
        <div className="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white shadow-md rounded-md p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
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
                placeholder="Search materials..."
              />
            </div>
          </div>
        </div>
        
        {/* Materials List */}
        {materials.length === 0 ? (
          <div className="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white shadow-md rounded-lg p-6 text-center">
            <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">M</span>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No materials yet</h3>
            <p className="text-gray-600 mb-4">
              Add materials to use in your CAD/CAM projects for accurate simulations and machining or choose from our standard library.
            </p>
            <div className="flex justify-center space-x-4">
              <button
                onClick={() => setShowModal(true)}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Create Material
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
            {materials.map((material) => (
              <div key={material.id} className="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white shadow-md rounded-lg overflow-hidden">
                <div className="p-6">
                  <div className="flex items-center mb-4">
                    <div 
                      className="w-8 h-8 rounded-full mr-3"
                      style={{ backgroundColor: material?.properties?.toString() || '#cccccc' }}
                    ></div>
                    <div>
                      <h3 className="text-lg font-medium text-gray-900">{material.name}</h3>
                      {material.description && (
                        <p className="text-sm text-gray-500">{material.description}</p>
                      )}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
                    {material.properties && (
                      <>
                        {material.properties && (
                          <div className="flex flex-col">
                            <span className="text-gray-500">Density</span>
                            <span className="font-medium">{material.properties.toString()} g/cm³</span>
                          </div>
                        )}
                        
                       
                      </>
                    )}
                  </div>
                </div>
                
                <div className="border-t border-gray-200 px-4 py-3 bg-gray-50 flex justify-end space-x-2">
                  <button 
                    onClick={() => handleEditClick(material)}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                    title="Edit Material"
                  >
                    <Edit size={16} />
                  </button>
                  <button 
                    onClick={() => handleDeleteMaterial(material.id)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded"
                    title="Delete Material"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        
        {/* Material Modal */}
        {(showModal || selectedMaterial) && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white rounded-lg shadow-xl max-w-md w-full">
              <div className="px-6 py-4 border-b">
                <h3 className="text-lg font-medium text-gray-900">
                  {selectedMaterial ? 'Edit Material' : 'Create New Material'}
                </h3>
              </div>
              
              <form onSubmit={(e) => {
                e.preventDefault();
                handleCreateMaterial({
                  name: formData.name,
                  description: formData.description,
                  properties: {
                    density: parseFloat(formData.density.toString()),
                    hardness: parseFloat(formData.hardness.toString()),
                    color: formData.color
                  }
                });
              }}>
                <div className="px-6 py-4">
                  <div className="mb-4">
                    <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                      Material Name
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
                    ></textarea>
                  </div>
                  
                  <div className="mb-4">
                    <label htmlFor="color" className="block text-sm font-medium text-gray-700 mb-1">
                      Color
                    </label>
                    <input
                      type="color"
                      id="color"
                      name="color"
                      className="w-full h-10 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      value={formData.color}
                      onChange={handleChange}
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="mb-4">
                      <label htmlFor="density" className="block text-sm font-medium text-gray-700 mb-1">
                        Density (g/cm³)
                      </label>
                      <input
                        type="number"
                        id="density"
                        name="density"
                        step="0.01"
                        min="0"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        value={formData.density}
                        onChange={handleChange}
                        required
                      />
                    </div>
                    
                    <div className="mb-4">
                      <label htmlFor="hardness" className="block text-sm font-medium text-gray-700 mb-1">
                        Hardness (HRC)
                      </label>
                      <input
                        type="number"
                        id="hardness"
                        name="hardness"
                        step="0.1"
                        min="0"
                        max="100"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        value={formData.hardness}
                        onChange={handleChange}
                        required
                      />
                    </div>
                  </div>
                </div>
                
                <div className="px-6 py-4 bg-gray-50 flex justify-end space-x-3 rounded-b-lg">
                  <button
                    type="button"
                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    onClick={() => {
                      setShowModal(false);
                      setSelectedMaterial(null);
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  >
                    {selectedMaterial ? 'Update' : 'Create'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        
        {/* Predefined Library Modal */}
        <PredefinedLibrary
          libraryType="materials"
          onSelectItem={handleSelectLibraryItem}
          isOpen={showLibrary}
          onClose={() => setShowLibrary(false)}
        />
      </div>
    </Layout>
  );
}