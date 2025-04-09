// src/components/components/ComponentsList.tsx
import Image from 'next/image';
import React, { useState } from 'react';
import { useComponents } from 'src/hooks/useComponents';
import { Edit, Trash2, Plus, Package, Grid, Book } from 'react-feather';
import Link from 'next/link';
import { Component } from '@prisma/client';
import PredefinedLibrary from '../library/PredefinedLibrary';

interface ComponentsFilterState {
  projectId?: string;
  type?: string;
  search: string;
}

export default function ComponentsList() {
  // State for filters
  const [filters, setFilters] = useState<ComponentsFilterState>({
    search: '',
    type: '',
    projectId: ''
  });
  
  // State for the modal
  const [showModal, setShowModal] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [selectedComponent, setSelectedComponent] = useState<Component | null>(null);
  
  // View mode (grid or list)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  // Fetch components data using our custom hook
  const { 
    components, 
    isLoading, 
    error, 
    refreshComponents, 
    addComponent 
  } = useComponents(filters);
  
  // Handle filter changes
  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };
  
  // Handle component creation
  const handleCreateComponent = async (componentData: any) => {
    try {
      await addComponent(componentData);
      setShowModal(false);
    } catch (error) {
      console.error('Failed to create component:', error);
      alert('Failed to create component. Please try again.');
    }
  };
  
  // Handle opening the edit modal
  const handleEditClick = (component: Component) => {
    setSelectedComponent(component);
    setShowModal(true);
  };
  
  // Handle component deletion
  const handleDeleteComponent = async (id: string) => {
    if (!confirm('Are you sure you want to delete this component?')) return;
    
    try {
      // Here we would call a delete function from our hooks
      // For now let's just refresh the components list
      await refreshComponents();
    } catch (error) {
      console.error('Failed to delete component:', error);
      alert('Failed to delete component. Please try again.');
    }
  };

  // Handle selecting item from library
  const handleSelectLibraryItem = (item: any) => {
    // Create new component from library item
    handleCreateComponent({
      name: item.name,
      description: item.description,
      projectId: filters.projectId || '',
      data: item.data,
      type: item.data?.type || 'mechanical'
    });
    
    setShowLibrary(false);
  };
  
  if (isLoading) {
    return <div className="p-4 flex justify-center">Loading components...</div>;
  }
  
  if (error) {
    return <div className="p-4 text-red-500">Error loading components: {error.message}</div>;
  }
  
  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Component Library</h1>
        <div className="flex space-x-2">
          <button
            onClick={() => setShowLibrary(true)}
            className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50 flex items-center"
          >
            <Book size={20} className="mr-2" />
            Standard Library
          </button>
          <button
            onClick={() => {
              setSelectedComponent(null);
              setShowModal(true);
            }}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 flex items-center"
          >
            <Plus size={20} className="mr-2" />
            New Component
          </button>
        </div>
      </div>
      
      {/* Filters and View Options */}
      <div className="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white shadow-md rounded-md p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
              placeholder="Search components by name or description..."
            />
          </div>
          
          <div>
            <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-1">
              Component Type
            </label>
            <select
              id="type"
              name="type"
              value={filters.type}
              onChange={handleFilterChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Types</option>
              <option value="mechanical">Mechanical</option>
              <option value="electronic">Electronic</option>
              <option value="fixture">Fixture</option>
              <option value="tool">Tool</option>
              <option value="structural">Structural</option>
              <option value="enclosure">Enclosure</option>
              <option value="other">Other</option>
            </select>
          </div>
          
          <div className="flex items-end">
            <div className="flex border border-gray-300 rounded-md">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 ${viewMode === 'grid' ? 'bg-gray-100' : 'hover:bg-gray-50'}`}
                title="Grid View"
              >
                <Grid size={20} className="text-gray-600" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 ${viewMode === 'list' ? 'bg-gray-100' : 'hover:bg-gray-50'}`}
                title="List View"
              >
                <List size={20} className="text-gray-600" />
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Components Display */}
      {components.length === 0 ? (
        <div className="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white shadow-md rounded-lg p-6 text-center">
          <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
            <Package size={32} className="text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No components found</h3>
          <p className="text-gray-600 mb-4">
            {filters.search || filters.type ? 
              'No components match your search criteria.' : 
              'Create your first component to get started or choose from our standard library.'}
          </p>
          <div className="flex justify-center space-x-4">
            {filters.search || filters.type ? (
              <button
                onClick={() => setFilters({ search: '', type: '', projectId: filters.projectId })}
                className="text-blue-600 hover:text-blue-800"
              >
                Clear filters
              </button>
            ) : (
              <>
                <button
                  onClick={() => setShowModal(true)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  Create Component
                </button>
                <button
                  onClick={() => setShowLibrary(true)}
                  className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  Use Standard Library
                </button>
              </>
            )}
          </div>
        </div>
      ) : viewMode === 'grid' ? (
        // Grid View
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {components.map((component) => (
            <div
              key={component.id}
              className="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white shadow-md rounded-lg overflow-hidden border border-gray-200 hover:shadow-lg transition-shadow"
            >
              <div className="h-40 bg-gray-100 flex items-center justify-center relative">
                {component.thumbnail ? (
                  <img 
                    src={component.thumbnail} 
                    alt={component.name} 
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <Package size={64} className="text-gray-300" />
                )}
              </div>
              
              <div className="p-4">
                <div className="flex justify-between items-start">
                  <h2 className="text-lg font-semibold text-gray-900 mb-1">
                    {component.name}
                  </h2>
                  {component.data && component.data && (
                    <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                      {component.data.toLocaleString()}
                    </span>
                  )}
                </div>
                
                {component.description && (
                  <p className="text-gray-600 text-sm mb-3">{component.description}</p>
                )}
                
                <div className="flex justify-between mt-4 pt-4 border-t border-gray-200">
                  <Link href={`/components/${component.id}`} passHref>
                    <span className="text-blue-600 hover:text-blue-800 text-sm">Open</span>
                  </Link>
                  
                  <div className="flex space-x-3">
                    <button
                      onClick={() => handleEditClick(component.data.id)}
                      className="p-1 text-green-600 hover:bg-green-50 rounded"
                      title="Edit"
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      onClick={() => handleDeleteComponent(component.data.id)}
                      className="p-1 text-red-600 hover:bg-red-50 rounded"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        // List View
        <div className="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white shadow-md rounded-lg overflow-hidden border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Project
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Updated
                </th>
                <th scope="col" className="relative px-6 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white divide-y divide-gray-200">
              {components.map((component) => (
                <tr 
                  key={component.id}
                  className="hover:bg-gray-50 cursor-pointer"
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10 bg-gray-100 rounded-md flex items-center justify-center">
                        <Package size={20} className="text-gray-400" />
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">
                          <Link href={`/components/${component.id}`} passHref>
                            {component.name}
                          </Link>
                        </div>
                        {component.description && (
                          <div className="text-sm text-gray-500 truncate max-w-xs">{component.description}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {component.data && component.data && (
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                        {component.data.toString()}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {component.projectId || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(component.data.updatedAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end space-x-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditClick(component.data.id);
                        }}
                        className="p-1 text-green-600 hover:bg-green-50 rounded"
                        title="Edit"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteComponent(component.data.id);
                        }}
                        className="p-1 text-red-600 hover:bg-red-50 rounded"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      
      {/* Predefined Library Modal */}
      <PredefinedLibrary
        libraryType="components"
        onSelectItem={handleSelectLibraryItem}
        isOpen={showLibrary}
        onClose={() => setShowLibrary(false)}
      />
    </div>
  );
}

// Missing List component
const List = ({ className = "", ...props }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={`feather feather-list ${className}`}
    {...props}
  >
    <line x1="8" y1="6" x2="21" y2="6"></line>
    <line x1="8" y1="12" x2="21" y2="12"></line>
    <line x1="8" y1="18" x2="21" y2="18"></line>
    <line x1="3" y1="6" x2="3.01" y2="6"></line>
    <line x1="3" y1="12" x2="3.01" y2="12"></line>
    <line x1="3" y1="18" x2="3.01" y2="18"></line>
  </svg>
);