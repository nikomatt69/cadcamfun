// src/components/library/LocalComponentsLibraryView.tsx
import React, { useState, useEffect } from 'react';
import { useLocalComponentsLibraryStore, LocalComponent } from '@/src/store/localComponentsLibraryStore';
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
  Package, 
  Disc, 
  Box, 
  Layers
} from 'react-feather';

interface LocalComponentsLibraryViewProps {
  onSelectComponent?: (componentId: string) => void;
  onLoadComponent?: (component: LocalComponent) => void;
  onClose?: () => void;
  allowImport?: boolean;
  allowExport?: boolean;
  showCloseButton?: boolean;
}

// Fallback value for LOCAL_STORAGE_LIMIT if not imported from the service
const LOCAL_STORAGE_LIMIT = 5 * 1024 * 1024; // 5MB

const LocalComponentsLibraryView: React.FC<LocalComponentsLibraryViewProps> = ({
  onSelectComponent,
  onLoadComponent,
  onClose,
  allowImport = true,
  allowExport = true,
  showCloseButton = true
}) => {
  // Local state
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedComponent, setSelectedComponent] = useState<LocalComponent | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [saveFormData, setSaveFormData] = useState({
    name: '',
    description: '',
    type: '',
    tags: ''
  });
  const [storageInfo, setStorageInfo] = useState(getStorageStats());
  
  // Get components library store
  const { 
    components, 
    loadLibrary, 
    searchComponents, 
    deleteComponent, 
    exportComponent,
    addComponent,
    updateComponent
  } = useLocalComponentsLibraryStore();
  
  // Load the library on component mount
  useEffect(() => {
    loadLibrary();
    setStorageInfo(getStorageStats());
  }, [loadLibrary]);
  
  // Filtered components based on search query
  const filteredComponents = searchQuery 
    ? searchComponents(searchQuery)
    : components;
  
  // Handle selecting a component
  const handleSelectComponent = (component: LocalComponent) => {
    setSelectedComponent(component);
    if (onSelectComponent) {
      onSelectComponent(component.id);
    }
  };
  
  // Handle loading a component
  const handleLoadComponent = (component: LocalComponent) => {
    if (onLoadComponent) {
      onLoadComponent(component);
    }
    if (onClose) {
      onClose();
    }
  };
  
  // Handle saving the current component
  const handleSaveComponent = () => {
    const { name, description, type, tags } = saveFormData;
    const tagsList = tags.split(',').map(tag => tag.trim()).filter(Boolean);
    
    const componentData = {
      name,
      description,
      type,
      tags: tagsList,
      data: {
        type,
        version: "1.0",
        properties: {},
        specifications: {}
      }
    };
    
    // Check if component with this name already exists
    const existingComponent = components.find(c => c.name === name);
    
    if (existingComponent) {
      updateComponent(existingComponent.id, componentData);
    } else {
      addComponent(componentData);
    }
    
    setShowSaveModal(false);
    loadLibrary(); // Refresh the library
    setStorageInfo(getStorageStats());
  };
  
  // Handle deleting a component
  const handleDeleteComponent = () => {
    if (selectedComponent) {
      deleteComponent(selectedComponent.id);
      setSelectedComponent(null);
      setShowDeleteConfirmation(false);
      setShowDetailsModal(false);
      setStorageInfo(getStorageStats());
    }
  };
  
  // Handle exporting a component
  const handleExportComponent = () => {
    if (!selectedComponent) return;
    
    const exportedComponent = exportComponent(selectedComponent.id);
    if (!exportedComponent) return;
    
    // Create a download link
    const dataStr = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(exportedComponent, null, 2)
    )}`;
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute('href', dataStr);
    downloadAnchorNode.setAttribute('download', `${exportedComponent.name}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };
  
  // Open save modal
  const handleOpenSaveModal = () => {
    setSaveFormData({
      name: '',
      description: '',
      type: '',
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
  
  // Get icon based on component type
  const getComponentIcon = (component: LocalComponent) => {
    const type = component.type || '';
    
    if (type === 'mechanical') return <Box size={36} className="text-blue-500" />;
    if (type === 'electronic') return <Disc size={36} className="text-green-500" />;
    if (type === 'structural') return <Layers size={36} className="text-orange-500" />;
    if (type === 'geometric') return <Box size={36} className="text-orange-500" />;
    if (type === 'manufacturing') return <Box size={36} className="text-orange-500" />;
    if (type === 'custom') return <Box size={36} className="text-orange-500" />;
    if (type === 'composite') return <Box size={36} className="text-orange-500" />;
    
    return <Package size={36} className="text-gray-500" />;
  };
  
  return (
    <div className="bg-white flex flex-col rounded-lg shadow-lg p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Components Library</h2>
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
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search size={18} className="text-gray-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            placeholder="Search components..."
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
      
      {/* No components message */}
      {filteredComponents.length === 0 && (
        <div className="text-center py-10 bg-gray-50 rounded-lg">
          <Package size={48} className="mx-auto text-gray-400 mb-4" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No components found</h3>
          <p className="mt-1 text-sm text-gray-500">
            {searchQuery
              ? `No components match "${searchQuery}"`
              : "Save your first component to get started"}
          </p>
          <div className="mt-6">
            <button
              onClick={handleOpenSaveModal}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="-ml-1 mr-2 h-5 w-5" />
              Add Component
            </button>
          </div>
        </div>
      )}
      
      {/* Components Grid View */}
      {filteredComponents.length > 0 && viewMode === 'grid' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredComponents.map((component) => (
            <div
              key={component.id}
              className="group border border-gray-200 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow"
            >
              <div 
                className="h-40 bg-gray-100 relative cursor-pointer flex items-center justify-center"
                onClick={() => handleSelectComponent(component)}
              >
                {component.thumbnail ? (
                  <img
                    src={component.thumbnail}
                    alt={component.name}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="flex items-center justify-center">
                    {getComponentIcon(component)}
                  </div>
                )}
                
                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-opacity"></div>
              </div>
              
              <div className="p-4">
                <h3 className="text-lg font-medium text-gray-900 truncate">
                  {component.name}
                </h3>
                
                <div className="flex items-center mt-1">
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                    {component.type}
                  </span>
                </div>
                
                {component.description && (
                  <p className="mt-2 text-sm text-gray-500 line-clamp-2">
                    {component.description}
                  </p>
                )}
                
                <div className="mt-2 flex items-center text-xs text-gray-500">
                  Updated {formatDate(component.updatedAt)}
                </div>
                
                {component.tags && component.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {component.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800"
                      >
                        {tag}
                      </span>
                    ))}
                    {component.tags.length > 3 && (
                      <span className="text-xs text-gray-500">+{component.tags.length - 3} more</span>
                    )}
                  </div>
                )}
              </div>
              
              <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex justify-between">
                <button
                  onClick={() => handleLoadComponent(component)}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  Load
                </button>
                
                <div className="flex space-x-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedComponent(component);
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
                        setSelectedComponent(component);
                        handleExportComponent();
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
                      setSelectedComponent(component);
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
      
      {/* Components List View */}
      {filteredComponents.length > 0 && viewMode === 'list' && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
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
                  Updated
                </th>
                <th scope="col" className="relative px-6 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredComponents.map((component) => (
                <tr 
                  key={component.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => handleSelectComponent(component)}
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10 bg-gray-100 rounded-md flex items-center justify-center">
                        {getComponentIcon(component)}
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">
                          {component.name}
                        </div>
                        {component.description && (
                          <div className="text-sm text-gray-500 truncate max-w-xs">
                            {component.description}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                      {component.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(component.updatedAt)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end space-x-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleLoadComponent(component);
                        }}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        Load
                      </button>
                      
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedComponent(component);
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
                            setSelectedComponent(component);
                            handleExportComponent();
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
                          setSelectedComponent(component);
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
      
      {/* Save Component Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-gray-900 bg-opacity-50 z-50">
          <div className="bg-white rounded-lg max-w-md w-full mx-4 overflow-hidden shadow-xl">
            <div className="px-6 py-4 bg-blue-600">
              <h3 className="text-lg font-medium text-white">Save Component to Library</h3>
            </div>
            <div className="p-6">
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Component Name
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  value={saveFormData.name}
                  onChange={(e) => setSaveFormData({ ...saveFormData, name: e.target.value })}
                  placeholder="Enter a name for this component"
                  required
                />
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Component Type
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  value={saveFormData.type}
                  onChange={(e) => setSaveFormData({ ...saveFormData, type: e.target.value })}
                  required
                >
                  <option value="mechanical">Mechanical</option>
                  <option value="electronic">Electronic</option>
                  <option value="geometric">Geometric</option>
                  <option value="composite">Composite</option>
                  <option value="custom">Custom</option>
                  <option value="manufacturing">Electronic</option>
                  <option value="structural">Structural</option>
                  <option value="fixture">Fixture</option>
                  <option value="enclosure">Enclosure</option>
                  <option value="tool">Tool</option>
                  <option value="other">Other</option>
                </select>
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
                  placeholder="e.g. motor, bracket, electronics"
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
                  onClick={handleSaveComponent}
                  disabled={!saveFormData.name}
                >
                  Save Component
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Component Details Modal */}
      {showDetailsModal && selectedComponent && (
        <div className="fixed inset-0 flex items-center justify-center bg-gray-900 bg-opacity-50 z-50">
          <div className="bg-white rounded-lg max-w-lg w-full mx-4 overflow-hidden shadow-xl">
            <div className="px-6 py-4 flex justify-between items-center bg-gray-100">
              <h3 className="text-lg font-medium text-gray-900">Component Details</h3>
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
                    {selectedComponent.thumbnail ? (
                      <img
                        src={selectedComponent.thumbnail}
                        alt={selectedComponent.name}
                        className="w-full h-full object-contain rounded-md"
                      />
                    ) : (
                      <div className="flex items-center justify-center">
                        {getComponentIcon(selectedComponent)}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex flex-col space-y-2">
                    <button
                      onClick={() => handleLoadComponent(selectedComponent)}
                      className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center justify-center"
                    >
                      <Upload size={16} className="mr-2" />
                      Load Component
                    </button>
                    
                    {allowExport && (
                      <button
                        onClick={handleExportComponent}
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
                  <h2 className="text-xl font-bold text-gray-900 mb-2">{selectedComponent.name}</h2>
                  
                  <div className="mb-2 flex items-center">
                    <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                      {selectedComponent.type}
                    </span>
                  </div>
                  
                  {selectedComponent.description && (
                    <p className="text-gray-600 mb-4">{selectedComponent.description}</p>
                  )}
                  
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-1">Created</h4>
                    <p className="text-gray-600">{formatDate(selectedComponent.createdAt)}</p>
                  </div>
                  
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-1">Last Modified</h4>
                    <p className="text-gray-600">{formatDate(selectedComponent.updatedAt)}</p>
                  </div>
                  
                  {selectedComponent.meta?.specifications && Object.keys(selectedComponent.meta.specifications).length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-sm font-medium text-gray-700 mb-1">Specifications</h4>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {Object.entries(selectedComponent.meta.specifications).map(([key, value]) => (
                          <div key={key} className="flex flex-col">
                            <span className="text-gray-500 capitalize">{key}</span>
                            <span className="font-medium">{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {selectedComponent.tags && selectedComponent.tags.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-1">Tags</h4>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {selectedComponent.tags.map((tag) => (
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
      {showDeleteConfirmation && selectedComponent && (
        <div className="fixed inset-0 flex items-center justify-center bg-gray-900 bg-opacity-50 z-50">
          <div className="bg-white rounded-lg max-w-md w-full mx-4 overflow-hidden shadow-xl">
            <div className="px-6 py-4 bg-red-600">
              <h3 className="text-lg font-medium text-white">Confirm Deletion</h3>
            </div>
            <div className="p-6">
              <p className="text-gray-600 mb-4">
                Sei sicuro di voler eliminare il componente &quot;{selectedComponent.name}&quot;? Questa azione non può essere annullata.
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
                  onClick={handleDeleteComponent}
                >
                  Delete Component
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LocalComponentsLibraryView;