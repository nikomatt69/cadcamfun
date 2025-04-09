import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { 
  Edit, 
  Trash2, 
  Plus, 
  Book, 
  Settings,
  Search,
  X,
  Filter,
  Copy,
  Share2,
  Tool,
  AlertCircle,
  Clock
} from 'react-feather';
import Layout from '@/src/components/layout/Layout';
import PredefinedLibrary from '@/src/components/library/PredefinedLibrary';
import Loading from '@/src/components/ui/Loading';
import { 
  getMachineConfigs, 
  createMachineConfig, 
  updateMachineConfig, 
  deleteMachineConfig,
  cloneMachineConfig,
  shareMachineConfig,
  MachineConfig,
  WorkVolume,
  MachineConfigDetails
} from 'src/lib/api/machineConfigApi';
import ExportImportControls from '@/src/components/components/ExportImportControls';
import Metatags from '@/src/components/layout/Metatags';
import toast from 'react-hot-toast';
import { AnimatePresence, motion } from 'framer-motion';
import { formatDistance } from 'date-fns';
import { debounce } from 'lodash';

interface MachineConfigFilterState {
  type: string;
  search: string;
  showPublic: boolean;
}

interface MachineConfigFormState {
  name: string;
  description: string;
  type: 'mill' | 'lathe' | 'printer' | 'laser';
  maxSpindleSpeed: number;
  maxFeedRate: number;
  workVolumeX: number;
  workVolumeY: number;
  workVolumeZ: number;
  controller: string;
  isPublic: boolean;
}

