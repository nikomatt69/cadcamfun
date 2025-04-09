// src/components/library/LocalToolsLibraryView.tsx
import React, { useState, useEffect } from 'react';
import { useLocalToolsLibraryStore, LocalTool } from '@/src/store/localToolsLibraryStore';
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
  Info, 
  X,
  Tool as ToolIcon,
  Filter,
  ChevronDown
} from 'react-feather';

interface LocalToolsLibraryViewProps {
  onSelectTool?: (toolId: string) => void;
  onLoadTool?: (tool: LocalTool) => void;
  onClose?: () => void;
  allowImport?: boolean;
  allowExport?: boolean;
  showCloseButton?: boolean;
}

// Fallback value for LOCAL_STORAGE_LIMIT if not imported from the service
const LOCAL_STORAGE_LIMIT = 5 * 1024 * 1024; // 5MB

const LocalToolsLibraryView: React.FC<LocalToolsLibraryViewProps> = ({
  onSelectTool,
  onLoadTool,
  onClose,
  allowImport = true,
  allowExport = true,
  showCloseButton = true
}) => {
  // Local state
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTool, setSelectedTool] = useState<LocalTool | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    type: '',
    material: ''
  });
  const [saveFormData, setSaveFormData] = useState({
    name: '',
    description: '',
    type: 'endmill',
    diameter: 6,
    material: 'HSS',
    numberOfFlutes: 2,
    maxRPM: 10000,
    coolantType: 'none',
    cuttingLength: 0,
    totalLength: 0,
    shankDiameter: 0,
    notes: '',
    tags: ''
  });
  const [storageInfo, setStorageInfo] = useState(getStorageStats());
  
  // Get tools library store
  const { 
    tools, 
    loadLibrary, 
    searchTools,
    filterTools,
    deleteTool, 
    exportTool,
    addTool,
    updateTool
  } = useLocalToolsLibraryStore();
  
  // Load the library on component mount
  useEffect(() => {
    loadLibrary();
    setStorageInfo(getStorageStats());
  }, [loadLibrary]);
  
  // Filtered tools based on search query and filters
  const filteredTools = () => {
    if (searchQuery) {
      return searchTools(searchQuery);
    }
    
    if (filters.type || filters.material) {
      return filterTools(filters);
    }
    
    return tools;
  };
  
  // Handle selecting a tool
  const handleSelectTool = (tool: LocalTool) => {
    setSelectedTool(tool);
    if (onSelectTool) {
      onSelectTool(tool.id);
    }
  };
  
  // Handle loading a tool
  const handleLoadTool = (tool: LocalTool) => {
    if (onLoadTool) {
      onLoadTool(tool);
    }
    if (onClose) {
      onClose();
    }
  };
  
  // Handle saving the current tool
  const handleSaveTool = () => {
    const { 
      name, description, type, diameter, material, 
      numberOfFlutes, maxRPM, coolantType, 
      cuttingLength, totalLength, shankDiameter, notes, tags 
    } = saveFormData;
    
    const tagsList = tags.split(',').map(tag => tag.trim()).filter(Boolean);
    
    const toolData = {
      name,
      description,
      type,
      diameter: parseFloat(diameter.toString()),
      material,
      numberOfFlutes: parseInt(numberOfFlutes.toString()),
      maxRPM: parseInt(maxRPM.toString()),
      coolantType,
      cuttingLength: parseFloat(cuttingLength.toString()),
      totalLength: parseFloat(totalLength.toString()),
      shankDiameter: parseFloat(shankDiameter.toString()),
      notes,
      tags: tagsList
    };
    
    // Check if tool with this name already exists
    const existingTool = tools.find(t => t.name === name);
    
    if (existingTool) {
      updateTool(existingTool.id, toolData);
    } else {
      addTool(toolData);
    }
    
    setShowSaveModal(false);
    loadLibrary(); // Refresh the library
    setStorageInfo(getStorageStats());
  };
  
  // Handle deleting a tool
  const handleDeleteTool = () => {
    if (selectedTool) {
      deleteTool(selectedTool.id);
      setSelectedTool(null);
      setShowDeleteConfirmation(false);
      setShowDetailsModal(false);
      setStorageInfo(getStorageStats());
    }
  };
  
  // Handle exporting a tool
  const handleExportTool = () => {
    if (!selectedTool) return;
    
    const exportedTool = exportTool(selectedTool.id);
    if (!exportedTool) return;
    
    // Create a download link
    const dataStr = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(exportedTool, null, 2)
    )}`;
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute('href', dataStr);
    downloadAnchorNode.setAttribute('download', `${exportedTool.name}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };
  
  // Open save modal
  const handleOpenSaveModal = () => {
    setSaveFormData({
      name: '',
      description: '',
      type: 'endmill',
      diameter: 6,
      material: 'HSS',
      numberOfFlutes: 2,
      maxRPM: 10000,
      coolantType: 'none',
      cuttingLength: 0,
      totalLength: 0,
      shankDiameter: 0,
      notes: '',
      tags: ''
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
  
  // Handle filter change
  const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };
  
  // Clear all filters
  const clearFilters = () => {
    setFilters({ type: '', material: '' });
    setSearchQuery('');
  };
  
  // Get icon based on tool type
  const getToolIcon = (tool: LocalTool) => {
    const type = tool.type;
    
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
  
  // Get a list of all available tool types
  const getAvailableToolTypes = () => {
    const types = new Set<string>();
    tools.forEach(tool => types.add(tool.type));
    return Array.from(types);
  };
  
  // Get a list of all available materials
  const getAvailableMaterials = () => {
    const materials = new Set<string>();
    tools.forEach(tool => materials.add(tool.material));
    return Array.from(materials);
  };
  
  // Get the display name for a tool type
  const getToolTypeDisplayName = (type: string) => {
    switch (type) {
      case 'endmill': return 'End Mill';
      case 'ballendmill': return 'Ball End Mill';
      case 'drillbit': return 'Drill Bit';
      case 'chamfermill': return 'Chamfer Mill';
      case 'facemill': return 'Face Mill';
      case 'engraver': return 'Engraver';
      case 'turningTool': return 'Turning Tool';
      case 'threadingTool': return 'Threading Tool';
      case 'insertTool': return 'Insert Tool';
      case 'tslotcutter': return 'T-Slot Cutter';
      default: return type.charAt(0).toUpperCase() + type.slice(1);
    }
  };
  
  // Get an array of filtered tools
  const displayedTools = filteredTools();
  
  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Tools Library</h2>
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
      </div>
      
      {/* Search and controls */}
      <div className="flex flex-col md:flex-row gap-4 mb-4">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search size={18} className="text-gray-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            placeholder="Search tools..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        
        <div className="flex space-x-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
          >
            <Filter size={16} className="mr-2" />
            Filters
            <ChevronDown size={16} className="ml-2" />
          </button>
          
          <button
            onClick={handleOpenSaveModal}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            <Save size={16} className="mr-2" />
            Save New
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
      
      {/* Filters panel */}
      {showFilters && (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-medium text-gray-700">Filter Tools</h3>
            <button
              onClick={clearFilters}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              Clear Filters
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-1">
                Tool Type
              </label>
              <select
                id="type"
                name="type"
                value={filters.type}
                onChange={handleFilterChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All Types</option>
                {getAvailableToolTypes().map(type => (
                  <option key={type} value={type}>{getToolTypeDisplayName(type)}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label htmlFor="material" className="block text-sm font-medium text-gray-700 mb-1">
                Material
              </label>
              <select
                id="material"
                name="material"
                value={filters.material}
                onChange={handleFilterChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All Materials</option>
                {getAvailableMaterials().map(material => (
                  <option key={material} value={material}>{material}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}
      
      {/* No tools message */}
      {displayedTools.length === 0 && (
        <div className="text-center py-10 bg-gray-50 rounded-lg">
          <ToolIcon size={48} className="mx-auto text-gray-400 mb-4" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No tools found</h3>
          <p className="mt-1 text-sm text-gray-500">
            {searchQuery || filters.type || filters.material
              ? `No tools match your search or filters`
              : "Save your first tool to get started"}
          </p>
          <div className="mt-6">
            {searchQuery || filters.type || filters.material ? (
              <button
                onClick={clearFilters}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                Clear Filters
              </button>
            ) : (
              <button
                onClick={handleOpenSaveModal}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="-ml-1 mr-2 h-5 w-5" />
                Add Tool
              </button>
            )}
          </div>
        </div>
      )}
      
      {/* Tools Grid View */}
      {displayedTools.length > 0 && viewMode === 'grid' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayedTools.map((tool) => (
            <div
              key={tool.id}
              className="group border border-gray-200 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="p-6">
                <div className="flex items-center mb-4">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center mr-3">
                    <span className="text-xl">{getToolIcon(tool)}</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">{tool.name}</h3>
                    <p className="text-sm text-gray-500 capitalize">{getToolTypeDisplayName(tool.type)}</p>
                  </div>
                </div>
                
                {tool.description && (
                  <p className="mt-2 text-sm text-gray-500 line-clamp-2">
                    {tool.description}
                  </p>
                )}
                
                <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
                  <div className="flex flex-col">
                    <span className="text-gray-500">Diameter</span>
                    <span className="font-medium">{tool.diameter} mm</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-gray-500">Material</span>
                    <span className="font-medium">{tool.material}</span>
                  </div>
                  {tool.numberOfFlutes && (
                    <div className="flex flex-col">
                      <span className="text-gray-500">Flutes</span>
                      <span className="font-medium">{tool.numberOfFlutes}</span>
                    </div>
                  )}
                </div>
                
                <div className="mt-3 flex items-center text-xs text-gray-500">
                  Updated {formatDate(tool.updatedAt)}
                </div>
                
                {tool.tags && tool.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {tool.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800"
                      >
                        {tag}
                      </span>
                    ))}
                    {tool.tags.length > 3 && (
                      <span className="text-xs text-gray-500">+{tool.tags.length - 3} more</span>
                    )}
                  </div>
                )}
              </div>
              
              <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex justify-between">
                <button
                  onClick={() => handleLoadTool(tool)}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  Load
                </button>
                
                <div className="flex space-x-2">
                  <button
                    onClick={() => {
                      setSelectedTool(tool);
                      setShowDetailsModal(true);
                    }}
                    className="p-1 text-gray-500 hover:bg-gray-100 rounded-full"
                    title="Details"
                  >
                    <Info size={16} />
                  </button>
                  
                  {allowExport && (
                    <button
                      onClick={() => {
                        setSelectedTool(tool);
                        handleExportTool();
                      }}
                      className="p-1 text-gray-500 hover:bg-gray-100 rounded-full"
                      title="Export"
                    >
                      <Download size={16} />
                    </button>
                  )}
                  
                  <button
                    onClick={() => {
                      setSelectedTool(tool);
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
      
      {/* Tools List View */}
      {displayedTools.length > 0 && viewMode === 'list' && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Specs
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Updated
                </th>
                <th scope="col" className="relative px-6 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {displayedTools.map((tool) => (
                <tr 
                  key={tool.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => handleSelectTool(tool)}
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                        <span className="text-xl">{getToolIcon(tool)}</span>
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">
                          {tool.name}
                        </div>
                        <div className="text-sm text-gray-500 capitalize">
                          {getToolTypeDisplayName(tool.type)}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      Ø{tool.diameter} mm • {tool.material}
                    </div>
                    <div className="text-sm text-gray-500">
                      {tool.numberOfFlutes} {tool.numberOfFlutes === 1 ? 'flute' : 'flutes'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(tool.updatedAt)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end space-x-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleLoadTool(tool);
                        }}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        Load
                      </button>
                      
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTool(tool);
                          setShowDetailsModal(true);
                        }}
                        className="p-1 text-gray-500 hover:bg-gray-100 rounded-full"
                        title="Details"
                      >
                        <Info size={16} />
                      </button>
                      
                      {allowExport && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTool(tool);
                            handleExportTool();
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
                          setSelectedTool(tool);
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
      
      {/* Save Tool Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-gray-900 bg-opacity-50 z-50">
          <div className="bg-white rounded-lg max-w-md w-full mx-4 overflow-hidden shadow-xl">
            <div className="px-6 py-4 bg-blue-600">
              <h3 className="text-lg font-medium text-white">Save Tool to Library</h3>
            </div>
            <div className="p-6 max-h-[70vh] overflow-y-auto">
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tool Name
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  value={saveFormData.name}
                  onChange={(e) => setSaveFormData({ ...saveFormData, name: e.target.value })}
                  placeholder="Enter a name for this tool"
                  required
                />
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tool Type
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  value={saveFormData.type}
                  onChange={(e) => setSaveFormData({ ...saveFormData, type: e.target.value })}
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Diameter (mm)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  value={saveFormData.diameter}
                  onChange={(e) => setSaveFormData({ ...saveFormData, diameter: parseFloat(e.target.value) })}
                  required
                />
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Material
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  value={saveFormData.material}
                  onChange={(e) => setSaveFormData({ ...saveFormData, material: e.target.value })}
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
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Number of Flutes
                </label>
                <input
                  type="number"
                  min="1"
                  max="12"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  value={saveFormData.numberOfFlutes}
                  onChange={(e) => setSaveFormData({ ...saveFormData, numberOfFlutes: parseInt(e.target.value) })}
                />
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Max RPM
                </label>
                <input
                  type="number"
                  min="1000"
                  step="1000"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  value={saveFormData.maxRPM}
                  onChange={(e) => setSaveFormData({ ...saveFormData, maxRPM: parseInt(e.target.value) })}
                />
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Coolant Type
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  value={saveFormData.coolantType}
                  onChange={(e) => setSaveFormData({ ...saveFormData, coolantType: e.target.value })}
                >
                  <option value="none">No Coolant</option>
                  <option value="flood">Flood Coolant</option>
                  <option value="mist">Mist Coolant</option>
                  <option value="air">Air Blast</option>
                  <option value="through">Through Tool</option>
                </select>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cutting Length (mm)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    value={saveFormData.cuttingLength}
                    onChange={(e) => setSaveFormData({ ...saveFormData, cuttingLength: parseFloat(e.target.value) })}
                  />
                </div>
                
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Total Length (mm)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    value={saveFormData.totalLength}
                    onChange={(e) => setSaveFormData({ ...saveFormData, totalLength: parseFloat(e.target.value) })}
                  />
                </div>
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Shank Diameter (mm)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  value={saveFormData.shankDiameter}
                  onChange={(e) => setSaveFormData({ ...saveFormData, shankDiameter: parseFloat(e.target.value) })}
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
                  Notes (optional)
                </label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  value={saveFormData.notes}
                  onChange={(e) => setSaveFormData({ ...saveFormData, notes: e.target.value })}
                  placeholder="Additional notes about this tool"
                  rows={2}
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
                  placeholder="e.g. cutting, roughing, steel"
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
                  onClick={handleSaveTool}
                  disabled={!saveFormData.name}
                >
                  Save Tool
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Tool Details Modal */}
      {showDetailsModal && selectedTool && (
        <div className="fixed inset-0 flex items-center justify-center bg-gray-900 bg-opacity-50 z-50">
          <div className="bg-white rounded-lg max-w-lg w-full mx-4 overflow-hidden shadow-xl">
            <div className="px-6 py-4 flex justify-between items-center bg-gray-100">
              <h3 className="text-lg font-medium text-gray-900">Tool Details</h3>
              <button
                className="text-gray-500 hover:text-gray-700"
                onClick={() => setShowDetailsModal(false)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 max-h-[70vh] overflow-y-auto">
              <div className="flex flex-col md:flex-row gap-6">
                <div className="w-full md:w-1/3 flex-shrink-0">
                  <div className="h-40 bg-blue-100 rounded-md flex items-center justify-center mb-4">
                    <span className="text-5xl">{getToolIcon(selectedTool)}</span>
                  </div>
                  
                  <div className="flex flex-col space-y-2">
                    <button
                      onClick={() => handleLoadTool(selectedTool)}
                      className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center justify-center"
                    >
                      <Upload size={16} className="mr-2" />
                      Load Tool
                    </button>
                    
                    {allowExport && (
                      <button
                        onClick={handleExportTool}
                        className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 flex items-center justify-center"
                      >
                        <Download size={16} className="mr-2" />
                        Export
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
                  <h2 className="text-xl font-bold text-gray-900 mb-1">{selectedTool.name}</h2>
                  <p className="text-sm text-gray-500 capitalize mb-4">{getToolTypeDisplayName(selectedTool.type)}</p>
                  
                  {selectedTool.description && (
                    <p className="text-gray-600 mb-4">{selectedTool.description}</p>
                  )}
                  
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Specifications</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col">
                        <span className="text-gray-500">Diameter</span>
                        <span className="font-medium">{selectedTool.diameter} mm</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-gray-500">Material</span>
                        <span className="font-medium">{selectedTool.material}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-gray-500">Flutes</span>
                        <span className="font-medium">{selectedTool.numberOfFlutes}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-gray-500">Max RPM</span>
                        <span className="font-medium">{selectedTool.maxRPM}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-gray-500">Coolant</span>
                        <span className="font-medium capitalize">{selectedTool.coolantType}</span>
                      </div>
                      {selectedTool.cuttingLength && (
                        <div className="flex flex-col">
                          <span className="text-gray-500">Cutting Length</span>
                          <span className="font-medium">{selectedTool.cuttingLength} mm</span>
                        </div>
                      )}
                      {selectedTool.totalLength && selectedTool.totalLength > 0 && (
                        <div className="flex flex-col">
                          <span className="text-gray-500">Total Length</span>
                          <span className="font-medium">{selectedTool.totalLength} mm</span>
                        </div>
                      )}
                      {selectedTool.shankDiameter && selectedTool.shankDiameter > 0 && (
                        <div className="flex flex-col">
                          <span className="text-gray-500">Shank Diameter</span>
                          <span className="font-medium">{selectedTool.shankDiameter} mm</span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {selectedTool.notes && (
                    <div className="mb-4">
                      <h4 className="text-sm font-medium text-gray-700 mb-1">Notes</h4>
                      <p className="text-gray-600">{selectedTool.notes}</p>
                    </div>
                  )}
                  
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-1">Created</h4>
                    <p className="text-gray-600">{formatDate(selectedTool.createdAt)}</p>
                  </div>
                  
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-1">Last Modified</h4>
                    <p className="text-gray-600">{formatDate(selectedTool.updatedAt)}</p>
                  </div>
                  
                  {selectedTool.tags && selectedTool.tags.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-1">Tags</h4>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {selectedTool.tags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800"
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
      
      {/* Delete Confirmation Modal */}
      {showDeleteConfirmation && selectedTool && (
        <div className="fixed inset-0 flex items-center justify-center bg-gray-900 bg-opacity-50 z-50">
          <div className="bg-white rounded-lg max-w-md w-full mx-4 overflow-hidden shadow-xl">
            <div className="px-6 py-4 bg-red-600">
              <h3 className="text-lg font-medium text-white">Confirm Deletion</h3>
            </div>
            <div className="p-6">
              <p className="text-gray-600 mb-4">
                Sei sicuro di voler eliminare lo strumento &quot;{selectedTool.name}&quot;? Questa azione non può essere annullata.
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
                  onClick={handleDeleteTool}
                >
                  Delete Tool
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LocalToolsLibraryView;