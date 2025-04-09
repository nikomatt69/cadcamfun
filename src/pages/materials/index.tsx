import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { 
  Edit, 
  Trash2, 
  Plus, 
  Book, 
  Grid, 
  Layers, 
  Search,
  X,
  ExternalLink,
  Cpu,
  Filter
} from 'react-feather';
import Link from 'next/link';
import Layout from '@/src/components/layout/Layout';
import PredefinedLibrary from '@/src/components/library/PredefinedLibrary';
import LocalMaterialsLibraryView from '@/src/components/library/LocalMaterialsLibraryView';
import Loading from '@/src/components/ui/Loading';
import { Material } from '@prisma/client';
import { fetchMaterials, createMaterial, updateMaterial, deleteMaterial } from '@/src/lib/api/materials';
import ExportImportControls from '@/src/components/components/ExportImportControls';
import Metatags from '@/src/components/layout/Metatags';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import ExportImportToolpathsControls from '@/src/components/cam/ToolpathControls';

interface MaterialsFilterState {
  search: string;
  density: string;
}

export default function MaterialsList() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  // State for filters
  const [filters, setFilters] = useState<MaterialsFilterState>({
    search: '',
    density: ''
  });
  
  // State for the modals
  const [showModal, setShowModal] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showLocalLibrary, setShowLocalLibrary] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  
  // State for data and UI
  const [materials, setMaterials] = useState<Material[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    density: 0,
    hardness: 0,
    color: '#cccccc'
  });
  
  // Fetch materials when component mounts or filters change
  useEffect(() => {
    if (status === 'authenticated') {
      fetchMaterialsData();
    }
  }, [filters, status]);
  
  const fetchMaterialsData = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const materialsData = await fetchMaterials({
        search: filters.search,
      
      });
      
      setMaterials(materialsData);
    } catch (err) {
      console.error('Error fetching materials:', err);
      setError(err instanceof Error ? err : new Error('An unknown error occurred'));
    } finally {
      setIsLoading(false);
    }
  };
  
  // Handle filter changes
  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };
  
  // Clear all filters
  const clearFilters = () => {
    setFilters({
      search: '',
      density: ''
    });
  };
  
  // Handle form changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  // Reset form data
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
  
  // Handle material creation/update
  const handleCreateMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      const materialData = {
        name: formData.name,
        description: formData.description,
        properties: {
          density: parseFloat(formData.density.toString()),
          hardness: parseFloat(formData.hardness.toString()),
          color: formData.color
        }
      };
      
      let result;
      
      if (selectedMaterial) {
        // Update existing material
        result = await updateMaterial({
          id: selectedMaterial.id,
          ...materialData
        });
        toast.success('Material updated successfully');
      } else {
        // Create new material
        result = await createMaterial(materialData);
        toast.success('Material created successfully');
      }
      
      // Refresh the materials list
      await fetchMaterialsData();
      
      // Close the modal
      setShowModal(false);
      resetForm();
      
      // Optionally navigate to the new material
      if (result.id && !selectedMaterial) {
        router.push(`/materials/${result.id}`);
      }
    } catch (err) {
      console.error('Error saving material:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to save material');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Handle opening the edit modal
  const handleEditClick = (material: Material, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedMaterial(material);
    
    // Extract properties from the material
    const properties = material.properties as any;
    
    setFormData({
      name: material.name,
      description: material.description || '',
      density: properties.density || 0,
      hardness: properties.hardness || 0,
      color: properties.color || '#cccccc'
    });
    
    setShowModal(true);
  };
  
  // Send material to CAD
  const handleSendToCAD = (material: Material, e: React.MouseEvent) => {
    e.stopPropagation();
    
    try {
      // Save to localStorage for CAD to pick up
      localStorage.setItem('materialToLoadInCAD', JSON.stringify({
        id: material.id,
        name: material.name,
        properties: material.properties
      }));
      
      // Redirect to CAD editor
      router.push({
        pathname: '/cad',
        query: { loadMaterial: material.id }
      });
      
      toast.success(`Opening ${material.name} in CAD editor`);
    } catch (err) {
      console.error('Failed to send material to CAD:', err);
      toast.error('Failed to send material to CAD editor');
    }
  };
  
  // Handle material deletion
  const handleDeleteMaterial = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this material?')) return;
    
    setIsLoading(true);
    
    try {
      await deleteMaterial(id);
      toast.success('Material deleted successfully');
      
      // Refresh the list
      await fetchMaterialsData();
    } catch (err) {
      console.error('Failed to delete material:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to delete material');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Handle selecting item from library
  const handleSelectLibraryItem = async (item: any) => {
    try {
      setIsLoading(true);
      
      // Create material from library item
      const materialData = {
        name: item.name,
        description: item.description,
        properties: item.properties
      };
      
      const result = await createMaterial(materialData);
      toast.success('Material created from library successfully');
      
      // Refresh the list
      await fetchMaterialsData();
      setShowLibrary(false);
      
      // Navigate to the new material
      if (result.id) {
        router.push(`/materials/${result.id}`);
      }
    } catch (err) {
      console.error('Failed to create material from library:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to create material from library');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Handle loading a local material
  const handleLoadLocalMaterial = (material: any) => {
    try {
      setIsLoading(true);
      
      const materialData = {
        name: material.name,
        description: material.description || '',
        properties: material.properties || {
          density: 0,
          hardness: 0,
          color: '#cccccc'
        }
      };
      
      createMaterial(materialData)
        .then((result) => {
          toast.success('Material imported from local library');
          fetchMaterialsData();
          
          // Navigate to the new material
          if (result.id) {
            router.push(`/materials/${result.id}`);
          }
        });
        
    } catch (err) {
      console.error('Failed to import local material:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to import local material');
    } finally {
      setIsLoading(false);
      setShowLocalLibrary(false);
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
      <Metatags title={'Materials Library'} />
      
      <Layout>
        <div className="p-4 md:p-6">
          <div className="flex flex-col md:flex-row md:justify-between md:items-center mb-6 gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Materials Library</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">Manage materials for use in your CAD/CAM projects</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setShowLocalLibrary(true)}
                className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 flex items-center"
              >
                <Layers size={18} className="mr-2" />
                Local Library
              </button>
              <button
                onClick={() => setShowLibrary(true)}
                className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 flex items-center"
              >
                <Book size={18} className="mr-2" />
                Standard Materials
              </button>
              <button
                onClick={() => {
                  setSelectedMaterial(null);
                  setShowModal(true);
                }}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center"
              >
                <Plus size={18} className="mr-2" />
                New Material
              </button>
            </div>
          </div>
          
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 mb-6">
            <ExportImportToolpathsControls entityType="materials" />
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
                  placeholder="Search materials..."
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              
              <div className="w-full md:w-48">
                <select
                  name="density"
                  value={filters.density}
                  onChange={handleFilterChange}
                  className="block w-full pl-3 pr-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">All Densities</option>
                  <option value="low">Low Density (&lt; 1 g/cm³)</option>
                  <option value="medium">Medium Density (1-5 g/cm³)</option>
                  <option value="high">High Density (&gt; 5 g/cm³)</option>
                </select>
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
                    <Layers size={18} />
                  </button>
                </div>
              </div>
            </div>
          </div>
          
          {/* Materials List */}
          {isLoading && materials.length === 0 ? (
            <div className="flex h-64 items-center justify-center">
              <Loading />
            </div>
          ) : error ? (
            <div className="bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-300 p-4 rounded-md">
              {error.message}
            </div>
          ) : materials.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-6 text-center">
              <div className="w-16 h-16 bg-gray-200 dark:bg-gray-900 rounded-full flex items-center justify-center mx-auto mb-4">
                <Layers size={24} className="text-gray-400 dark:text-gray-500" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No materials yet</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                {filters.search || filters.density ? 
                  'No materials match your search criteria.' : 
                  'Add materials to use in your CAD/CAM projects for accurate simulations and machining or choose from our standard library.'}
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                {filters.search || filters.density ? (
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
                      Create Material
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <AnimatePresence>
                {materials.map((material) => {
                  // Extract properties from material
                  const properties = material.properties as any;
                  
                  return (
                    <motion.div 
                      key={material.id} 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.3 }}
                      className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow cursor-pointer"
                      onClick={() => router.push(`/materials/${material.id}`)}
                    >
                      <div className="p-6">
                        <div className="flex items-center mb-4">
                          <motion.div 
                            className="w-8 h-8 rounded-full mr-3"
                            style={{ backgroundColor: properties?.color || '#cccccc' }}
                            whileHover={{ scale: 1.1 }}
                          />
                          <div>
                            <h3 className="text-lg font-medium text-gray-900 dark:text-white">{material.name}</h3>
                            {material.description && (
                              <p className="text-sm text-gray-500 dark:text-gray-400">{material.description}</p>
                            )}
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
                          {properties && (
                            <>
                              {properties.density !== undefined && (
                                <div className="flex flex-col">
                                  <span className="text-gray-500 dark:text-gray-400">Density</span>
                                  <span className="font-medium text-gray-900 dark:text-white">{properties.density} g/cm³</span>
                                </div>
                              )}
                              
                              {properties.hardness !== undefined && (
                                <div className="flex flex-col">
                                  <span className="text-gray-500 dark:text-gray-400">Hardness</span>
                                  <span className="font-medium text-gray-900 dark:text-white">{properties.hardness} HRC</span>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                      
                      <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-3 bg-gray-50 dark:bg-gray-900 flex justify-between items-center">
                        <button
                          onClick={(e) => handleSendToCAD(material, e)}
                          className="text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 flex items-center text-sm"
                        >
                          <Cpu size={14} className="mr-1" />
                          Use in CAD
                        </button>
                        
                        <div className="flex space-x-2">
                          <button 
                            onClick={(e) => handleEditClick(material, e)}
                            className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
                            title="Edit Material"
                          >
                            <Edit size={16} />
                          </button>
                          <button 
                            onClick={(e) => handleDeleteMaterial(material.id, e)}
                            className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                            title="Delete Material"
                            disabled={isLoading}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Material
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Density
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Hardness
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Updated
                    </th>
                    <th scope="col" className="relative px-6 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {materials.map((material) => {
                    // Extract properties from material
                    const properties = material.properties as any;
                    
                    return (
                      <tr 
                        key={material.id}
                        className="hover:bg-gray-50 dark:hover:bg-gray-900/50 cursor-pointer"
                        onClick={() => router.push(`/materials/${material.id}`)}
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div 
                              className="w-8 h-8 rounded-full mr-3"
                              style={{ backgroundColor: properties?.color || '#cccccc' }}
                            ></div>
                            <div>
                              <div className="text-sm font-medium text-gray-900 dark:text-white">{material.name}</div>
                              {material.description && (
                                <div className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-xs">{material.description}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-gray-900 dark:text-white">{properties?.density || 0} g/cm³</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-gray-900 dark:text-white">{properties?.hardness || 0} HRC</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {new Date(material.updatedAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex justify-end space-x-2">
                            <button
                              onClick={(e) => handleSendToCAD(material, e)}
                              className="p-1 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded"
                              title="Use in CAD"
                            >
                              <Cpu size={16} />
                            </button>
                            <button
                              onClick={(e) => handleEditClick(material, e)}
                              className="p-1 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
                              title="Edit"
                            >
                              <Edit size={16} />
                            </button>
                            <button
                              onClick={(e) => handleDeleteMaterial(material.id, e)}
                              className="p-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                              title="Delete"
                              disabled={isLoading}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          
          {/* Material Creation Modal */}
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
                    {selectedMaterial ? 'Edit Material' : 'Create New Material'}
                  </h3>
                </div>
                
                <form onSubmit={handleCreateMaterial}>
                  <div className="px-6 py-4">
                    <div className="mb-4">
                      <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Material Name
                      </label>
                      <input
                        type="text"
                        id="name"
                        name="name"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        value={formData.name}
                        onChange={handleChange}
                        required
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
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        value={formData.description}
                        onChange={handleChange}
                      ></textarea>
                    </div>
                    
                    <div className="mb-4">
                      <label htmlFor="color" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Color
                      </label>
                      <div className="flex items-center space-x-3">
                        <input
                          type="color"
                          id="color"
                          name="color"
                          className="h-10 w-20 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                          value={formData.color}
                          onChange={handleChange}
                        />
                        <input
                          type="text"
                          name="color"
                          className="w-32 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white font-mono focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                          value={formData.color}
                          onChange={handleChange}
                          pattern="^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$"
                          title="Valid hex color (e.g. #FF0000)"
                        />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="mb-4">
                        <label htmlFor="density" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Density (g/cm³)
                        </label>
                        <input
                          type="number"
                          id="density"
                          name="density"
                          step="0.01"
                          min="0"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                          value={formData.density}
                          onChange={handleChange}
                          required
                        />
                      </div>
                      
                      <div className="mb-4">
                        <label htmlFor="hardness" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Hardness (HRC)
                        </label>
                        <input
                          type="number"
                          id="hardness"
                          name="hardness"
                          step="0.1"
                          min="0"
                          max="100"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                          value={formData.hardness}
                          onChange={handleChange}
                          required
                        />
                      </div>
                    </div>
                  </div>
                  
                  <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900 flex justify-end space-x-3 rounded-b-lg">
                    <button
                      type="button"
                      className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                      onClick={() => {
                        setShowModal(false);
                        setSelectedMaterial(null);
                        resetForm();
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-blue-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                      disabled={isLoading}
                    >
                      {isLoading ? 'Saving...' : selectedMaterial ? 'Update' : 'Create'}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
          
          {/* Predefined Library Modal */}
          {showLibrary && (
            <PredefinedLibrary
              libraryType="materials"
              onSelectItem={handleSelectLibraryItem}
              isOpen={showLibrary}
              onClose={() => setShowLibrary(false)}
            />
          )}
          
          {/* Local Library Modal */}
          {showLocalLibrary && (
            <LocalMaterialsLibraryView
              onLoadMaterial={handleLoadLocalMaterial}
              onClose={() => setShowLocalLibrary(false)}
              showCloseButton={true}
            />
          )}
        </div>
      </Layout>
    </>
  );
}