export default function MachineConfigsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  // State for filters
  const [filters, setFilters] = useState<MachineConfigFilterState>({
    type: '',
    search: '',
    showPublic: false
  });
  
  // State for the modals
  const [showModal, setShowModal] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState<string | null>(null);
  const [selectedConfig, setSelectedConfig] = useState<MachineConfig | null>(null);
  
  // State for data and UI
  const [configs, setConfigs] = useState<MachineConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  // Form state
  const [formData, setFormData] = useState<MachineConfigFormState>({
    name: '',
    description: '',
    type: 'mill',
    maxSpindleSpeed: 10000,
    maxFeedRate: 5000,
    workVolumeX: 300,
    workVolumeY: 300,
    workVolumeZ: 100,
    controller: '',
    isPublic: false
  });

  // Fetch configs when component mounts or non-search filters change
  useEffect(() => {
    if (status === 'authenticated') {
      fetchConfigs();
    }
  }, [filters.type, filters.showPublic, status]);

  // Debounced search effect
  useEffect(() => {
    const debouncedFetch = debounce(() => {
      if (status === 'authenticated') {
        fetchConfigs();
      }
    }, 300);
    
    debouncedFetch();
    
    return () => {
      debouncedFetch.cancel();
    };
  }, [filters.search]);

  const fetchConfigs = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await getMachineConfigs({
        type: filters.type as 'mill' | 'lathe' | 'printer' | 'laser' | undefined,
        search: filters.search || undefined,
        public: filters.showPublic
      });
      
      // Handle paginated response
      const machineConfigs = Array.isArray(response.data) ? response.data : [];
      setConfigs(machineConfigs);
    } catch (err) {
      console.error('Error fetching machine configurations:', err);
      setError(err instanceof Error ? err : new Error('An unknown error occurred'));
      setConfigs([]); // Set empty array on error
      
      // Session might have expired
      if (err instanceof Error && err.message.includes('unauthorized')) {
        router.push('/auth/signin?callbackUrl=/machine');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Handle filter changes
  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  // Toggle public filter
  const togglePublicFilter = () => {
    setFilters(prev => ({ ...prev, showPublic: !prev.showPublic }));
  };

  // Clear filters
  const clearFilters = () => {
    setFilters({
      type: '',
      search: '',
      showPublic: false
    });
  };

  // Handle form changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    if (type === 'checkbox') {
      setFormData(prev => ({
        ...prev,
        [name]: (e.target as HTMLInputElement).checked
      }));
    } else if (type === 'number') {
      setFormData(prev => ({
        ...prev,
        [name]: parseInt(value) || 0
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  // Reset form data
  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      type: 'mill',
      maxSpindleSpeed: 10000,
      maxFeedRate: 5000,
      workVolumeX: 300,
      workVolumeY: 300,
      workVolumeZ: 100,
      controller: '',
      isPublic: false
    });
    setSelectedConfig(null);
  };

  // Handle machine configuration creation/update
  const handleCreateConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    
    setIsLoading(true);
    
    try {
      const configDetails: MachineConfigDetails = {
        type: formData.type,
        maxSpindleSpeed: formData.maxSpindleSpeed,
        maxFeedRate: formData.maxFeedRate,
        controller: formData.controller,
        workVolume: {
          x: formData.workVolumeX,
          y: formData.workVolumeY,
          z: formData.workVolumeZ
        }
      };
      
      const configData = {
        name: formData.name,
        description: formData.description,
        type: formData.type,
        isPublic: formData.isPublic,
        config: configDetails
      };
      
      let result;
      
      if (selectedConfig) {
        // Update existing config
        result = await updateMachineConfig(selectedConfig.id, configData);
        toast.success('Machine configuration updated successfully');
      } else {
        // Create new config
        result = await createMachineConfig(configData);
        toast.success('Machine configuration created successfully');
      }
      
      // Refresh the configs list
      await fetchConfigs();
      
      // Close the modal
      setShowModal(false);
      resetForm();
    } catch (err) {
      console.error('Error saving machine configuration:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to save machine configuration');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle selecting item from library
  const handleSelectLibraryItem = async (item: any) => {
    try {
      setIsLoading(true);
      
      // Create config from library item
      const configData = {
        name: item.name,
        description: item.description || '',
        type: item.type as 'mill' | 'lathe' | 'printer' | 'laser',
        config: item.config
      };
      
      await createMachineConfig(configData);
      toast.success('Machine configuration created from template successfully');
      
      // Refresh the list
      await fetchConfigs();
      setShowLibrary(false);
    } catch (err) {
      console.error('Error creating machine configuration from template:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to create machine configuration from template');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle opening the edit modal
  const handleEditClick = (config: MachineConfig) => {
    setSelectedConfig(config);
    
    // Extract config values
    const configData = config.config || {};
    
    setFormData({
      name: config.name,
      description: config.description || '',
      type: config.type || 'mill',
      maxSpindleSpeed: configData.maxSpindleSpeed || 10000,
      maxFeedRate: configData.maxFeedRate || 5000,
      workVolumeX: configData.workVolume?.x || 300,
      workVolumeY: configData.workVolume?.y || 300,
      workVolumeZ: configData.workVolume?.z || 100,
      controller: configData.controller || '',
      isPublic: config.isPublic || false
    });
    
    setShowModal(true);
  };

  // Handle config deletion
  const handleDeleteConfig = async (id: string) => {
    setIsLoading(true);
    
    try {
      await deleteMachineConfig(id);
      toast.success('Machine configuration deleted successfully');
      setShowConfirmDelete(null);
      
      // Refresh the list
      await fetchConfigs();
    } catch (err) {
      console.error('Failed to delete machine configuration:', err);
      
      // More specific error message for usage
      if (err instanceof Error && err.message.includes('being used')) {
        toast.error('Cannot delete configuration as it is currently in use by one or more toolpaths');
      } else {
        toast.error(err instanceof Error ? err.message : 'Failed to delete machine configuration');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Handle config cloning
  const handleCloneConfig = async (config: MachineConfig) => {
    try {
      setIsLoading(true);
      await cloneMachineConfig(config.id, `${config.name} (Copy)`);
      toast.success('Machine configuration cloned successfully');
      await fetchConfigs();
    } catch (err) {
      console.error('Failed to clone machine configuration:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to clone machine configuration');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle config sharing
  const handleToggleShare = async (config: MachineConfig) => {
    try {
      setIsLoading(true);
      await shareMachineConfig(config.id, !config.isPublic);
      toast.success(`Machine configuration ${config.isPublic ? 'private' : 'shared'} successfully`);
      await fetchConfigs();
    } catch (err) {
      console.error('Failed to update sharing settings:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to update sharing settings');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle navigation to detail page
  const handleViewDetail = (id: string) => {
    router.push(`/machine/${id}`);
  };

  if (status === 'loading') {
    return <div className="flex h-screen items-center justify-center"><Loading /></div>;
  }

  if (status === 'unauthenticated') {
    router.push('/auth/signin');
    return null;
  }
  
  return (
    <>
      <Metatags title="Machine Configurations" />
      
      <Layout>
        <div className="p-4 md:p-6">
          <div className="flex flex-col md:flex-row md:justify-between md:items-center mb-6 gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Machine Configurations</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">Manage your CNC machines and 3D printers</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setShowLibrary(true)}
                className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 flex items-center"
              >
                <Book size={18} className="mr-2" />
                Standard Machines
              </button>
              <button
                onClick={() => {
                  resetForm();
                  setShowModal(true);
                }}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center"
              >
                <Plus size={18} className="mr-2" />
                New Configuration
              </button>
            </div>
          </div>
          
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 mb-6">
            <ExportImportControls entityType="machineConfigs" />
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
                  placeholder="Search configurations..."
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              
              <div className="w-full md:w-48">
                <select
                  name="type"
                  value={filters.type}
                  onChange={handleFilterChange}
                  className="block w-full pl-3 pr-10 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">All Types</option>
                  <option value="mill">Mill</option>
                  <option value="lathe">Lathe</option>
                  <option value="printer">3D Printer</option>
                  <option value="laser">Laser Cutter</option>
                </select>
              </div>
              
              <button
                onClick={togglePublicFilter}
                className={`px-3 py-2 rounded-md border ${filters.showPublic 
                  ? 'bg-blue-100 border-blue-300 dark:bg-blue-900/40 dark:border-blue-700 text-blue-700 dark:text-blue-300' 
                  : 'border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400'} 
                  flex items-center`}
              >
                <Share2 size={16} className="mr-2" />
                {filters.showPublic ? 'Showing Public' : 'Show Public'}
              </button>
              
              <button
                onClick={clearFilters}
                className="md:self-end text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 flex items-center"
              >
                <X size={16} className="mr-1" />
                Clear
              </button>
            </div>
          </div>

          {/* Machine Configurations List */}
          {isLoading && configs.length === 0 ? (
            <div className="flex h-64 items-center justify-center">
              <Loading />
            </div>
          ) : error ? (
            <div className="bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-300 p-4 rounded-md">
              {error.message}
            </div>
          ) : configs.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-6 text-center">
              <div className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                <Settings size={24} className="text-gray-400 dark:text-gray-500" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No machine configurations yet</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                {filters.search || filters.type || filters.showPublic ? 
                  'No machine configurations match your search criteria.' : 
                  'Add machine configurations to properly generate G-code for your specific CNC machines, or use our standard machine templates.'}
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                {filters.search || filters.type || filters.showPublic ? (
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
                      Create Configuration
                    </button>
                    <button
                      onClick={() => setShowLibrary(true)}
                      className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                      Use Standard Templates
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {configs.map((config) => (
                <motion.div 
                  key={config.id} 
                  className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  whileHover={{ scale: 1.01 }}
                >
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center">
                        <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center mr-3">
                          <span className="text-xl">
                            {config.type === 'mill' ? '🔄' : 
                             config.type === 'lathe' ? '⚙️' :
                             config.type === 'printer' ? '🖨️' : 
                             config.type === 'laser' ? '✂️' : '🔧'}
                          </span>
                        </div>
                        <div>
                          <h3 className="text-lg font-medium text-gray-900 dark:text-white">{config.name}</h3>
                          <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                            <span className="capitalize mr-2">{config.type}</span>
                            {config.isPublic && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
                                <Share2 size={12} className="mr-1" />
                                Public
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {config.usageCount !== undefined && config.usageCount > 0 && (
                        <div className="flex items-center px-2 py-1 rounded-full text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                          <Tool size={12} className="mr-1" />
                          {config.usageCount} {config.usageCount === 1 ? 'use' : 'uses'}
                        </div>
                      )}
                    </div>
                    
                    {config.description && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{config.description}</p>
                    )}
                    
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="flex flex-col">
                        <span className="text-gray-500 dark:text-gray-400">Max Speed</span>
                        <span className="font-medium text-gray-900 dark:text-white">{config.config?.maxSpindleSpeed || 'N/A'} RPM</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-gray-500 dark:text-gray-400">Max Feed</span>
                        <span className="font-medium text-gray-900 dark:text-white">{config.config?.maxFeedRate || 'N/A'} mm/min</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-gray-500 dark:text-gray-400">Work Area</span>
                        <span className="font-medium text-gray-900 dark:text-white">
                          {config.config?.workVolume ? 
                            `${config.config.workVolume.x}×${config.config.workVolume.y}×${config.config.workVolume.z} mm` : 
                            'N/A'}
                        </span>
                      </div>
                      {config.config?.controller && (
                        <div className="flex flex-col">
                          <span className="text-gray-500 dark:text-gray-400">Controller</span>
                          <span className="font-medium text-gray-900 dark:text-white">{config.config.controller}</span>
                        </div>
                      )}
                    </div>
                    
                    {config.owner && config.owner.id !== session?.user?.id && (
                      <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 flex items-center text-xs text-gray-500 dark:text-gray-400">
                        <Clock size={12} className="mr-1" />
                        <span>
                          Created {formatDistance(new Date(config.createdAt), new Date(), { addSuffix: true })}
                          {config.owner?.name && (
                            <span> by {config.owner.name}</span>
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                  
                  <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-3 bg-gray-50 dark:bg-gray-900 flex justify-between">
                    <div>
                      <button 
                        onClick={() => handleViewDetail(config.id)}
                        className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
                        title="View Details"
                      >
                        View
                      </button>
                    </div>
                    <div className="flex space-x-2">
                      {/* Only show edit/delete for owner */}
                      {(config.isOwner || config.ownerId === session?.user?.id) && (
                        <>
                          <button 
                            onClick={() => handleToggleShare(config)}
                            className={`p-2 ${config.isPublic 
                              ? 'text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20' 
                              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'} rounded`}
                            title={config.isPublic ? "Make Private" : "Share Publicly"}
                          >
                            <Share2 size={16} />
                          </button>
                          <button 
                            onClick={() => handleCloneConfig(config)}
                            className="p-2 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded"
                            title="Clone Configuration"
                          >
                            <Copy size={16} />
                          </button>
                          <button 
                            onClick={() => handleEditClick(config)}
                            className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
                            title="Edit Configuration"
                          >
                            <Edit size={16} />
                          </button>
                          <button 
                            onClick={() => setShowConfirmDelete(config.id)}
                            className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                            title="Delete Configuration"
                            disabled={isLoading}
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
          
          {/* Machine Config Modal */}
          {showModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <motion.div 
                className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
              >
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                    {selectedConfig ? 'Edit Machine Configuration' : 'Create New Machine Configuration'}
                  </h3>
                </div>
                
                <form onSubmit={handleCreateConfig}>
                  <div className="px-6 py-4 max-h-[70vh] overflow-y-auto">
                    <div className="mb-4">
                      <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Configuration Name
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
                      <label htmlFor="type" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Machine Type
                      </label>
                      <select
                        id="type"
                        name="type"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        value={formData.type}
                        onChange={handleChange}
                        required
                      >
                        <option value="mill">Mill</option>
                        <option value="lathe">Lathe</option>
                        <option value="printer">3D Printer</option>
                        <option value="laser">Laser Cutter</option>
                      </select>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="mb-4">
                        <label htmlFor="maxSpindleSpeed" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Max Spindle Speed (RPM)
                        </label>
                        <input
                          type="number"
                          id="maxSpindleSpeed"
                          name="maxSpindleSpeed"
                          min="0"
                          step="100"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                          value={formData.maxSpindleSpeed}
                          onChange={handleChange}
                          required
                        />
                      </div>
                      
                      <div className="mb-4">
                        <label htmlFor="maxFeedRate" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Max Feed Rate (mm/min)
                        </label>
                        <input
                          type="number"
                          id="maxFeedRate"
                          name="maxFeedRate"
                          min="0"
                          step="100"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                          value={formData.maxFeedRate}
                          onChange={handleChange}
                          required
                        />
                      </div>
                    </div>
                    
                    <div className="mb-4">
                      <label htmlFor="controller" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Controller (optional)
                      </label>
                      <input
                        type="text"
                        id="controller"
                        name="controller"
                        placeholder="e.g., Mach3, LinuxCNC, Grbl"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        value={formData.controller}
                        onChange={handleChange}
                      />
                    </div>
                    
                    <div className="mb-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Work Volume (mm)
                      </label>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-4">
                      <div className="mb-4">
                        <label htmlFor="workVolumeX" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                          X (width)
                        </label>
                        <input
                          type="number"
                          id="workVolumeX"
                          name="workVolumeX"
                          min="0"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                          value={formData.workVolumeX}
                          onChange={handleChange}
                          required
                        />
                      </div>
                      
                      <div className="mb-4">
                        <label htmlFor="workVolumeY" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                          Y (depth)
                        </label>
                        <input
                          type="number"
                          id="workVolumeY"
                          name="workVolumeY"
                          min="0"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                          value={formData.workVolumeY}
                          onChange={handleChange}
                          required
                        />
                      </div>
                      
                      <div className="mb-4">
                        <label htmlFor="workVolumeZ" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                          Z (height)
                        </label>
                        <input
                          type="number"
                          id="workVolumeZ"
                          name="workVolumeZ"
                          min="0"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                          value={formData.workVolumeZ}
                          onChange={handleChange}
                          required
                        />
                      </div>
                    </div>
                    
                    <div className="mt-4">
                      <div className="flex items-center">
                        <input
                          id="isPublic"
                          name="isPublic"
                          type="checkbox"
                          checked={formData.isPublic}
                          onChange={handleChange}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <label htmlFor="isPublic" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                          Make this configuration public
                        </label>
                      </div>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Public configurations can be used by all users of the platform
                      </p>
                    </div>
                  </div>
                  
                  <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900 flex justify-end space-x-3 rounded-b-lg">
                    <button
                      type="button"
                      className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                      onClick={() => {
                        setShowModal(false);
                        setSelectedConfig(null);
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
                      {isLoading ? 'Saving...' : selectedConfig ? 'Update' : 'Create'}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
          
          {/* Confirm Delete Modal */}
          {showConfirmDelete && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <motion.div 
                className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
              >
                <div className="flex items-center mb-4">
                  <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center mr-4">
                    <AlertCircle size={24} className="text-red-600 dark:text-red-400" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                    Confirm Deletion
                  </h3>
                </div>
                
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  Are you sure you want to delete this machine configuration? This action cannot be undone.
                </p>
                
                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    onClick={() => setShowConfirmDelete(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="px-4 py-2 bg-red-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                    onClick={() => handleDeleteConfig(showConfirmDelete)}
                    disabled={isLoading}
                  >
                    {isLoading ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
          
          {/* Machine Templates Modal */}
          {showLibrary && (
            <PredefinedLibrary
              libraryType="machines"
              onSelectItem={handleSelectLibraryItem}
              isOpen={showLibrary}
              onClose={() => setShowLibrary(false)}
            />
          )}
        </div>
      </Layout>
    </>
  );
}