// src/pages/toolpaths/index.tsx
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
  Code,
  Download,
  Share2
} from 'react-feather';
import Link from 'next/link';
import Layout from '@/src/components/layout/Layout';
import PredefinedLibrary from 'src/components/library/PredefinedToolpathsLibrary';
import Loading from '@/src/components/ui/Loading';
import { fetchToolpaths, createToolpath, updateToolpath, deleteToolpath, CreateToolpathInput } from '@/src/lib/api/toolpaths';
import ExportImportToolpathsControls from 'src/components/cam/ToolpathControls';
import Metatags from '@/src/components/layout/Metatags';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';



interface ToolpathsFilterState {
  projectId?: string;
  type?: string;
  operationType?: string;
  search: string;
  isPublic?: boolean;
}

interface ToolpathData {
  machineType?: string;
  operationType?: string;
  [key: string]: any;
}

export default function ToolpathsList() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  // State for filters
  const [filters, setFilters] = useState<ToolpathsFilterState>({
    search: '',
    type: '',
    operationType: '',
    projectId: router.query.projectId as string || '',
    isPublic: undefined
  });
  
  // State for the modals
  const [showModal, setShowModal] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [selectedToolpath, setSelectedToolpath] = useState<any>(null);
  
  // State for data and UI
  const [toolpaths, setToolpaths] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  // View mode (grid or list)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  // Projects list for dropdown
  const [projects, setProjects] = useState<{id: string, name: string}[]>([]);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: 'mill',
    operationType: 'contour',
    projectId: '',
    isPublic: false,
    gcode: '',
    data: {}
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
  
  // Check if there's G-code to import from the ToolpathGenerator
  useEffect(() => {
    const checkForGcodeImport = () => {
      // Check for URL parameter or localStorage
      const gcodeFromGenerator = localStorage.getItem('gcodeFromToolpathGenerator');
      const settingsFromGenerator = localStorage.getItem('settingsFromToolpathGenerator');
      
      if (gcodeFromGenerator) {
        try {
          const gcode = gcodeFromGenerator;
          let data = {};
          
          if (settingsFromGenerator) {
            data = JSON.parse(settingsFromGenerator) as ToolpathData;
          }
          
          // Pre-populate form
          setFormData(prev => ({
            ...prev,
            name: `Toolpath ${new Date().toLocaleDateString()}`,
            description: `Generated on ${new Date().toLocaleDateString()}`,
            type: (data as ToolpathData).machineType || 'mill',
            operationType: (data as ToolpathData).operationType || 'contour',
            gcode,
            data
          }));
          
          // Show creation modal
          setShowModal(true);
          
          // Clear localStorage
          localStorage.removeItem('gcodeFromToolpathGenerator');
          localStorage.removeItem('settingsFromToolpathGenerator');
        } catch (error) {
          console.error("Error parsing G-code data:", error);
          toast.error("Couldn't load G-code from Toolpath Generator");
        }
      }
    };
    
    checkForGcodeImport();
  }, []);
  
  // Fetch data when component mounts or filters change
  useEffect(() => {
    if (status === 'authenticated') {
      fetchToolpathsData();
    }
  }, [filters, status]);
  
  // Update projectId in formData when it changes in filters
  useEffect(() => {
    if (filters.projectId) {
      setFormData(prev => ({...prev, projectId: filters.projectId || ''}));
    }
  }, [filters.projectId]);
  
  const fetchToolpathsData = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const toolpathsData = await fetchToolpaths({
        projectId: filters.projectId,
        type: filters.type,
        operationType: filters.operationType,
        search: filters.search,
      });
      
      setToolpaths(toolpathsData);
    } catch (err) {
      console.error('Error fetching toolpaths:', err);
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
      operationType: '',
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
      type: 'mill',
      operationType: 'contour',
      projectId: filters.projectId || '',
      isPublic: false,
      gcode: '',
      data: {}
    });
    setSelectedToolpath(null);
  };
  
  // Handle toolpath creation/update
  const handleCreateToolpath = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      if (!session?.user?.id) {
        toast.error('User session not found');
        return;
      }

      if (!formData.projectId) {
        toast.error('Please select a project');
        return;
      }

      // Verify project access first
      const projectResponse = await fetch(`/api/projects/${formData.projectId}`);
      if (!projectResponse.ok) {
        if (projectResponse.status === 404) {
          toast.error('Project not found');
          return;
        }
        if (projectResponse.status === 403) {
          toast.error('You do not have access to this project');
          return;
        }
        throw new Error('Failed to verify project access');
      }

      // Prepare toolpath data
      const toolpathData: CreateToolpathInput = {
        name: formData.name,
        description: formData.description,
        type: formData.type || 'mill',
        operationType: formData.operationType || 'contour',
        projectId: formData.projectId,
        data: formData.data || {},
        gcode: formData.gcode || '',
        isPublic: formData.isPublic,
        createdBy: session.user.id
      };
      
      let result;
      
      if (selectedToolpath) {
        // Update existing toolpath
        result = await updateToolpath({
          id: selectedToolpath.id,
          ...toolpathData
        });
        toast.success('Toolpath updated successfully');
      } else {
        // Create new toolpath
        result = await createToolpath(toolpathData);
        toast.success('Toolpath created successfully');
      }
      
      // Refresh the toolpath list
      await fetchToolpathsData();
      
      // Close the modal
      setShowModal(false);
      resetForm();
      
      // Optionally navigate to the new toolpath
      if (result.id && !selectedToolpath) {
        router.push(`/toolpaths/${result.id}`);
      }
    } catch (err) {
      console.error('Error saving toolpath:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to save toolpath');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Handle toolpath deletion
  const handleDeleteToolpath = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!id) {
      toast.error('Cannot delete: Toolpath ID is missing');
      return;
    }
    
    if (!confirm('Are you sure you want to delete this toolpath?')) return;
    
    setIsLoading(true);
    
    try {
      await deleteToolpath(id);
      toast.success('Toolpath deleted successfully');
      
      // Refresh the list
      await fetchToolpathsData();
    } catch (err) {
      console.error('Failed to delete toolpath:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to delete toolpath');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Handle selecting item from library
  const handleSelectLibraryItem = async (item: any) => {
    try {
      setIsLoading(true);
      
      if (!filters.projectId) {
        toast.error('Please select a project first');
        return;
      }

      if (!session?.user?.id) {
        toast.error('User session not found');
        return;
      }

      // Create toolpath from library item
      const toolpathData: CreateToolpathInput = {
        name: item.name,
        description: item.description || '',
        type: item.type || 'mill',
        operationType: item.operationType || 'contour',
        projectId: filters.projectId,
        data: item.data || {},
        gcode: item.gcode || '',
        isPublic: false,
        createdBy: session.user.id
      };
      
      const result = await createToolpath(toolpathData);
      
      toast.success('Toolpath created from library successfully');
      setShowLibrary(false);
      
      // Refresh the list
      await fetchToolpathsData();
      
      // Optionally navigate to the new toolpath
      if (result.id) {
        router.push(`/toolpaths/${result.id}`);
      }
    } catch (err) {
      console.error('Failed to create toolpath from library:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to create toolpath from library');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Handle sending a toolpath to CAD/CAM
  const handleSendToCAM = (toolpath: any, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    
    try {
      // Check if toolpath and toolpath.id exist
      if (!toolpath || !toolpath.id) {
        toast.error('Cannot use in CAM: Toolpath data is missing');
        return;
      }
      
      // Save to localStorage for CAM to pick up
      localStorage.setItem('toolpathToLoadInCAM', JSON.stringify({
        id: toolpath.id,
        name: toolpath.name,
        data: toolpath.data,
        gcode: toolpath.gcode
      }));
      
      // Redirect to CAM editor
      router.push({
        pathname: '/cam',
        query: { loadToolpath: toolpath.id }
      });
      
      toast.success(`Opening ${toolpath.name} in CAM editor`);
    } catch (err) {
      console.error('Failed to send toolpath to CAM:', err);
      toast.error('Failed to send toolpath to CAM editor');
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
      <Metatags title={'Toolpaths Library'} />
      
      <Layout>
        <div className="p-4 md:p-6">
          <div className="flex flex-col md:flex-row md:justify-between md:items-center mb-6 gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Toolpaths Library</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">Create, manage and reuse toolpaths across your projects</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <motion.button
                onClick={() => router.push('/cam')}
                className="bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 flex items-center"
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.95 }}
              >
                <Cpu size={18} className="mr-2" />
                Toolpath Generator
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
                onClick={() => { setSelectedToolpath(null); setShowModal(true); }}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center"
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.95 }}
              >
                <Plus size={18} className="mr-2" />
                New Toolpath
              </motion.button>
            </div>
          </div>
          
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 mb-6">
            <ExportImportToolpathsControls entityType="toolpaths" />
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
                  placeholder="Search toolpaths..."
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
                  <option value="mill">Mill</option>
                  <option value="lathe">Lathe</option>
                  <option value="3dprinter">3D Printer</option>
                </select>
              </div>
              
              <div className="w-full md:w-48">
                <select
                  name="operationType"
                  value={filters.operationType}
                  onChange={handleFilterChange}
                  className="block w-full pl-3 pr-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">All Operations</option>
                  <option value="contour">Contour</option>
                  <option value="pocket">Pocket</option>
                  <option value="drill">Drill</option>
                  <option value="profile">3D Profile</option>
                  <option value="turning">Turning</option>
                  <option value="facing">Facing</option>
                  <option value="standard">Standard Print</option>
                  <option value="vase">Vase Mode</option>
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
          </div>
          
          {/* Toolpaths Display */}
          {isLoading && toolpaths.length === 0 ? (
            <div className="flex h-64 items-center justify-center">
              <Loading />
            </div>
          ) : error ? (
            <div className="bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-300 p-4 rounded-md">
              {error.message}
            </div>
          ) : toolpaths.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-6 text-center">
              <div className="w-16 h-16 bg-gray-200 dark:bg-gray-900 rounded-full flex items-center justify-center mx-auto mb-4">
                <Code size={24} className="text-gray-400 dark:text-gray-500" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No toolpaths found</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                {filters.search || filters.type || filters.operationType || filters.projectId || filters.isPublic ? 
                  'No toolpaths match your search criteria.' : 
                  'Create your first toolpath to get started or choose from our standard library.'}
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                {filters.search || filters.type || filters.operationType || filters.projectId || filters.isPublic ? (
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
                      Create Toolpath
                    </button>
                    <button
                      onClick={() => setShowLibrary(true)}
                      className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                      Use Standard Library
                    </button>
                    <button
                      onClick={() => router.push('/cam')}
                      className="bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      Generate Toolpath
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : viewMode === 'grid' ? (
            // Grid View
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <AnimatePresence>
                {toolpaths.map((toolpath) => (
                  <motion.div
                    key={toolpath.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.3 }}
                    className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow cursor pointer"
                    onClick={() => router.push(`/toolpaths/${toolpath.id}`)}
                  >
                    <div className="h-40 bg-gray-100 dark:bg-gray-900 flex items-center justify-center relative">
                      {toolpath.thumbnail ? (
                        <img 
                          src={toolpath.thumbnail} 
                          alt={toolpath.name} 
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <Code size={64} className="text-gray-300 dark:text-gray-700" />
                      )}
                      
                      {/* Toolpath Type Badge */}
                      <span className="absolute top-2 right-2 px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300">
                        {toolpath.type || 'Mill'}
                      </span>
                      
                      {/* Public Badge */}
                      {toolpath.isPublic && (
                        <span className="absolute top-2 left-2 px-2 py-1 text-xs font-semibold rounded-full bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-300">
                          Public
                        </span>
                      )}
                    </div>
                    
                    <div className="p-4">
                      <div className="flex justify-between items-start">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                          {toolpath.name}
                        </h2>
                      </div>
                      
                      {toolpath.description && (
                        <p className="text-gray-600 dark:text-gray-400 text-sm mb-3 line-clamp-2">{toolpath.description}</p>
                      )}
                      
                      <div className="flex flex-wrap gap-2 mb-3">
                        <span className="px-2 py-1 text-xs font-medium rounded bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300">
                          {toolpath.operationType || 'Contour'}
                        </span>
                      </div>
                      
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                        ID: <code className="bg-gray-100 dark:bg-gray-900 px-1 rounded font-mono">{toolpath.id.substring(0, 8)}...</code>
                      </div>
                      
                      <div className="flex justify-between mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          Updated: {new Date(toolpath.updatedAt).toLocaleDateString()}
                        </span>
                        
                        <div className="flex space-x-3">
                          <button
                            onClick={(e) => handleSendToCAM(toolpath, e)}
                            className="p-1 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded"
                            title="Use in CAM"
                          >
                            <Cpu size={16} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/toolpaths/${toolpath.id}`);
                            }}
                            className="p-1 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
                            title="Edit"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            onClick={(e) => handleDeleteToolpath(toolpath.id, e)}
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
                      Type / Operation
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
                    <th scope="col" className="relative px-6 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {toolpaths.map((toolpath) => (
                    <motion.tr 
                      key={toolpath.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3 }}
                      className="hover:bg-gray-50 dark:hover:bg-gray-900/50 cursor-pointer"
                      onClick={() => router.push(`/toolpaths/${toolpath.id}`)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10 bg-gray-100 dark:bg-gray-900 rounded-md flex items-center justify-center">
                            {toolpath.thumbnail ? (
                              <img 
                                src={toolpath.thumbnail} 
                                alt="" 
                                className="h-10 w-10 rounded-md object-cover"
                              />
                            ) : (
                              <Code size={20} className="text-gray-400 dark:text-gray-600" />
                            )}
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                              {toolpath.name}
                            </div>
                            {toolpath.description && (
                              <div className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-xs">
                                {toolpath.description}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300">
                            {toolpath.type || 'Mill'}
                          </span>
                          <span className="mt-1 px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-300">
                            {toolpath.operationType || 'Contour'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {projects.find(p => p.id === toolpath.projectId)?.name || toolpath.projectId || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {new Date(toolpath.updatedAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500 dark:text-gray-400">
                        {toolpath.id.substring(0, 8)}...
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end space-x-2">
                          <button
                            onClick={(e) => handleSendToCAM(toolpath, e)}
                            className="p-1 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded"
                            title="Use in CAM"
                          >
                            <Cpu size={16} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/toolpaths/${toolpath.id}?download=true`);
                            }}
                            className="p-1 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded"
                            title="Download G-code"
                          >
                            <Download size={16} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/toolpaths/${toolpath.id}`);
                            }}
                            className="p-1 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
                            title="Edit"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            onClick={(e) => handleDeleteToolpath(toolpath.id, e)}
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
          
          {/* Toolpath Creation Modal */}
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
                    {selectedToolpath ? 'Edit Toolpath' : 'Create New Toolpath'}
                  </h3>
                </div>
                
                <form onSubmit={handleCreateToolpath}>
                  <div className="px-6 py-4 max-h-[70vh] overflow-y-auto">
                    <div className="mb-4">
                      <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Toolpath Name
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
                        Machine Type
                      </label>
                      <select
                        id="type"
                        name="type"
                        value={formData.type}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="mill">Mill</option>
                        <option value="lathe">Lathe</option>
                        <option value="3dprinter">3D Printer</option>
                      </select>
                    </div>
                    
                    <div className="mb-4">
                      <label htmlFor="operationType" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Operation Type
                      </label>
                      <select
                        id="operationType"
                        name="operationType"
                        value={formData.operationType}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      >
                        {formData.type === 'mill' && (
                          <>
                            <option value="contour">Contour</option>
                            <option value="pocket">Pocket</option>
                            <option value="drill">Drill</option>
                            <option value="engrave">Engrave</option>
                            <option value="profile">3D Profile</option>
                            <option value="threading">Threading</option>
                          </>
                        )}
                        {formData.type === 'lathe' && (
                          <>
                            <option value="turning">Turning</option>
                            <option value="facing">Facing</option>
                            <option value="boring">Boring</option>
                            <option value="threading">Threading</option>
                            <option value="grooving">Grooving</option>
                            <option value="parting">Parting</option>
                          </>
                        )}
                        {formData.type === '3dprinter' && (
                          <>
                            <option value="standard">Standard Print</option>
                            <option value="vase">Vase Mode</option>
                            <option value="support">Support</option>
                            <option value="infill">Infill</option>
                            <option value="raft">Raft</option>
                            <option value="brim">Brim</option>
                          </>
                        )}
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
                      <label htmlFor="gcode" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        G-code (optional)
                      </label>
                      <textarea
                        id="gcode"
                        name="gcode"
                        rows={6}
                        value={formData.gcode}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                        placeholder="; G-code content here"
                      ></textarea>
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
                        Make toolpath public (visible to all users)
                      </label>
                    </div>
                  </div>
                  
                  <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900 flex justify-end space-x-3 rounded-b-lg">
                    <button
                      type="button"
                      className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                      onClick={() => {
                        setShowModal(false);
                        setSelectedToolpath(null);
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
                      {isLoading ? 'Saving...' : selectedToolpath ? 'Update' : 'Create'}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
          
          {/* Predefined Library Modal */}
          {showLibrary && (
            <PredefinedLibrary
              libraryType="toolpaths"
              onSelectItem={handleSelectLibraryItem}
              isOpen={showLibrary}
              onClose={() => setShowLibrary(false)}
              projectId={filters.projectId || ''}
            />
          )}
        </div>
      </Layout>
    </>
  );
}