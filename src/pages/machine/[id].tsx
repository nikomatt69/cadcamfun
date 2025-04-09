import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import Layout from '@/src/components/layout/Layout';
import { Save, ArrowLeft, Trash2, ArrowRight, Settings, AlertCircle } from 'react-feather';
import { 
  getMachineConfigById, 
  updateMachineConfig, 
  deleteMachineConfig,
  MachineConfig,
  MachineConfigDetails 
} from '@/src/lib/api/machineConfigApi';
import Loading from '@/src/components/ui/Loading';
import Metatags from '@/src/components/layout/Metatags';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';

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

export default function MachineConfigDetailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { id } = router.query;
  
  // State for machine config data and UI
  const [machineConfig, setMachineConfig] = useState<MachineConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  
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

  // Fetch machine config data when component mounts or id changes
  useEffect(() => {
    if (id && typeof id === 'string' && status === 'authenticated') {
      fetchMachineConfig(id);
    }
  }, [status, id]);

  const fetchMachineConfig = async (configId: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const data = await getMachineConfigById(configId);
      setMachineConfig(data);
      
      // Extract config values
      const configData = data.config || {};
      
      setFormData({
        name: data.name,
        description: data.description || '',
        type: data.type || 'mill',
        maxSpindleSpeed: configData.maxSpindleSpeed || 10000,
        maxFeedRate: configData.maxFeedRate || 5000,
        workVolumeX: configData.workVolume?.x || 300,
        workVolumeY: configData.workVolume?.y || 300,
        workVolumeZ: configData.workVolume?.z || 100,
        controller: configData.controller || '',
        isPublic: data.isPublic || false
      });
    } catch (err) {
      console.error('Error fetching machine configuration:', err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
      
      // If machine config not found, redirect to list
      if (err instanceof Error && err.message.includes('not found')) {
        toast.error('Machine configuration not found');
        setTimeout(() => router.push('/machine'), 1500);
      }
      // If permission error, show message and redirect
      else if (err instanceof Error && err.message.includes('permission')) {
        toast.error('You do not have permission to access this configuration');
        setTimeout(() => router.push('/machine'), 1500);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!machineConfig) return;
    
    setIsSaving(true);
    
    try {
      // Prepare config details
      const configDetails: MachineConfigDetails = {
        type: formData.type,
        maxSpindleSpeed: formData.maxSpindleSpeed,
        maxFeedRate: formData.maxFeedRate,
        workVolume: {
          x: formData.workVolumeX,
          y: formData.workVolumeY,
          z: formData.workVolumeZ
        },
        controller: formData.controller,
        additionalSettings: machineConfig.config.additionalSettings
      };
      
      // Update machine config
      const updatedConfig = await updateMachineConfig(machineConfig.id, {
        name: formData.name,
        description: formData.description,
        type: formData.type,
        config: configDetails,
        isPublic: formData.isPublic
      });
      
      setMachineConfig(updatedConfig);
      toast.success('Machine configuration saved successfully');
    } catch (err) {
      console.error('Error updating machine configuration:', err);
      
      // Provide more specific error messages
      if (err instanceof Error && err.message.includes('permission')) {
        toast.error('You do not have permission to edit this configuration');
      } else {
        toast.error(err instanceof Error ? err.message : 'Failed to update machine configuration');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!machineConfig) return;
    
    setIsLoading(true);
    
    try {
      await deleteMachineConfig(machineConfig.id);
      toast.success('Machine configuration deleted successfully');
      
      // Redirect to machine-configs list after a short delay
      setTimeout(() => {
        router.push('/machine');
      }, 1500);
    } catch (err) {
      console.error('Error deleting machine configuration:', err);
      
      // More specific error for usage
      if (err instanceof Error && err.message.includes('being used')) {
        toast.error('Cannot delete configuration as it is currently in use by one or more toolpaths');
      } else {
        toast.error(err instanceof Error ? err.message : 'Failed to delete machine configuration');
      }
      
      setIsLoading(false);
    }
  };

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

  const handleBack = () => {
    router.push('/machine');
  };

  if (status === 'loading' || (isLoading && !error)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
          className="w-16 h-16 border-4 border-blue-200 dark:border-blue-800 rounded-full border-t-blue-600"
        />
      </div>
    );
  }
  
  if (status === 'unauthenticated') {
    router.push('/auth/signin?callbackUrl=/machine');
    return null;
  }
  
  return (
    <>
      <Metatags title={machineConfig ? `${machineConfig.name} | Machine Configuration` : 'Machine Configuration'} />
      
      <Layout>
        <div className="flex flex-col h-full">
          {/* Header */}
          <motion.div 
            className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-4 md:px-6"
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.4 }}
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center">
                <motion.button
                  onClick={handleBack}
                  className="mr-4 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
                  whileHover={{ scale: 1.1, backgroundColor: "rgba(0,0,0,0.05)" }}
                  whileTap={{ scale: 0.95 }}
                >
                  <ArrowLeft size={20} />
                </motion.button>
                <div className="flex items-center">
                  {machineConfig && (
                    <motion.div 
                      className="w-8 h-8 rounded-full mr-3 bg-blue-100 dark:bg-blue-900 flex items-center justify-center"
                      whileHover={{ scale: 1.1 }}
                    >
                      <span className="text-xl">
                        {machineConfig.type === 'mill' ? '🔄' : 
                        machineConfig.type === 'lathe' ? '⚙️' :
                        machineConfig.type === 'printer' ? '🖨️' : 
                        machineConfig.type === 'laser' ? '✂️' : '🔧'}
                      </span>
                    </motion.div>
                  )}
                  <div>
                    <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                      {machineConfig ? machineConfig.name : 'Machine Configuration not found'}
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {machineConfig ? 'Edit machine configuration' : 'Configuration may have been deleted or does not exist'}
                    </p>
                  </div>
                </div>
              </div>
              {machineConfig && machineConfig.isOwner && (
                <div className="flex flex-wrap gap-3">
                  <motion.button
                    onClick={() => setShowConfirmDelete(true)}
                    className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-red-600 dark:text-red-400 px-4 py-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 focus:outline-none focus:ring-2 focus:ring-red-500 flex items-center"
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    disabled={isSaving || isLoading}
                  >
                    <Trash2 size={18} className="mr-2" />
                    Delete
                  </motion.button>
                  
                  <motion.button
                    onClick={handleSave}
                    disabled={isSaving || isLoading}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center shadow-sm"
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Save size={18} className="mr-2" />
                    {isSaving ? 'Saving...' : 'Save'}
                  </motion.button>
                </div>
              )}
            </div>
          </motion.div>
          
          {/* Display error */}
          {error && !machineConfig && (
            <motion.div 
              className="flex-1 flex items-center justify-center p-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
            >
              <div className="text-center max-w-md">
                <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertCircle size={28} className="text-red-500 dark:text-red-400" />
                </div>
                <div className="text-red-600 dark:text-red-400 text-lg mb-4">{error}</div>
                <motion.button
                  onClick={handleBack}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 shadow-sm"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Return to Machine Configurations
                </motion.button>
              </div>
            </motion.div>
          )}
          
          {/* Machine Configuration form */}
          {machineConfig && (
            <motion.div 
              className="flex-1 overflow-auto p-6" 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
            >
              <motion.div 
                className="max-w-3xl mx-auto"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.1 }}
              >
                <div className="bg-white dark:bg-gray-900 shadow rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800">
                  <div className="p-6">
                    <div className="mb-4">
                      <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Configuration Name
                      </label>
                      <input
                        type="text"
                        id="name"
                        name="name"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        value={formData.name}
                        onChange={handleChange}
                        required
                        disabled={!machineConfig.isOwner}
                      />
                    </div>
                    
                    <div className="mb-4">
                      <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Description
                      </label>
                      <textarea
                        id="description"
                        name="description"
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        value={formData.description}
                        onChange={handleChange}
                        disabled={!machineConfig.isOwner}
                      ></textarea>
                    </div>
                    
                    <div className="mb-4">
                      <label htmlFor="type" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Machine Type
                      </label>
                      <select
                        id="type"
                        name="type"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        value={formData.type}
                        onChange={handleChange}
                        required
                        disabled={!machineConfig.isOwner}
                      >
                        <option value="mill">Mill</option>
                        <option value="lathe">Lathe</option>
                        <option value="printer">3D Printer</option>
                        <option value="laser">Laser Cutter</option>
                      </select>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                          value={formData.maxSpindleSpeed}
                          onChange={handleChange}
                          required
                          disabled={!machineConfig.isOwner}
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
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                          value={formData.maxFeedRate}
                          onChange={handleChange}
                          required
                          disabled={!machineConfig.isOwner}
                        />
                      </div>

                      <div className="mb-4">
                        <label htmlFor="controller" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Controller (optional)
                        </label>
                        <input
                          type="text"
                          id="controller"
                          name="controller"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                          value={formData.controller}
                          onChange={handleChange}
                          placeholder="e.g., Mach3, LinuxCNC, Grbl"
                          disabled={!machineConfig.isOwner}
                        />
                      </div>
                      
                      {machineConfig.isOwner && (
                        <div className="mb-4">
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Visibility
                          </label>
                          <div className="flex items-center mt-2">
                            <input
                              id="isPublic"
                              name="isPublic"
                              type="checkbox"
                              checked={formData.isPublic}
                              onChange={handleChange}
                              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                              disabled={!machineConfig.isOwner}
                            />
                            <label htmlFor="isPublic" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                              Public (visible to all users)
                            </label>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <div className="mb-2 mt-4">
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
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                          value={formData.workVolumeX}
                          onChange={handleChange}
                          required
                          disabled={!machineConfig.isOwner}
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
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                          value={formData.workVolumeY}
                          onChange={handleChange}
                          required
                          disabled={!machineConfig.isOwner}
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
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                          value={formData.workVolumeZ}
                          onChange={handleChange}
                          required
                          disabled={!machineConfig.isOwner}
                        />
                      </div>
                    </div>
                    
                    <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-800">
                      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Configuration Info</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                        <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg">
                          <span className="block text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider mb-1">ID</span>
                          <span className="font-mono text-gray-900 dark:text-gray-200">{machineConfig.id}</span>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg">
                          <span className="block text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider mb-1">Created</span>
                          <span className="text-gray-900 dark:text-gray-200">{new Date(machineConfig.createdAt).toLocaleString()}</span>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg">
                          <span className="block text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider mb-1">Updated</span>
                          <span className="text-gray-900 dark:text-gray-200">{new Date(machineConfig.updatedAt).toLocaleString()}</span>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg">
                          <span className="block text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider mb-1">Public</span>
                          <span className="text-gray-900 dark:text-gray-200">{machineConfig.isPublic ? 'Yes' : 'No'}</span>
                        </div>
                        {machineConfig.usageCount !== undefined && (
                          <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg">
                            <span className="block text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider mb-1">Usage Count</span>
                            <span className="text-gray-900 dark:text-gray-200">{machineConfig.usageCount} {machineConfig.usageCount === 1 ? 'toolpath' : 'toolpaths'}</span>
                          </div>
                        )}
                        {machineConfig.owner && (
                          <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg">
                            <span className="block text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider mb-1">Owner</span>
                            <span className="text-gray-900 dark:text-gray-200">{machineConfig.owner.name || machineConfig.owner.email || 'Unknown'}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Action buttons - only visible to owner */}
                    {machineConfig.isOwner && (
                      <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-800 flex justify-end space-x-3">
                        <button
                          onClick={() => setShowConfirmDelete(true)}
                          className="flex items-center px-4 py-2 border border-gray-300 dark:border-gray-700 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 focus:outline-none focus:ring-2 focus:ring-red-500"
                          disabled={isLoading || isSaving}
                        >
                          <Trash2 size={16} className="mr-2" />
                          Delete
                        </button>
                        <button
                          onClick={handleSave}
                          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          disabled={isLoading || isSaving}
                        >
                          <Save size={16} className="mr-2" />
                          {isSaving ? 'Saving...' : 'Save Changes'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            </motion.div>
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
                
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  Are you sure you want to delete this machine configuration? This action cannot be undone.
                </p>
                
                {machineConfig?.usageCount && machineConfig.usageCount > 0 ? (
                  <div className="bg-yellow-50 dark:bg-yellow-900/30 p-3 rounded-md mb-4">
                    <div className="flex items-start">
                      <AlertCircle size={18} className="text-yellow-600 dark:text-yellow-400 mt-0.5 mr-2 flex-shrink-0" />
                      <p className="text-sm text-yellow-700 dark:text-yellow-300">
                        This machine configuration is being used by {machineConfig.usageCount} toolpath{machineConfig.usageCount !== 1 ? 's' : ''}. 
                        Deleting it may affect existing toolpaths.
                      </p>
                    </div>
                  </div>
                ) : null}
                
                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    onClick={() => setShowConfirmDelete(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="px-4 py-2 bg-red-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                    onClick={handleDelete}
                    disabled={isLoading}
                  >
                    {isLoading ? 'Deleting...' : 'Delete Configuration'}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </div>
      </Layout>
    </>
  );
}