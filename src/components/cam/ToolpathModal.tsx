// src/components/cam/SaveToolpathModal.tsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save } from 'react-feather';
import { createToolpath } from 'src/lib/api/toolpaths';
import toast from 'react-hot-toast';

interface SaveToolpathModalProps {
  isOpen: boolean;
  onClose: () => void;
  toolpathData: any;
  drawingId: string;
  gcode?: string;
  onSuccess?: (toolpathId: string) => void;
}

export default function SaveToolpathModal({
  isOpen,
  onClose,
  toolpathData,
  drawingId,
  gcode,
  onSuccess
}: SaveToolpathModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    materialId: '',
    machineConfigId: '',
    toolId: ''
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [materials, setMaterials] = useState<{id: string, name: string}[]>([]);
  const [machineConfigs, setMachineConfigs] = useState<{id: string, name: string}[]>([]);
  const [tools, setTools] = useState<{id: string, name: string}[]>([]);

  useEffect(() => {
    // Fetch related data for dropdowns
    const fetchData = async () => {
      try {
        // First verify drawing access
        const drawingResponse = await fetch(`/api/drawings/${drawingId}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include'
        });
        
        if (!drawingResponse.ok) {
          if (drawingResponse.status === 404) {
            throw new Error('Drawing not found');
          } else if (drawingResponse.status === 401) {
            throw new Error('Please log in to access this drawing');
          } else if (drawingResponse.status === 403) {
            throw new Error('You do not have permission to access this drawing');
          }
          throw new Error('Failed to verify drawing access');
        }

        // Fetch materials
        const materialsResponse = await fetch('/api/materials', {
          credentials: 'include'
        });
        const materialsData = await materialsResponse.json();
        if (!Array.isArray(materialsData)) {
          throw new Error('Invalid materials data received');
        }
        setMaterials(materialsData.map((m: any) => ({ id: m.id, name: m.name })));
        
        // Fetch machine configs
        const machineConfigsResponse = await fetch('/api/machine-configs', {
          credentials: 'include'
        });
        const machineConfigsData = await machineConfigsResponse.json();
        if (!Array.isArray(machineConfigsData)) {
          throw new Error('Invalid machine configs data received');
        }
        setMachineConfigs(machineConfigsData.map((m: any) => ({ id: m.id, name: m.name })));
        
        // Fetch tools
        const toolsResponse = await fetch('/api/tools', {
          credentials: 'include'
        });
        const toolsData = await toolsResponse.json();
        if (!Array.isArray(toolsData)) {
          throw new Error('Invalid tools data received');
        }
        setTools(toolsData.map((t: any) => ({ id: t.id, name: t.name })));
      } catch (error) {
        console.error("Error fetching data:", error);
        setError(error instanceof Error ? error.message : 'Failed to load resources');
        toast.error(error instanceof Error ? error.message : 'Failed to load resources');
      }
    };
    
    if (isOpen) {
      setError(null);
      fetchData();
    }
  }, [isOpen, drawingId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    // Clear error when user makes changes
    setError(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    
    try {
      if (!formData.name.trim()) {
        throw new Error('Name is required');
      }

      // Create the toolpath
      const data = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        drawingId,
        data: toolpathData,
        gcode,
        materialId: formData.materialId || undefined,
        machineConfigId: formData.machineConfigId || undefined,
        toolId: formData.toolId || undefined
      };
      
      const response = await fetch('/api/toolpaths', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Please log in to save toolpaths');
        } else if (response.status === 403) {
          throw new Error('You do not have permission to save toolpaths');
        } else if (response.status === 404) {
          throw new Error('Drawing not found');
        }
        throw new Error('Failed to save toolpath');
      }
      
      const newToolpath = await response.json();
      
      toast.success('Toolpath saved successfully');
      
      // Call the onSuccess callback with the new toolpath ID
      if (onSuccess) {
        onSuccess(newToolpath.id);
      }
      
      onClose();
    } catch (err) {
      console.error('Error saving toolpath:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to save toolpath';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div 
            className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.2 }}
          >
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                Save Toolpath
              </h3>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
              >
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleSave}>
              <div className="px-6 py-4">
                {error && (
                  <div className="mb-4 p-3 bg-red-50 rounded-md">
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                )}
                
                <div className="mb-4">
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Toolpath Name *
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter a name for this toolpath"
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
                    value={formData.description}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Add optional description"
                  ></textarea>
                </div>
                
                <div className="mb-4">
                  <label htmlFor="materialId" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Material
                  </label>
                  <select
                    id="materialId"
                    name="materialId"
                    value={formData.materialId}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select a material (optional)</option>
                    {materials.map(material => (
                      <option key={material.id} value={material.id}>{material.name}</option>
                    ))}
                  </select>
                </div>
                
                <div className="mb-4">
                  <label htmlFor="machineConfigId" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Machine Configuration
                  </label>
                  <select
                    id="machineConfigId"
                    name="machineConfigId"
                    value={formData.machineConfigId}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select a machine config (optional)</option>
                    {machineConfigs.map(config => (
                      <option key={config.id} value={config.id}>{config.name}</option>
                    ))}
                  </select>
                </div>
                
                <div className="mb-4">
                  <label htmlFor="toolId" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Tool
                  </label>
                  <select
                    id="toolId"
                    name="toolId"
                    value={formData.toolId}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select a tool (optional)</option>
                    {tools.map(tool => (
                      <option key={tool.id} value={tool.id}>{tool.name}</option>
                    ))}
                  </select>
                </div>
                
                <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-md mt-4">
                  <p className="text-sm text-blue-800 dark:text-blue-300">
                    This will save the toolpath for the current drawing. You can access saved toolpaths from the Toolpaths section.
                  </p>
                </div>
              </div>
              
              <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900 flex justify-end space-x-3 rounded-b-lg">
                <button
                  type="button"
                  className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  onClick={onClose}
                  disabled={isSaving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 flex items-center"
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></span>
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save size={18} className="mr-2" />
                      Save Toolpath
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}