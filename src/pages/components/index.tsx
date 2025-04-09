// src/pages/components/index.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { 
  Edit, 
  Trash2, 
  Plus, 
  Book, 
  Grid, 
  Package, 
  List, 
  Search, 
  X,
  ExternalLink, 
  Cpu,
  Filter,
  Eye
} from 'react-feather';
import Link from 'next/link';
import Layout from '@/src/components/layout/Layout';
import PredefinedLibrary from '@/src/components/library/PredefinedLibrary';
import LocalComponentsLibraryView from '@/src/components/library/LocalComponentsLibraryView';
import Loading from '@/src/components/ui/Loading';
import { Component } from '@prisma/client';
import { fetchComponents, createComponent, updateComponent, deleteComponent } from '@/src/lib/api/components';
import ExportImportControls from '@/src/components/components/ExportImportControls';
import Metatags from '@/src/components/layout/Metatags';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import ExportImportToolpathsControls from '@/src/components/cam/ToolpathControls';

interface ComponentsFilterState {
  projectId?: string;
  type?: string;
  search: string;
  isPublic?: boolean;
}

export default function ComponentsList() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  // State for filters
  const [filters, setFilters] = useState<ComponentsFilterState>({
    search: '',
    type: '',
    projectId: router.query.projectId as string || '',
    isPublic: undefined
  });
  
  // State for the modals
  const [showModal, setShowModal] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showLocalLibrary, setShowLocalLibrary] = useState(false);
  const [selectedComponent, setSelectedComponent] = useState<Component | null>(null);
  
  // State for data and UI
  const [components, setComponents] = useState<Component[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  // View mode (grid or list)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  // State for CAD element data
  const [cadElementData, setCadElementData] = useState<any>(null);
  
  // Projects list for dropdown
  const [projects, setProjects] = useState<{id: string, name: string}[]>([]);
  
  // Form state
  const [formData, setFormData] = useState({

    name: '',
    description: '',
    type: 'mechanical',
    projectId: '',
    isPublic: false,
    thumbnail: ''
  });
  
  // Load projects for the dropdown
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const response = await fetch('/api/projects');
        if (response.ok) {
          const data = await response.json();
          setProjects(data.map((p: any) => ({ id: p.id, name: p.name })));
          
          // If projectId is specified in URL and not yet in formData, set it
          if (router.query.projectId && !formData.projectId) {
            setFormData(prev => ({
              ...prev,
              projectId: router.query.projectId as string
            }));
          }
        }
      } catch (error) {
        console.error("Error fetching projects:", error);
      }
    };
    
    if (status === 'authenticated') {
      fetchProjects();
    }
  }, [status, router.query.projectId, formData.projectId]);
  
  // Check if we should show the "create from CAD" modal based on URL params or localStorage
  useEffect(() => {
    const checkForCadElement = () => {
      // Check for URL parameter first
      if (router.query.createFromCad === 'true') {
        // Try to get element data from localStorage
        const storedElement = localStorage.getItem('cadSelectedElementForComponent');
        if (storedElement) {
          try {
            const elementData = JSON.parse(storedElement);
            setCadElementData(elementData);
            
            // Pre-populate form with element data
            setFormData(prev => ({
              ...prev,
              name: `Component from ${elementData.type || 'CAD'} ${elementData.id.substring(0, 6)}`,
              description: `Auto-generated from CAD element ${elementData.id}`,
              type: elementData.type === 'mechanical' ? 'mechanical' : 'custom'
            }));
            
            // Show creation modal
            setShowModal(true);
            
            // Clear localStorage
            localStorage.removeItem('cadSelectedElementForComponent');
            
            // Clean up URL
            const { createFromCad, ...otherParams } = router.query;
            router.replace({
              pathname: router.pathname,
              query: otherParams
            }, undefined, { shallow: true });
          } catch (error) {
            console.error("Error parsing stored CAD element:", error);
            toast.error("Couldn't load element data from CAD editor");
          }
        }
      }
    };
    
    checkForCadElement();
  }, [router.query, router]);
  
  // Fetch data when component mounts or filters change
  useEffect(() => {
    if (status === 'authenticated') {
      fetchComponentsData();
    }
  }, [filters, status]);
  
  // Update projectId in formData when it changes in filters
  useEffect(() => {
    if (filters.projectId) {
      setFormData(prev => ({...prev, projectId: filters.projectId || ''}));
    }
  }, [filters.projectId]);
  
  const fetchComponentsData = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const componentsData = await fetchComponents({
        projectId: filters.projectId,
        type: filters.type,
        search: filters.search,
        
      });
      
      setComponents(componentsData as Component[]);
    } catch (err) {
      console.error('Error fetching components:', err);
      setError(err instanceof Error ? err : new Error('An unknown error occurred'));
    } finally {
      setIsLoading(false);
    }
  };
  
  // Handle filter changes
  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFilters(prev => ({ ...prev, [name]: checked }));
    } else {
      setFilters(prev => ({ ...prev, [name]: value }));
    }
  };
  
  // Clear all filters
  const clearFilters = () => {
    setFilters({
      search: '',
      type: '',
      projectId: filters.projectId, // Keep project filter if it exists
      isPublic: undefined
    });
  };
  
  // Handle form changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({ ...prev, [name]: checked }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };
  
  // Reset form data
  const resetForm = () => {
    setFormData({
    
      name: '',
      description: '',
      type: '',
      projectId: filters.projectId || '',
      isPublic: false,
      thumbnail: ''
    });
    setSelectedComponent(null);
    setCadElementData(null);
  };
  
  // Navigate to CAD editor to select an element
  const handleGoToCADForElement = () => {
    router.push('/cad?selectForComponent=true');
  };
  
  // Handle component creation/update
  const handleCreateComponent = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      // Create component data structure
      const componentData = {
        ...formData,
        data: cadElementData ? {
          // Include the CAD element data if available
          ...cadElementData,
          type: formData.type,
          version: "1.0",
          properties: cadElementData.properties || {},
          geometry: cadElementData.geometry || { type: formData.type, elements: [] }
        } : {
          // Default data if no CAD element
          type: formData.type,
          version: "1.0",
          properties: {},
          geometry: { type: formData.type, elements: [] }
        }
      };
      
      let result;
      
      if (selectedComponent) {
        // Update existing component
        result = await updateComponent({
          id: selectedComponent.id,
          name: formData.name,
          description: formData.description,
          type: formData.type,
          isPublic: formData.isPublic,
          data: componentData.data
        });
        toast.success('Component updated successfully');
      } else {
        // Create new component
        result = await createComponent(componentData);
        toast.success('Component created successfully');
      }
      
      // Refresh the component list
      await fetchComponentsData();
      
      // Close the modal
      setShowModal(false);
      resetForm();
      
      // Optionally navigate to the new component
      if (result.id && !selectedComponent) {
        router.push(`/components/${result.id}`);
      }
    } catch (err) {
      console.error('Error saving component:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to save component');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Handle component deletion
  const handleDeleteComponent = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!id) {
      toast.error('Cannot delete: Component ID is missing');
      return;
    }
    
    if (!confirm('Are you sure you want to delete this component?')) return;
    
    setIsLoading(true);
    
    try {
      await deleteComponent(id);
      toast.success('Component deleted successfully');
      
      // Refresh the list
      await fetchComponentsData();
    } catch (err) {
      console.error('Failed to delete component:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to delete component');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Handle selecting item from library
  const handleSelectLibraryItem = async (item: any) => {
    try {
      setIsLoading(true);
      
      // Create component from library item
      const componentData = {
       
        name: item.name,
        description: item.description || '',
        type: item.type || '',
        projectId: filters.projectId || '',
        data: item.data || { type: item.type, version: "1.0" },
        isPublic: false
      };
      
      const result = await createComponent(componentData);
      
      toast.success('Component created from library successfully');
      setShowLibrary(false);
      
      // Refresh the list
      await fetchComponentsData();
      
      // Optionally navigate to the new component
      if (result.id) {
        router.push(`/components/${result.id}`);
      }
    } catch (err) {
      console.error('Failed to create component from library:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to create component from library');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Handle loading a local component
  const handleLoadLocalComponent = (component: any) => {
    try {
      setIsLoading(true);
      
      const componentData = {
        
        name: component.name,
        description: component.description || '',
        type: component.type || '',
        projectId: filters.projectId || '',
        data: component.data || { type: component.type, version: "1.0" },
        isPublic: false
      };
      
      createComponent(componentData)
        .then(result => {
          toast.success('Component imported from local library');
          fetchComponentsData();
          
          // Optionally navigate to the new component
          if (result.id) {
            router.push(`/components/${result.id}`);
          }
        });
        
    } catch (err) {
      console.error('Failed to import local component:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to import local component');
    } finally {
      setIsLoading(false);
      setShowLocalLibrary(false);
    }
  };
  
  // Handle sending a component to CAD
  const handleSendToCAD = (component: Component, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    
    try {
      // Check if component and component.id exist
      if (!component || !component.id) {
        toast.error('Cannot send to CAD: Component data is missing');
        return;
      }
      
      // Save to localStorage for CAD to pick up
      localStorage.setItem('componentToLoadInCAD', JSON.stringify({
        id: component.id,
        name: component.name,
        data: component.data
      }));
      
      // Redirect to CAD editor
      router.push({
        pathname: '/cad',
        query: { loadComponent: component.id }
      });
      
      toast.success(`Opening ${component.name} in CAD editor`);
    } catch (err) {
      console.error('Failed to send component to CAD:', err);
      toast.error('Failed to send component to CAD editor');
    }
  };
  
  if (status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loading />
      </div>
    );
  }
  
  if (status === 'unauthenticated') {
    router.push('/auth/signin');
    return null;
  }
  
  return (
    <>
      <Metatags title={'Components Library'} />
      
      <Layout>
        <div className="p-4 md:p-6">
          <div className="flex flex-col md:flex-row md:justify-between md:items-center mb-6 gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Component Library</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">Create, manage and reuse components across your projects</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <motion.button
                onClick={() => setShowLocalLibrary(true)}
                className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 flex items-center"
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.95 }}
              >
                <Package size={18} className="mr-2" />
                Local Library
              </motion.button>
              <motion.button
                onClick={() => setShowLibrary(true)}
                className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 flex items-center"
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.95 }}
              >
                <Book size={18} className="mr-2" />
                Standard Library
              </motion.button>
              <motion.button
                onClick={handleGoToCADForElement}
                className="bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 flex items-center"
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.95 }}
              >
                <Cpu size={18} className="mr-2" />
                Create from CAD
              </motion.button>
              <motion.button
                onClick={() => { setSelectedComponent(null); setShowModal(true); }}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center"
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.95 }}
              >
                <Plus size={18} className="mr-2" />
                New Component
              </motion.button>
            </div>
          </div>
          
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 mb-6">
            <ExportImportToolpathsControls entityType="components" />
          </div>
          
          {/* Search and filters */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 mb-6">
            <div className="flex flex-col md:flex-row md:items-center gap-4">
              <div className="flex-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search size={18} className="text-gray-400" />
                </div>
                <input
                  type="text"
                  name="search"
                  value={filters.search}
                  onChange={handleFilterChange}
                  placeholder="Search components..."
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              
              <div className="w-full md:w-48">
                <select
                  name="type"
                  value={filters.type}
                  onChange={handleFilterChange}
                  className="block w-full pl-3 pr-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">All Types</option>
                  <option value="mechanical">Mechanical</option>
                  <option value="electronic">Electronic</option>
                  <option value="fixture">Fixture</option>
                  <option value="tool">Tool</option>
                  <option value="structural">Structural</option>
                  <option value="enclosure">Enclosure</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              
              <div className="w-full md:w-64">
                <select
                  name="projectId"
                  value={filters.projectId || ''}
                  onChange={handleFilterChange}
                  className="block w-full pl-3 pr-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">All Projects</option>
                  {projects.map(project => (
                    <option key={project.id} value={project.id}>{project.name}</option>
                  ))}
                </select>
              </div>
              
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="isPublic"
                  name="isPublic"
                  checked={filters.isPublic === true}
                  onChange={(e) => setFilters(prev => ({ ...prev, isPublic: e.target.checked ? true : undefined }))}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="isPublic" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                  Public only
                </label>
              </div>
              
              <div className="flex items-center space-x-4">
                <button
                  onClick={clearFilters}
                  className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 flex items-center"
                >
                  <X size={16} className="mr-1" />
                  Clear Filters
                </button>
                
                <div className="flex border border-gray-300 dark:border-gray-700 rounded-md overflow-hidden">
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`p-2 ${viewMode === 'grid' ? 'bg-blue-50 dark:bg-blue-900 text-blue-600 dark:text-blue-400' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400'}`}
                    title="Grid View"
                  >
                    <Grid size={18} />
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`p-2 ${viewMode === 'list' ? 'bg-blue-50 dark:bg-blue-900 text-blue-600 dark:text-blue-400' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400'}`}
                    title="List View"
                  >
                    <List size={18} />
                  </button>
                </div>
              </div>
            </div>
            
            {/* Active Filters */}
            {(filters.search || filters.type || filters.projectId || filters.isPublic) && (
              <div className="mt-4 flex flex-wrap gap-2">
                <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center">
                  <Filter size={14} className="mr-1" />
                  Active Filters:
                </div>
                
                {filters.search && (
                  <div className="text-xs bg-blue-50 dark:bg-blue-800/30 text-blue-700 dark:text-blue-300 px-2 py-1 rounded-full flex items-center">
                    Search: {filters.search}
                    <button
                      onClick={() => setFilters(prev => ({ ...prev, search: '' }))}
                      className="ml-1 text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-200"
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}
                
                {filters.type && (
                  <div className="text-xs bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-1 rounded-full flex items-center">
                    Type: {filters.type}
                    <button
                      onClick={() => setFilters(prev => ({ ...prev, type: '' }))}
                      className="ml-1 text-green-500 dark:text-green-400 hover:text-green-700 dark:hover:text-green-200"
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}
                
                {filters.projectId && (
                  <div className="text-xs bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-2 py-1 rounded-full flex items-center">
                    Project: {projects.find(p => p.id === filters.projectId)?.name || 'Unknown'}
                    <button
                      onClick={() => setFilters(prev => ({ ...prev, projectId: '' }))}
                      className="ml-1 text-purple-500 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-200"
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}
                
                {filters.isPublic && (
                  <div className="text-xs bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-2 py-1 rounded-full flex items-center">
                    Public Only
                    <button
                      onClick={() => setFilters(prev => ({ ...prev, isPublic: undefined }))}
                      className="ml-1 text-amber-500 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-200"
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          
          {/* Components Display */}
          {isLoading && components.length === 0 ? (
            <div className="flex h-64 items-center justify-center">
              <Loading />
            </div>
          ) : error ? (
            <div className="bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-300 p-4 rounded-md">
              {error.message}
            </div>
          ) : components.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-6 text-center">
              <div className="w-16 h-16 bg-gray-200 dark:bg-gray-900 rounded-full flex items-center justify-center mx-auto mb-4">
                <Package size={24} className="text-gray-400 dark:text-gray-500" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No components found</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                {filters.search || filters.type || filters.projectId || filters.isPublic ? 
                  'No components match your search criteria.' : 
                  'Create your first component to get started or choose from our standard library.'}
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                {filters.search || filters.type || filters.projectId || filters.isPublic ? (
                  <button
                    onClick={clearFilters}
                    className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
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
                    <button
                      onClick={handleGoToCADForElement}
                      className="bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      Create from CAD
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : viewMode === 'grid' ? (
            // Grid View
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <AnimatePresence>
                {components.map((component) => (
                  <motion.div
                    key={component.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.3 }}
                    className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow cursor-pointer"
                    onClick={() => router.push(`/components/${component.id}`)}
                  >
                    <div className="h-40 bg-gray-100 dark:bg-gray-900 flex items-center justify-center relative">
                      {component.thumbnail ? (
                        <img 
                          src={component.thumbnail} 
                          alt={component.name} 
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <Package size={64} className="text-gray-300 dark:text-gray-700" />
                      )}
                      
                      {/* Component Type Badge */}
                      <span className="absolute top-2 right-2 px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300">
                        {component.type || 'Custom'}
                      </span>
                      
                      {/* Public Badge */}
                      {component.isPublic && (
                        <span className="absolute top-2 left-2 px-2 py-1 text-xs font-semibold rounded-full bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-300">
                          Public
                        </span>
                      )}
                    </div>
                    
                    <div className="p-4">
                      <div className="flex justify-between items-start">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                          {component.name}
                        </h2>
                      </div>
                      
                      {component.description && (
                        <p className="text-gray-600 dark:text-gray-400 text-sm mb-3 line-clamp-2">{component.description}</p>
                      )}
                      
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                        ID: <code className="bg-gray-100 dark:bg-gray-900 px-1 rounded font-mono">{component.id.substring(0, 8)}...</code>
                      </div>
                      
                      <div className="flex justify-between mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          Updated: {new Date(component.updatedAt).toLocaleDateString()}
                        </span>
                        
                        <div className="flex space-x-3">
                          <button
                            onClick={(e) => handleSendToCAD(component, e)}
                            className="p-1 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded"
                            title="Use in CAD"
                          >
                            <Cpu size={16} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/components/${component.id}`);
                            }}
                            className="p-1 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
                            title="Edit"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            onClick={(e) => handleDeleteComponent(component.id, e)}
                            className="p-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          ) : (
            // List View
            <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Name
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Type
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Project
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Updated
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      ID
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Status
                    </th>
                    <th scope="col" className="relative px-6 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {components.map((component) => (
                    <motion.tr 
                      key={component.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3 }}
                      className="hover:bg-gray-50 dark:hover:bg-gray-900/50 cursor-pointer"
                      onClick={() => router.push(`/components/${component.id}`)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10 bg-gray-100 dark:bg-gray-900 rounded-md flex items-center justify-center">
                            {component.thumbnail ? (
                              <img 
                                src={component.thumbnail} 
                                alt="" 
                                className="h-10 w-10 rounded-md object-cover"
                              />
                            ) : (
                              <Package size={20} className="text-gray-400 dark:text-gray-600" />
                            )}
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                              {component.name}
                            </div>
                            {component.description && (
                              <div className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-xs">
                                {component.description}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300">
                          {component.type || 'Custom'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {projects.find(p => p.id === component.projectId)?.name || component.projectId || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {new Date(component.updatedAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500 dark:text-gray-400">
                        {component.id.substring(0, 8)}...
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {component.isPublic ? (
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-300">
                            Public
                          </span>
                        ) : (
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-300">
                            Private
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end space-x-2">
                          <button
                            onClick={(e) => handleSendToCAD(component, e)}
                            className="p-1 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded"
                            title="Use in CAD"
                          >
                            <Cpu size={16} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/components/${component.id}?preview=true`);
                            }}
                            className="p-1 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded"
                            title="Preview"
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/components/${component.id}`);
                            }}
                            className="p-1 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
                            title="Edit"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            onClick={(e) => handleDeleteComponent(component.id, e)}
                            className="p-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                            title="Delete"
                            disabled={isLoading}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          
          {/* Component Creation Modal */}
          {showModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <motion.div 
                className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.3 }}
              >
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                    {selectedComponent ? 'Edit Component' : cadElementData ? 'Create Component from CAD Element' : 'Create New Component'}
                  </h3>
                </div>
                
                <form onSubmit={handleCreateComponent}>
                  <div className="px-6 py-4 max-h-[70vh] overflow-y-auto">
                    {/* Display a preview of the CAD element if available */}
                    {cadElementData && (
                      <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-800/30 rounded-md">
                        <div className="flex items-center text-sm text-blue-700 dark:text-blue-300 font-medium mb-2">
                          <Cpu size={16} className="mr-2" />
                          Creating from CAD Element
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-400 font-mono bg-gray-100 dark:bg-gray-900 p-2 rounded overflow-auto max-h-24">
                          <code>
                            ID: {cadElementData.id}<br />
                            Type: {cadElementData.type || 'Unknown'}<br />
                            Properties: {JSON.stringify(cadElementData.properties || {})}<br />
                          </code>
                        </div>
                      </div>
                    )}
                    
                    <div className="mb-4">
                      <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Component Name
                      </label>
                      <input
                        type="text"
                        id="name"
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        required
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    
                    <div className="mb-4">
                      <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Description (optional)
                      </label>
                      <textarea
                        id="description"
                        name="description"
                        rows={3}
                        value={formData.description}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      ></textarea>
                    </div>
                    
                    <div className="mb-4">
                      <label htmlFor="type" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Component Type
                      </label>
                      <select
                        id="type"
                        name="type"
                        value={formData.type}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="mechanical">Mechanical</option>
                        <option value="electronic">Electronic</option>
                        <option value="fixture">Fixture</option>
                        <option value="tool">Tool</option>
                        <option value="structural">Structural</option>
                        <option value="enclosure">Enclosure</option>
                        <option value="custom">Custom</option>
                      </select>
                    </div>
                    
                    <div className="mb-4">
                      <label htmlFor="projectId" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Project
                      </label>
                      <select
                        id="projectId"
                        name="projectId"
                        value={formData.projectId}
                        onChange={handleChange}
                        required
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="" disabled>Select a project</option>
                        {projects.map(project => (
                          <option key={project.id} value={project.id}>{project.name}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div className="mb-4">
                      <label htmlFor="thumbnail" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Thumbnail URL (optional)
                      </label>
                      <input
                        type="text"
                        id="thumbnail"
                        name="thumbnail"
                        value={formData.thumbnail}
                        onChange={handleChange}
                        placeholder="https://example.com/image.png"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      />
                      {formData.thumbnail && (
                        <div className="mt-2">
                          <img
                            src={formData.thumbnail}
                            alt="Thumbnail preview"
                            className="h-20 object-contain bg-gray-100 dark:bg-gray-900 rounded border border-gray-300 dark:border-gray-700"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJmZWF0aGVyIGZlYXRoZXItaW1hZ2UiPjxyZWN0IHg9IjMiIHk9IjMiIHdpZHRoPSIxOCIgaGVpZ2h0PSIxOCIgcng9IjIiIHJ5PSIyIj48L3JlY3Q+PGNpcmNsZSBjeD0iOC41IiBjeT0iOC41IiByPSIxLjUiPjwvY2lyY2xlPjxwb2x5bGluZSBwb2ludHM9IjIxIDE1IDE2IDEwIDUgMjEiPjwvcG9seWxpbmU+PC9zdmc+';
                            }}
                          />
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center mb-4">
                      <input
                        type="checkbox"
                        id="isPublic"
                        name="isPublic"
                        checked={formData.isPublic}
                        onChange={(e) => setFormData(prev => ({...prev, isPublic: e.target.checked}))}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-700 rounded"
                      />
                      <label htmlFor="isPublic" className="ml-2 block text-sm text-gray-900 dark:text-gray-300">
                        Make component public (visible to all users)
                      </label>
                    </div>
                  </div>
                  
                  <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900 flex justify-end space-x-3 rounded-b-lg">
                    <button
                      type="button"
                      className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                      onClick={() => {
                        setShowModal(false);
                        setSelectedComponent(null);
                        resetForm();
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-blue-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
                      disabled={isLoading || !formData.projectId}
                    >
                      {isLoading ? 'Saving...' : selectedComponent ? 'Update' : 'Create'}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
          
          {/* Predefined Library Modal */}
          {showLibrary && (
            <PredefinedLibrary
              libraryType="components"
              onSelectItem={handleSelectLibraryItem}
              isOpen={showLibrary}
              onClose={() => setShowLibrary(false)}
            />
          )}
          
          {/* Local Library Modal */}
          {showLocalLibrary && (
            <LocalComponentsLibraryView
              onLoadComponent={handleLoadLocalComponent}
              onClose={() => setShowLocalLibrary(false)}
              showCloseButton={true}
            />
          )}
        </div>
      </Layout>
    </>
  );
}
