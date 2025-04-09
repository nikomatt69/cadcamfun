import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { 
  Edit, 
  Trash2, 
  Plus, 
  Book, 
  Tool as ToolIcon, 
  Search,
  X,
  ExternalLink,
  Cpu,
  Filter,
  Grid,
  List
} from 'react-feather';
import Link from 'next/link';

import PredefinedLibrary from '@/src/components/library/PredefinedLibrary';
import LocalToolsLibraryView from '@/src/components/library/LocalToolsLibraryView';
import Loading from '@/src/components/ui/Loading';
import { Tool } from '@prisma/client';
import { fetchTools, createTool, updateTool, deleteTool } from '@/src/lib/api/tools';
import Metatags from '@/src/components/layout/Metatags';
import ExportImportControls from '@/src/components/components/ExportImportControls';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import dynamic from 'next/dynamic';
import ExportImportToolpathsControls from '@/src/components/cam/ToolpathControls';

interface ToolFilterState {
  type: string;
  material: string;
  search: string;
  diameter: string;
}
const Layout = dynamic(
  () => import('@/src/components/layout/Layout'),
  { ssr: false }
);  
export default function ToolsList() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  // State for filters
  const [filters, setFilters] = useState<ToolFilterState>({
    type: '',
    material: '',
    search: '',
    diameter: ''
  });
  
  // State for the modals
  const [showModal, setShowModal] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showLocalLibrary, setShowLocalLibrary] = useState(false);
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    type: 'endmill',
    diameter: 6,
    material: 'HSS',
    numberOfFlutes: 2,
    maxRPM: 10000,
    coolantType: 'none',
    cuttingLength: 0,
    totalLength: 0,
    shankDiameter: 0,
    notes: ''
  });
  
  // State for data and UI
  const [tools, setTools] = useState<Tool[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showFilters, setShowFilters] = useState(false);
  
  // Fetch tools when component mounts or filters change
  useEffect(() => {
    if (status === 'authenticated') {
      fetchToolData();
    }
  }, [filters, status]);
  
  const fetchToolData = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const toolsData = await fetchTools({
        type: filters.type || undefined,
        material: filters.material || undefined,
        search: filters.search || undefined,
        
      });
      
      setTools(toolsData);
    } catch (err) {
      console.error('Error fetching tools:', err);
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
      type: '',
      material: '',
      search: '',
      diameter: ''
    });
  };
  
  // Handle form input changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
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
      type: 'endmill',
      diameter: 6,
      material: 'HSS',
      numberOfFlutes: 2,
      maxRPM: 10000,
      coolantType: 'none',
      cuttingLength: 0,
      totalLength: 0,
      shankDiameter: 0,
      notes: ''
    });
    setSelectedTool(null);
  };
  
  // Handle tool creation
  const handleCreateTool = async (e: React.FormEvent) => {
    e.preventDefault();
    
    setIsLoading(true);
    
    try {
      // Parse numeric values
      const toolData = {
        name: formData.name,
        type: formData.type,
        diameter: parseFloat(formData.diameter.toString()),
        material: formData.material,
        numberOfFlutes: formData.numberOfFlutes ? parseInt(formData.numberOfFlutes.toString()) : undefined,
        maxRPM: formData.maxRPM ? parseInt(formData.maxRPM.toString()) : undefined,
        coolantType: formData.coolantType,
        cuttingLength: formData.cuttingLength ? parseFloat(formData.cuttingLength.toString()) : undefined,
        totalLength: formData.totalLength ? parseFloat(formData.totalLength.toString()) : undefined,
        shankDiameter: formData.shankDiameter ? parseFloat(formData.shankDiameter.toString()) : undefined,
        notes: formData.notes || undefined
      };
      
      let result;
      
      if (selectedTool) {
        // Update existing tool
        result = await updateTool({
          id: selectedTool.id,
          ...toolData
        });
        toast.success('Tool updated successfully');
      } else {
        // Create new tool
        result = await createTool(toolData);
        toast.success('Tool created successfully');
      }
      
      // Refresh the tool list
      await fetchToolData();
      
      // Close the modal
      setShowModal(false);
      resetForm();
      
      // Navigate to the new tool details page
      if (result.id && !selectedTool) {
        router.push(`/tools/${result.id}`);
      }
    } catch (err) {
      console.error('Error saving tool:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to save tool');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Handle opening the edit modal
  const handleEditClick = (tool: Tool, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedTool(tool);
    setFormData({
      name: tool.name,
      type: tool.type,
      diameter: tool.diameter,
      material: tool.material,
      numberOfFlutes: tool.numberOfFlutes || 2,
      maxRPM: tool.maxRPM || 10000,
      coolantType: tool.coolantType || 'none',
      cuttingLength: tool.cuttingLength || 0,
      totalLength: tool.totalLength || 0,
      shankDiameter: tool.shankDiameter || 0,
      notes: tool.notes || ''
    });
    setShowModal(true);
  };
  
  // Send tool to CAM
  const handleSendToCAM = (tool: Tool, e: React.MouseEvent) => {
    e.stopPropagation();
    
    try {
      // Save to localStorage for CAM to pick up
      localStorage.setItem('toolToLoadInCAM', JSON.stringify({
        id: tool.id,
        name: tool.name,
        type: tool.type,
        diameter: tool.diameter,
        material: tool.material,
        numberOfFlutes: tool.numberOfFlutes,
        maxRPM: tool.maxRPM,
        coolantType: tool.coolantType,
        cuttingLength: tool.cuttingLength,
        totalLength: tool.totalLength,
        shankDiameter: tool.shankDiameter
      }));
      
      // Redirect to CAM editor
      router.push({
        pathname: '/cam',
        query: { loadTool: tool.id }
      });
      
      toast.success(`Opening ${tool.name} in CAM editor`);
    } catch (err) {
      console.error('Failed to send tool to CAM:', err);
      toast.error('Failed to send tool to CAM editor');
    }
  };
  
  // Handle tool deletion
  const handleDeleteTool = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this tool?')) return;
    
    setIsLoading(true);
    
    try {
      await deleteTool(id);
      toast.success('Tool deleted successfully');
      // Refresh the list
      await fetchToolData();
    } catch (err) {
      console.error('Failed to delete tool:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to delete tool');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle selecting item from library
  const handleSelectLibraryItem = async (item: any) => {
    try {
      setIsLoading(true);
      
      const toolData = {
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
      };
      
      const result = await createTool(toolData);
      toast.success('Tool created from library successfully');
      
      // Refresh the list
      await fetchToolData();
      setShowLibrary(false);
      
      // Navigate to the new tool details page
      if (result.id) {
        router.push(`/tools/${result.id}`);
      }
    } catch (err) {
      console.error('Failed to create tool from library:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to create tool from library');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Handle loading a local tool
  const handleLoadLocalTool = (tool: any) => {
    try {
      setIsLoading(true);
      
      const toolData = {
        name: tool.name,
        type: tool.type,
        diameter: tool.diameter,
        material: tool.material,
        numberOfFlutes: tool.numberOfFlutes,
        maxRPM: tool.maxRPM,
        coolantType: tool.coolantType,
        cuttingLength: tool.cuttingLength,
        totalLength: tool.totalLength,
        shankDiameter: tool.shankDiameter,
        notes: tool.notes
      };
      
      createTool(toolData)
        .then((result) => {
          toast.success('Tool imported from local library');
          fetchToolData();
          
          // Navigate to the new tool
          if (result.id) {
            router.push(`/tools/${result.id}`);
          }
        });
        
    } catch (err) {
      console.error('Failed to import local tool:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to import local tool');
    } finally {
      setIsLoading(false);
      setShowLocalLibrary(false);
    }
  };
  
  // Tool icon based on type
  const getToolIcon = (type: string) => {
    switch (type) {
      case 'endmill': return '🔄';
      case 'ballendmill': return '🔵';
      case 'drillbit': return '🔨';
      case 'chamfermill': return '🔺';
      case 'facemill': return '⬛';
      case 'engraver': return '✏️';
      case 'turningTool': return '⚙️';
      case 'threadingTool': return '🔩';
      default: return '🧩';
    }
  };
  
  if (status === 'loading') {
    return <div className="flex h-screen items-center justify-center"><Loading/></div>;
  }
  if (status === 'unauthenticated') {
    router.push('/auth/signin');
    return null;
  }
  
  return (
    <>
      <Metatags title={'Tool Library'} />
      
      <Layout>
        <div className="p-4 md:p-6">
          <div className="flex flex-col md:flex-row md:justify-between md:items-center mb-6 gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Tool Library</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">Manage cutting tools for use in your CAM operations</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setShowLocalLibrary(true)}
                className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 flex items-center"
              >
                <ToolIcon size={18} className="mr-2" />
                Local Library
              </button>
              <button
                onClick={() => setShowLibrary(true)}
                className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 flex items-center"
              >
                <Book size={18} className="mr-2" />
                Standard Tools
              </button>
              <button
                onClick={() => {
                  setSelectedTool(null);
                  setShowModal(true);
                }}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center"
              >
                <Plus size={18} className="mr-2" />
                New Tool
              </button>
            </div>
          </div>
          
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 mb-6">
            <ExportImportToolpathsControls entityType="tools" />
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
                  placeholder="Search tools..."
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <Filter size={16} className="mr-2" />
                Filters
                {Object.values(filters).some(f => f !== '') && (
                  <span className="ml-2 px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs rounded-full">
                    {Object.values(filters).filter(f => f !== '').length}
                  </span>
                )}
              </button>
              
              <div className="flex items-center space-x-4">
                <button
                  onClick={clearFilters}
                  className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 flex items-center"
                >
                  <X size={16} className="mr-1" />
                  Clear
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
            
            {/* Advanced filters */}
            <AnimatePresence>
              {showFilters && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                  className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 overflow-hidden"
                >
                  <div>
                    <label htmlFor="type" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Tool Type
                    </label>
                    <select
                      id="type"
                      name="type"
                      value={filters.type}
                      onChange={handleFilterChange}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
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
                    </select>
                  </div>
                  
                  <div>
                    <label htmlFor="material" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Material
                    </label>
                    <select
                      id="material"
                      name="material"
                      value={filters.material}
                      onChange={handleFilterChange}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">All Materials</option>
                      <option value="HSS">HSS</option>
                      <option value="Carbide">Carbide</option>
                      <option value="Cobalt">Cobalt</option>
                      <option value="Diamond">Diamond</option>
                      <option value="Ceramic">Ceramic</option>
                    </select>
                  </div>
                  
                  <div>
                    <label htmlFor="diameter" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Diameter Range
                    </label>
                    <select
                      id="diameter"
                      name="diameter"
                      value={filters.diameter}
                      onChange={handleFilterChange}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">All Sizes</option>
                      <option value="small">Small (&lt; 3mm)</option>
                      <option value="medium">Medium (3-10mm)</option>
                      <option value="large">Large (&gt; 10mm)</option>
                    </select>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          
          {/* Tools List */}
          {isLoading && tools.length === 0 ? (
            <div className="flex h-64 items-center justify-center">
              <Loading />
            </div>
          ) : error ? (
            <div className="bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-300 p-4 rounded-md">
              {error.message}
            </div>
          ) : tools.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-6 text-center">
              <div className="w-16 h-16 bg-gray-200 dark:bg-gray-900 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">🔧</span>
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No tools yet</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                {filters.search || filters.type || filters.material || filters.diameter ? 
                  'No tools match your search criteria.' : 
                  'Add cutting tools to use in your CAM operations for generating accurate toolpaths or choose from our standard library.'}
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                {filters.search || filters.type || filters.material || filters.diameter ? (
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
                      Create Tool
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
                {tools.map((tool) => (
                  <motion.div 
                    key={tool.id} 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.3 }}
                    className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow cursor-pointer"
                    onClick={() => router.push(`/tools/${tool.id}`)}
                  >
                    <div className="p-6">
                      <div className="flex items-center mb-4">
                        <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-800/30 flex items-center justify-center mr-3">
                          <span className="text-xl">{getToolIcon(tool.type)}</span>
                        </div>
                        <div>
                          <h3 className="text-lg font-medium text-gray-900 dark:text-white">{tool.name}</h3>
                          <p className="text-sm text-gray-500 dark:text-gray-400 capitalize">{tool.type}</p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="flex flex-col">
                          <span className="text-gray-500 dark:text-gray-400">Diameter</span>
                          <span className="font-medium text-gray-900 dark:text-white">{tool.diameter} mm</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-gray-500 dark:text-gray-400">Material</span>
                          <span className="font-medium text-gray-900 dark:text-white">{tool.material}</span>
                        </div>
                        {tool.numberOfFlutes && (
                          <div className="flex flex-col">
                            <span className="text-gray-500 dark:text-gray-400">Flutes</span>
                            <span className="font-medium text-gray-900 dark:text-white">{tool.numberOfFlutes}</span>
                          </div>
                        )}
                        {tool.maxRPM && (
                          <div className="flex flex-col">
                            <span className="text-gray-500 dark:text-gray-400">Max RPM</span>
                            <span className="font-medium text-gray-900 dark:text-white">{tool.maxRPM}</span>
                          </div>
                        )}
                      </div>
                      
                      {tool.notes && (
                        <div className="mt-3 text-sm text-gray-600 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700 pt-2 line-clamp-2">
                          <p>{tool.notes}</p>
                        </div>
                      )}
                    </div>
                    
                    <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-3 bg-gray-50 dark:bg-gray-900 flex justify-between items-center">
                      <button
                        onClick={(e) => handleSendToCAM(tool, e)}
                        className="text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 flex items-center text-sm"
                      >
                        <Cpu size={14} className="mr-1" />
                        Use in CAM
                      </button>
                      
                      <div className="flex space-x-2">
                        <button 
                          onClick={(e) => handleEditClick(tool, e)}
                          className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
                          title="Edit Tool"
                        >
                          <Edit size={16} />
                        </button>
                        <button 
                          onClick={(e) => handleDeleteTool(tool.id, e)}
                          className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                          title="Delete Tool"
                          disabled={isLoading}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Tool
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Diameter
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Material
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Details
                    </th>
                    <th scope="col" className="relative px-6 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {tools.map((tool) => (
                    <tr 
                      key={tool.id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-900/50 cursor-pointer"
                      onClick={() => router.push(`/tools/${tool.id}`)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10 bg-blue-100 dark:bg-blue-800/30 rounded-full flex items-center justify-center">
                            <span className="text-xl">{getToolIcon(tool.type)}</span>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">{tool.name}</div>
                            <div className="text-sm text-gray-500 dark:text-gray-400 capitalize">{tool.type}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-900 dark:text-white">{tool.diameter} mm</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-900 dark:text-white">{tool.material}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {tool.numberOfFlutes && `${tool.numberOfFlutes} flutes • `}
                        {tool.maxRPM && `${tool.maxRPM} RPM`}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end space-x-2">
                          <button
                            onClick={(e) => handleSendToCAM(tool, e)}
                            className="p-1 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded"
                            title="Use in CAM"
                          >
                            <Cpu size={16} />
                          </button>
                          <button
                            onClick={(e) => handleEditClick(tool, e)}
                            className="p-1 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
                            title="Edit"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            onClick={(e) => handleDeleteTool(tool.id, e)}
                            className="p-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                            title="Delete"
                            disabled={isLoading}
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
          
          {/* Tool Creation Modal */}
          {showModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <motion.div 
                className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.3 }}
              >
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                    {selectedTool ? 'Edit Tool' : 'Create New Tool'}
                  </h3>
                </div>
                
                <form onSubmit={handleCreateTool} className="max-h-[70vh] overflow-y-auto">
                  <div className="px-6 py-4">
                    <div className="mb-4">
                      <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Tool Name
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
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="mb-4">
                        <label htmlFor="type" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Tool Type
                        </label>
                        <select
                          id="type"
                          name="type"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
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
                        <label htmlFor="material" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Material
                        </label>
                        <select
                          id="material"
                          name="material"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
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
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="mb-4">
                        <label htmlFor="diameter" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Diameter (mm)
                        </label>
                        <input
                          type="number"
                          id="diameter"
                          name="diameter"
                          step="0.1"
                          min="0.1"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                          value={formData.diameter}
                          onChange={handleChange}
                          required
                        />
                      </div>
                      
                      <div className="mb-4">
                        <label htmlFor="shankDiameter" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Shank Diameter (mm)
                        </label>
                        <input
                          type="number"
                          id="shankDiameter"
                          name="shankDiameter"
                          step="0.1"
                          min="0"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                          value={formData.shankDiameter}
                          onChange={handleChange}
                        />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="mb-4">
                        <label htmlFor="numberOfFlutes" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Number of Flutes
                        </label>
                        <input
                          type="number"
                          id="numberOfFlutes"
                          name="numberOfFlutes"
                          min="1"
                          max="12"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                          value={formData.numberOfFlutes}
                          onChange={handleChange}
                        />
                      </div>
                      
                      <div className="mb-4">
                        <label htmlFor="maxRPM" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Max RPM
                        </label>
                        <input
                          type="number"
                          id="maxRPM"
                          name="maxRPM"
                          min="1000"
                          step="1000"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                          value={formData.maxRPM}
                          onChange={handleChange}
                        />
                      </div>
                    </div>
                    
                    <div className="mb-4">
                      <label htmlFor="coolantType" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Coolant Type
                      </label>
                      <select
                        id="coolantType"
                        name="coolantType"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
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
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="mb-4">
                        <label htmlFor="cuttingLength" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Cutting Length (mm)
                        </label>
                        <input
                          type="number"
                          id="cuttingLength"
                          name="cuttingLength"
                          step="0.1"
                          min="0"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                          value={formData.cuttingLength}
                          onChange={handleChange}
                        />
                      </div>
                      
                      <div className="mb-4">
                        <label htmlFor="totalLength" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Total Length (mm)
                        </label>
                        <input
                          type="number"
                          id="totalLength"
                          name="totalLength"
                          step="0.1"
                          min="0"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                          value={formData.totalLength}
                          onChange={handleChange}
                        />
                      </div>
                    </div>
                    
                    <div className="mb-4">
                      <label htmlFor="notes" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Notes
                      </label>
                      <textarea
                        id="notes"
                        name="notes"
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        value={formData.notes}
                        onChange={handleChange}
                      ></textarea>
                    </div>
                  </div>
                  
                  <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900 flex justify-end space-x-3 rounded-b-lg">
                    <button
                      type="button"
                      className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                      onClick={() => {
                        setShowModal(false);
                        setSelectedTool(null);
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
                      {isLoading ? 'Saving...' : selectedTool ? 'Update' : 'Create'}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
          
          {/* Predefined Library Modal */}
          {showLibrary && (
            <PredefinedLibrary
              libraryType="tools"
              onSelectItem={handleSelectLibraryItem}
              isOpen={showLibrary}
              onClose={() => setShowLibrary(false)}
            />
          )}
          
          {/* Local Library Modal */}
          {showLocalLibrary && (
            <LocalToolsLibraryView
              onLoadTool={handleLoadLocalTool}
              onClose={() => setShowLocalLibrary(false)}
              showCloseButton={true}
            />
          )}
        </div>
      </Layout>
    </>
  );
}
