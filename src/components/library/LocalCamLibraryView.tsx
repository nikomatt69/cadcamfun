// src/components/library/LocalCamLibraryView.tsx
import React, { useState, useEffect } from 'react';
import { useLocalCamLibraryStore, LocalCamProject } from '@/src/store/localCamLibraryStore';
import { useLocalLibrary } from '@/src/hooks/useLocalLibrary';
import { getStorageStats } from '@/src/lib/localStorageService';
import { 
  Grid, 
  List, 
  Search, 
  Trash2, 
  Download, 
  Upload, 
  Save, 
  Edit, 
  Plus, 
  Clock, 
  Tag, 
  Info, 
  X,
  Code,
  Layers,
  Tool,
  Cpu
} from 'react-feather';

interface LocalCamLibraryViewProps {
  onSelectProject?: (projectId: string) => void;
  onClose?: () => void;
  allowImport?: boolean;
  allowExport?: boolean;
  showCloseButton?: boolean;
}

const LocalCamLibraryView: React.FC<LocalCamLibraryViewProps> = ({
  onSelectProject,
  onClose,
  allowImport = true,
  allowExport = true,
  showCloseButton = true
}) => {
  // Local state
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProject, setSelectedProject] = useState<LocalCamProject | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [showGCodeModal, setShowGCodeModal] = useState(false);
  const [saveFormData, setSaveFormData] = useState({
    name: '',
    description: '',
    tags: ''
  });
  const [storageInfo, setStorageInfo] = useState(getStorageStats());

  // Get CAM library store and local library hook
  const { 
    projects, 
    loadLibrary, 
    searchProjects, 
    deleteProject, 
    exportProject 
  } = useLocalCamLibraryStore();
  
  const { 
    saveCamProject, 
    loadCamProject, 
    getCurrentCamProjectData,
    isLoading, 
    error, 
    clearError 
  } = useLocalLibrary();
  
  // Load the library on component mount
  useEffect(() => {
    loadLibrary();
    setStorageInfo(getStorageStats());
  }, [loadLibrary]);
  
  // Filtered projects based on search query
  const filteredProjects = searchQuery 
    ? searchProjects(searchQuery)
    : projects;
  
  // Handle selecting a project
  const handleSelectProject = (project: LocalCamProject) => {
    setSelectedProject(project);
    if (onSelectProject) {
      onSelectProject(project.id);
    }
  };
  
  // Handle loading a project
  const handleLoadProject = (project: LocalCamProject) => {
    loadCamProject(project.id);
    if (onClose) {
      onClose();
    }
  };
  
  // Handle saving the current project
  const handleSaveProject = () => {
    const { name, description, tags } = saveFormData;
    const tagsList = tags.split(',').map(tag => tag.trim()).filter(Boolean);
    
    saveCamProject(name, description, tagsList);
    setShowSaveModal(false);
    loadLibrary(); // Refresh the library
    setStorageInfo(getStorageStats());
  };
  
  // Handle deleting a project
  const handleDeleteProject = () => {
    if (selectedProject) {
      deleteProject(selectedProject.id);
      setSelectedProject(null);
      setShowDeleteConfirmation(false);
      setShowDetailsModal(false);
      setStorageInfo(getStorageStats());
    }
  };
  
  // Handle exporting a project
  const handleExportProject = () => {
    if (!selectedProject) return;
    
    const exportedProject = exportProject(selectedProject.id);
    if (!exportedProject) return;
    
    // Create a download link
    const dataStr = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(exportedProject, null, 2)
    )}`;
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute('href', dataStr);
    downloadAnchorNode.setAttribute('download', `${exportedProject.name}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };
  
  // Open save modal with current project data
  const handleOpenSaveModal = () => {
    const currentProject = getCurrentCamProjectData();
    setSaveFormData({
      name: currentProject.name,
      description: currentProject.description || '',
      tags: currentProject.tags?.join(', ') || ''
    });
    setShowSaveModal(true);
  };
  
  // Format date string
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };
  
  // Export G-code to a file
  const handleExportGCode = () => {
    if (!selectedProject || !selectedProject.gcode) return;
    
    const dataStr = `data:text/plain;charset=utf-8,${encodeURIComponent(selectedProject.gcode)}`;
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute('href', dataStr);
    downloadAnchorNode.setAttribute('download', `${selectedProject.name}.gcode`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };
  
  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">CAM Projects Library</h2>
        {showCloseButton && (
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100"
          >
            <X size={24} />
          </button>
        )}
      </div>
      
      {/* Storage info */}
      <div className="mb-6 bg-blue-50 p-4 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-blue-800">Storage Usage</h3>
          <span className="text-xs text-blue-600">
            {(storageInfo.totalUsage / 1024 / 1024).toFixed(2)} MB of {(LOCAL_STORAGE_LIMIT / 1024 / 1024).toFixed(2)} MB used
          </span>
        </div>
        <div className="w-full bg-blue-200 rounded-full h-2.5">
          <div 
            className="bg-blue-600 h-2.5 rounded-full" 
            style={{ width: `${Math.min(storageInfo.usagePercentage, 100)}%` }}
          ></div>
        </div>
        <div className="flex justify-between mt-2 text-xs text-blue-600">
          <span>CAM Library: {(storageInfo.libraryStats.cam / 1024 / 1024).toFixed(2)} MB</span>
          <span>{storageInfo.usagePercentage.toFixed(1)}% used</span>
        </div>
      </div>
      
      {/* Search and controls */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search size={18} className="text-gray-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        
        <div className="flex space-x-2">
          <button
            onClick={handleOpenSaveModal}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            <Save size={16} className="mr-2" />
            Save Current
          </button>
          
          <div className="border border-gray-300 rounded-md flex">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 ${viewMode === 'grid' ? 'bg-gray-100' : ''}`}
              title="Grid View"
            >
              <Grid size={20} className="text-gray-600" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 ${viewMode === 'list' ? 'bg-gray-100' : ''}`}
              title="List View"
            >
              <List size={20} className="text-gray-600" />
            </button>
          </div>
        </div>
      </div>
      
      {/* Error message */}
      {error && (
        <div className="bg-red-50 text-red-800 p-4 rounded-md mb-6 flex items-start">
          <div className="mr-3 flex-shrink-0">
            <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-sm">{error}</p>
            <button 
              className="text-sm text-red-600 hover:text-red-800 mt-1"
              onClick={clearError}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      
      {/* Loading indicator */}
      {isLoading && (
        <div className="flex justify-center items-center py-10">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
        </div>
      )}
      
      {/* No projects message */}
      {!isLoading && filteredProjects.length === 0 && (
        <div className="text-center py-10 bg-gray-50 rounded-lg">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">No CAM projects found</h3>
          <p className="mt-1 text-sm text-gray-500">
            {searchQuery
              ? `No projects match "${searchQuery}"`
              : "Save your first CAM project to get started"}
          </p>
          <div className="mt-6">
            <button
              onClick={handleOpenSaveModal}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="-ml-1 mr-2 h-5 w-5" />
              Save Current Project
            </button>
          </div>
        </div>
      )}
      
      {/* Projects Grid View */}
      {!isLoading && filteredProjects.length > 0 && viewMode === 'grid' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.map((project) => (
            <div
              key={project.id}
              className="group border border-gray-200 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow"
            >
              <div 
                className="h-40 bg-gray-100 relative cursor-pointer"
                onClick={() => handleSelectProject(project)}
              >
                {project.thumbnail ? (
                  <img
                    src={project.thumbnail}
                    alt={project.name}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <svg
                      className="h-20 w-20 text-gray-300"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
                    </svg>
                  </div>
                )}
                
                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-opacity"></div>
                
                {/* Badges for features */}
                <div className="absolute top-2 right-2 flex flex-col space-y-1">
                  {project.gcode && (
                    <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">
                      G-code
                    </span>
                  )}
                  {project.machineConfig && (
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">
                      Machine
                    </span>
                  )}
                </div>
              </div>
              
              <div className="p-4">
                <h3 className="text-lg font-medium text-gray-900 truncate">
                  {project.name}
                </h3>
                
                {project.description && (
                  <p className="mt-1 text-sm text-gray-500 line-clamp-2">
                    {project.description}
                  </p>
                )}
                
                <div className="mt-2 flex items-center text-xs text-gray-500">
                  <Clock size={14} className="mr-1" />
                  {formatDate(project.updatedAt)}
                </div>
                
                {/* Toolpaths and tools counters */}
                <div className="mt-2 flex space-x-4">
                  <div className="flex items-center text-xs text-gray-500">
                    <Layers size={14} className="mr-1" />
                    {project.toolpaths?.length || 0} toolpaths
                  </div>
                  
                  {project.tools && project.tools.length > 0 && (
                    <div className="flex items-center text-xs text-gray-500">
                      <Tool size={14} className="mr-1" />
                      {project.tools.length} tools
                    </div>
                  )}
                </div>
                
                {project.tags && project.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {project.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex justify-between">
                <button
                  onClick={() => handleLoadProject(project)}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  Load
                </button>
                
                <div className="flex space-x-2">
                  <button
                    onClick={() => {
                      setSelectedProject(project);
                      setShowDetailsModal(true);
                    }}
                    className="p-1 text-gray-500 hover:bg-gray-100 rounded-full"
                    title="Details"
                  >
                    <Info size={16} />
                  </button>
                  
                  {project.gcode && (
                    <button
                      onClick={() => {
                        setSelectedProject(project);
                        setShowGCodeModal(true);
                      }}
                      className="p-1 text-gray-500 hover:bg-gray-100 rounded-full"
                      title="View G-code"
                    >
                      <Code size={16} />
                    </button>
                  )}
                  
                  {allowExport && (
                    <button
                      onClick={() => {
                        setSelectedProject(project);
                        handleExportProject();
                      }}
                      className="p-1 text-gray-500 hover:bg-gray-100 rounded-full"
                      title="Export"
                    >
                      <Download size={16} />
                    </button>
                  )}
                  
                  <button
                    onClick={() => {
                      setSelectedProject(project);
                      setShowDeleteConfirmation(true);
                    }}
                    className="p-1 text-red-500 hover:bg-red-50 rounded-full"
                    title="Delete"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Projects List View */}
      {!isLoading && filteredProjects.length > 0 && viewMode === 'list' && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Updated
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Features
                </th>
                <th scope="col" className="relative px-6 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredProjects.map((project) => (
                <tr 
                  key={project.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => handleSelectProject(project)}
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10 bg-gray-100 rounded-md flex items-center justify-center">
                        {project.thumbnail ? (
                          <img
                            src={project.thumbnail}
                            alt={project.name}
                            className="h-10 w-10 rounded-md object-cover"
                          />
                        ) : (
                          <svg
                            className="h-6 w-6 text-gray-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1.5}
                              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                            />
                          </svg>
                        )}
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">
                          {project.name}
                        </div>
                        {project.description && (
                          <div className="text-sm text-gray-500 truncate max-w-xs">
                            {project.description}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(project.updatedAt)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex space-x-2">
                      {project.gcode && (
                        <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full flex items-center">
                          <Code size={12} className="mr-1" />
                          G-code
                        </span>
                      )}
                      {project.machineConfig && (
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full flex items-center">
                          <Cpu size={12} className="mr-1" />
                          Machine
                        </span>
                      )}
                      <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs font-medium rounded-full flex items-center">
                        <Layers size={12} className="mr-1" />
                        {project.toolpaths?.length || 0}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end space-x-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleLoadProject(project);
                        }}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        Load
                      </button>
                      
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedProject(project);
                          setShowDetailsModal(true);
                        }}
                        className="p-1 text-gray-500 hover:bg-gray-100 rounded-full"
                        title="Details"
                      >
                        <Info size={16} />
                      </button>
                      
                      {project.gcode && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedProject(project);
                            setShowGCodeModal(true);
                          }}
                          className="p-1 text-gray-500 hover:bg-gray-100 rounded-full"
                          title="View G-code"
                        >
                          <Code size={16} />
                        </button>
                      )}
                      
                      {allowExport && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedProject(project);
                            handleExportProject();
                          }}
                          className="p-1 text-gray-500 hover:bg-gray-100 rounded-full"
                          title="Export"
                        >
                          <Download size={16} />
                        </button>
                      )}
                      
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedProject(project);
                          setShowDeleteConfirmation(true);
                        }}
                        className="p-1 text-red-500 hover:bg-red-50 rounded-full"
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
      
      {/* Save Project Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-gray-900 bg-opacity-50 z-50">
          <div className="bg-white rounded-lg max-w-md w-full mx-4 overflow-hidden shadow-xl">
            <div className="px-6 py-4 bg-blue-600">
              <h3 className="text-lg font-medium text-white">Save CAM Project to Library</h3>
            </div>
            <div className="p-6">
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Project Name
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  value={saveFormData.name}
                  onChange={(e) => setSaveFormData({ ...saveFormData, name: e.target.value })}
                  placeholder="Enter a name for this project"
                  required
                />
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description (optional)
                </label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  value={saveFormData.description}
                  onChange={(e) => setSaveFormData({ ...saveFormData, description: e.target.value })}
                  placeholder="Enter a description"
                  rows={3}
                />
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tags (comma separated, optional)
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  value={saveFormData.tags}
                  onChange={(e) => setSaveFormData({ ...saveFormData, tags: e.target.value })}
                  placeholder="e.g. milling, 3-axis, aluminum"
                />
              </div>
              
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50"
                  onClick={() => setShowSaveModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  onClick={handleSaveProject}
                  disabled={!saveFormData.name}
                >
                  Save Project
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Project Details Modal */}
      {showDetailsModal && selectedProject && (
        <div className="fixed inset-0 flex items-center justify-center bg-gray-900 bg-opacity-50 z-50">
          <div className="bg-white rounded-lg max-w-lg w-full mx-4 overflow-hidden shadow-xl">
            <div className="px-6 py-4 flex justify-between items-center bg-gray-100">
              <h3 className="text-lg font-medium text-gray-900">Project Details</h3>
              <button
                className="text-gray-500 hover:text-gray-700"
                onClick={() => setShowDetailsModal(false)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <div className="flex flex-col md:flex-row gap-6">
                <div className="w-full md:w-1/3 flex-shrink-0">
                  <div className="bg-gray-100 h-40 rounded-md flex items-center justify-center mb-4">
                    {selectedProject.thumbnail ? (
                      <img
                        src={selectedProject.thumbnail}
                        alt={selectedProject.name}
                        className="w-full h-full object-contain rounded-md"
                      />
                    ) : (
                      <svg
                        className="h-20 w-20 text-gray-300"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                        />
                      </svg>
                    )}
                  </div>
                  
                  <div className="flex flex-col space-y-2">
                    <button
                      onClick={() => handleLoadProject(selectedProject)}
                      className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center justify-center"
                    >
                      <Upload size={16} className="mr-2" />
                      Load Project
                    </button>
                    
                    {selectedProject.gcode && (
                      <button
                        onClick={handleExportGCode}
                        className="w-full px-4 py-2 border border-green-300 text-green-700 rounded-md hover:bg-green-50 flex items-center justify-center"
                      >
                        <Code size={16} className="mr-2" />
                        Export G-code
                      </button>
                    )}
                    
                    {allowExport && (
                      <button
                        onClick={handleExportProject}
                        className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 flex items-center justify-center"
                      >
                        <Download size={16} className="mr-2" />
                        Export Project
                      </button>
                    )}
                    
                    <button
                      onClick={() => {
                        setShowDetailsModal(false);
                        setShowDeleteConfirmation(true);
                      }}
                      className="w-full px-4 py-2 border border-red-300 text-red-700 rounded-md hover:bg-red-50 flex items-center justify-center"
                    >
                      <Trash2 size={16} className="mr-2" />
                      Delete
                    </button>
                  </div>
                </div>
                
                <div className="w-full md:w-2/3">
                  <h2 className="text-xl font-bold text-gray-900 mb-2">{selectedProject.name}</h2>
                  
                  {selectedProject.description && (
                    <p className="text-gray-600 mb-4">{selectedProject.description}</p>
                  )}
                  
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-1">Created</h4>
                    <p className="text-gray-600">{formatDate(selectedProject.createdAt)}</p>
                  </div>
                  
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-1">Last Modified</h4>
                    <p className="text-gray-600">{formatDate(selectedProject.updatedAt)}</p>
                  </div>
                  
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-1">Toolpaths</h4>
                    <p className="text-gray-600">{selectedProject.toolpaths?.length || 0} toolpaths</p>
                  </div>
                  
                  {selectedProject.machineConfig && (
                    <div className="mb-4">
                      <h4 className="text-sm font-medium text-gray-700 mb-1">Machine</h4>
                      <p className="text-gray-600">{selectedProject.machineConfig.name}</p>
                    </div>
                  )}
                  
                  {selectedProject.material && (
                    <div className="mb-4">
                      <h4 className="text-sm font-medium text-gray-700 mb-1">Material</h4>
                      <p className="text-gray-600">{selectedProject.material.name}</p>
                    </div>
                  )}
                  
                  {selectedProject.tools && selectedProject.tools.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-sm font-medium text-gray-700 mb-1">Tools</h4>
                      <ul className="text-gray-600 text-sm">
                        {selectedProject.tools.slice(0, 3).map((tool) => (
                          <li key={tool.id}>
                            {tool.name} - {tool.type}, Ø{tool.diameter}mm
                          </li>
                        ))}
                        {selectedProject.tools.length > 3 && (
                          <li>+{selectedProject.tools.length - 3} more...</li>
                        )}
                      </ul>
                    </div>
                  )}
                  
                  {selectedProject.tags && selectedProject.tags.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-1">Tags</h4>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {selectedProject.tags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* G-code Viewer Modal */}
      {showGCodeModal && selectedProject && selectedProject.gcode && (
        <div className="fixed inset-0 flex items-center justify-center bg-gray-900 bg-opacity-50 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full mx-4 overflow-hidden shadow-xl">
            <div className="px-6 py-4 flex justify-between items-center bg-gray-100">
              <h3 className="text-lg font-medium text-gray-900">G-code: {selectedProject.name}</h3>
              <button
                className="text-gray-500 hover:text-gray-700"
                onClick={() => setShowGCodeModal(false)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <div className="mb-4 flex justify-between items-center">
                <div className="text-sm text-gray-600">
                  {selectedProject.gcode.split('\n').length} lines
                </div>
                <button
                  onClick={handleExportGCode}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center"
                >
                  <Download size={16} className="mr-2" />
                  Export G-code
                </button>
              </div>
              
              <div className="bg-gray-900 rounded-md p-4 overflow-auto max-h-96">
                <pre className="text-green-400 font-mono text-sm whitespace-pre">
                  {selectedProject.gcode}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Delete Confirmation Modal */}
      {showDeleteConfirmation && selectedProject && (
        <div className="fixed inset-0 flex items-center justify-center bg-gray-900 bg-opacity-50 z-50">
          <div className="bg-white rounded-lg max-w-md w-full mx-4 overflow-hidden shadow-xl">
            <div className="px-6 py-4 bg-red-600">
              <h3 className="text-lg font-medium text-white">Confirm Deletion</h3>
            </div>
            <div className="p-6">
              <p className="text-gray-600 mb-4">
                Sei sicuro di voler eliminare il progetto &quot;{selectedProject.name}&quot;? Questa azione non può essere annullata.
              </p>
              
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50"
                  onClick={() => setShowDeleteConfirmation(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                  onClick={handleDeleteProject}
                >
                  Delete Project
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Fallback value for LOCAL_STORAGE_LIMIT if not imported from the service
const LOCAL_STORAGE_LIMIT = 5 * 1024 * 1024; // 5MB

export default LocalCamLibraryView;