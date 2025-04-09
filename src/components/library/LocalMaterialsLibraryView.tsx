// src/components/library/LocalMaterialsLibraryView.tsx
import React, { useState, useEffect } from 'react';
import { useLocalMaterialsLibraryStore, LocalMaterial } from '@/src/store/localMaterialsLibraryStore';
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
  Layers
} from 'react-feather';

interface LocalMaterialsLibraryViewProps {
  onSelectMaterial?: (materialId: string) => void;
  onLoadMaterial?: (material: LocalMaterial) => void;
  onClose?: () => void;
  allowImport?: boolean;
  allowExport?: boolean;
  showCloseButton?: boolean;
}

// Fallback value for LOCAL_STORAGE_LIMIT if not imported from the service
const LOCAL_STORAGE_LIMIT = 5 * 1024 * 1024; // 5MB

const LocalMaterialsLibraryView: React.FC<LocalMaterialsLibraryViewProps> = ({
  onSelectMaterial,
  onLoadMaterial,
  onClose,
  allowImport = true,
  allowExport = true,
  showCloseButton = true
}) => {
  // Local state
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMaterial, setSelectedMaterial] = useState<LocalMaterial | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [saveFormData, setSaveFormData] = useState({
    name: '',
    description: '',
    density: 0,
    hardness: 0,
    color: '#cccccc',
    tags: ''
  });
  const [storageInfo, setStorageInfo] = useState(getStorageStats());
  
  // Get materials library store
  const { 
    materials, 
    loadLibrary, 
    searchMaterials, 
    deleteMaterial, 
    exportMaterial,
    addMaterial,
    updateMaterial
  } = useLocalMaterialsLibraryStore();
  
  // Load the library on component mount
  useEffect(() => {
    loadLibrary();
    setStorageInfo(getStorageStats());
  }, [loadLibrary]);
  
  // Filtered materials based on search query
  const filteredMaterials = searchQuery 
    ? searchMaterials(searchQuery)
    : materials;
  
  // Handle selecting a material
  const handleSelectMaterial = (material: LocalMaterial) => {
    setSelectedMaterial(material);
    if (onSelectMaterial) {
      onSelectMaterial(material.id);
    }
  };
  
  // Handle loading a material
  const handleLoadMaterial = (material: LocalMaterial) => {
    if (onLoadMaterial) {
      onLoadMaterial(material);
    }
    if (onClose) {
      onClose();
    }
  };
  
  // Handle saving the current material
  const handleSaveMaterial = () => {
    const { name, description, density, hardness, color, tags } = saveFormData;
    const tagsList = tags.split(',').map(tag => tag.trim()).filter(Boolean);
    
    const materialData = {
      name,
      description,
      properties: {
        density: parseFloat(density.toString()),
        hardness: parseFloat(hardness.toString()),
        color
      },
      tags: tagsList
    };
    
    // Check if material with this name already exists
    const existingMaterial = materials.find(m => m.name === name);
    
    if (existingMaterial) {
      updateMaterial(existingMaterial.id, materialData);
    } else {
      addMaterial(materialData);
    }
    
    setShowSaveModal(false);
    loadLibrary(); // Refresh the library
    setStorageInfo(getStorageStats());
  };
  
  // Handle deleting a material
  const handleDeleteMaterial = () => {
    if (selectedMaterial) {
      deleteMaterial(selectedMaterial.id);
      setSelectedMaterial(null);
      setShowDeleteConfirmation(false);
      setShowDetailsModal(false);
      setStorageInfo(getStorageStats());
    }
  };
  
  // Handle exporting a material
  const handleExportMaterial = () => {
    if (!selectedMaterial) return;
    
    const exportedMaterial = exportMaterial(selectedMaterial.id);
    if (!exportedMaterial) return;
    
    // Create a download link
    const dataStr = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(exportedMaterial, null, 2)
    )}`;
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute('href', dataStr);
    downloadAnchorNode.setAttribute('download', `${exportedMaterial.name}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };
  
  // Open save modal
  const handleOpenSaveModal = () => {
    setSaveFormData({
      name: '',
      description: '',
      density: 0,
      hardness: 0,
      color: '#cccccc',
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
  
  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Materials Library</h2>
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
            placeholder="Search materials..."
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
      
      {/* No materials message */}
      {filteredMaterials.length === 0 && (
        <div className="text-center py-10 bg-gray-50 rounded-lg">
          <Layers size={48} className="mx-auto text-gray-400 mb-4" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No materials found</h3>
          <p className="mt-1 text-sm text-gray-500">
            {searchQuery
              ? `No materials match "${searchQuery}"`
              : "Save your first material to get started"}
          </p>
          <div className="mt-6">
            <button
              onClick={handleOpenSaveModal}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="-ml-1 mr-2 h-5 w-5" />
              Add Material
            </button>
          </div>
        </div>
      )}
      
      {/* Materials Grid View */}
      {filteredMaterials.length > 0 && viewMode === 'grid' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredMaterials.map((material) => (
            <div
              key={material.id}
              className="group border border-gray-200 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="p-6">
                <div className="flex items-center mb-4">
                  <div 
                    className="w-10 h-10 rounded-full mr-3 border border-gray-200"
                    style={{ backgroundColor: material.properties.color }}
                  ></div>
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">{material.name}</h3>
                  </div>
                </div>
                
                {material.description && (
                  <p className="mt-2 text-sm text-gray-500 line-clamp-2">
                    {material.description}
                  </p>
                )}
                
                <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
                  <div className="flex flex-col">
                    <span className="text-gray-500">Density</span>
                    <span className="font-medium">{material.properties.density} g/cm³</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-gray-500">Hardness</span>
                    <span className="font-medium">{material.properties.hardness} HRC</span>
                  </div>
                </div>
                
                <div className="mt-2 flex items-center text-xs text-gray-500">
                  Updated {formatDate(material.updatedAt)}
                </div>
                
                {material.tags && material.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {material.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800"
                      >
                        {tag}
                      </span>
                    ))}
                    {material.tags.length > 3 && (
                      <span className="text-xs text-gray-500">+{material.tags.length - 3} more</span>
                    )}
                  </div>
                )}
              </div>
              
              <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex justify-between">
                <button
                  onClick={() => handleLoadMaterial(material)}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  Load
                </button>
                
                <div className="flex space-x-2">
                  <button
                    onClick={() => {
                      setSelectedMaterial(material);
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
                        setSelectedMaterial(material);
                        handleExportMaterial();
                      }}
                      className="p-1 text-gray-500 hover:bg-gray-100 rounded-full"
                      title="Export"
                    >
                      <Download size={16} />
                    </button>
                  )}
                  
                  <button
                    onClick={() => {
                      setSelectedMaterial(material);
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
      
      {/* Materials List View */}
      {filteredMaterials.length > 0 && viewMode === 'list' && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Properties
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
              {filteredMaterials.map((material) => (
                <tr 
                  key={material.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => handleSelectMaterial(material)}
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div 
                        className="flex-shrink-0 h-10 w-10 rounded-full border border-gray-200"
                        style={{ backgroundColor: material.properties.color }}
                      ></div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">
                          {material.name}
                        </div>
                        {material.description && (
                          <div className="text-sm text-gray-500 truncate max-w-xs">
                            {material.description}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      Density: {material.properties.density} g/cm³
                    </div>
                    <div className="text-sm text-gray-900">
                      Hardness: {material.properties.hardness} HRC
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(material.updatedAt)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end space-x-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleLoadMaterial(material);
                        }}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        Load
                      </button>
                      
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedMaterial(material);
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
                            setSelectedMaterial(material);
                            handleExportMaterial();
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
                          setSelectedMaterial(material);
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
      
      {/* Save Material Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-gray-900 bg-opacity-50 z-50">
          <div className="bg-white rounded-lg max-w-md w-full mx-4 overflow-hidden shadow-xl">
            <div className="px-6 py-4 bg-blue-600">
              <h3 className="text-lg font-medium text-white">Save Material to Library</h3>
            </div>
            <div className="p-6">
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Material Name
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  value={saveFormData.name}
                  onChange={(e) => setSaveFormData({ ...saveFormData, name: e.target.value })}
                  placeholder="Enter a name for this material"
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
                  Color
                </label>
                <input
                  type="color"
                  className="w-full h-10 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  value={saveFormData.color}
                  onChange={(e) => setSaveFormData({ ...saveFormData, color: e.target.value })}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Density (g/cm³)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    value={saveFormData.density}
                    onChange={(e) => setSaveFormData({ ...saveFormData, density: parseFloat(e.target.value) })}
                    required
                  />
                </div>
                
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Hardness (HRC)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    value={saveFormData.hardness}
                    onChange={(e) => setSaveFormData({ ...saveFormData, hardness: parseFloat(e.target.value) })}
                    required
                  />
                </div>
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
                  placeholder="e.g. metal, aluminum, high-strength"
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
                  onClick={handleSaveMaterial}
                  disabled={!saveFormData.name}
                >
                  Save Material
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Material Details Modal */}
      {showDetailsModal && selectedMaterial && (
        <div className="fixed inset-0 flex items-center justify-center bg-gray-900 bg-opacity-50 z-50">
          <div className="bg-white rounded-lg max-w-lg w-full mx-4 overflow-hidden shadow-xl">
            <div className="px-6 py-4 flex justify-between items-center bg-gray-100">
              <h3 className="text-lg font-medium text-gray-900">Material Details</h3>
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
                  <div 
                    className="h-40 rounded-md mb-4 border border-gray-200"
                    style={{ backgroundColor: selectedMaterial.properties.color }}
                  ></div>
                  
                  <div className="flex flex-col space-y-2">
                    <button
                      onClick={() => handleLoadMaterial(selectedMaterial)}
                      className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center justify-center"
                    >
                      <Upload size={16} className="mr-2" />
                      Load Material
                    </button>
                    
                    {allowExport && (
                      <button
                        onClick={handleExportMaterial}
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
                  <h2 className="text-xl font-bold text-gray-900 mb-4">{selectedMaterial.name}</h2>
                  
                  {selectedMaterial.description && (
                    <p className="text-gray-600 mb-4">{selectedMaterial.description}</p>
                  )}
                  
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Properties</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col">
                        <span className="text-gray-500">Density</span>
                        <span className="font-medium">{selectedMaterial.properties.density} g/cm³</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-gray-500">Hardness</span>
                        <span className="font-medium">{selectedMaterial.properties.hardness} HRC</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-gray-500">Color</span>
                        <div className="flex items-center">
                          <div 
                            className="w-5 h-5 rounded-full mr-2"
                            style={{ backgroundColor: selectedMaterial.properties.color }}
                          ></div>
                          <span>{selectedMaterial.properties.color}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-1">Created</h4>
                    <p className="text-gray-600">{formatDate(selectedMaterial.createdAt)}</p>
                  </div>
                  
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-1">Last Modified</h4>
                    <p className="text-gray-600">{formatDate(selectedMaterial.updatedAt)}</p>
                  </div>
                  
                  {selectedMaterial.tags && selectedMaterial.tags.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-1">Tags</h4>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {selectedMaterial.tags.map((tag) => (
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
      {showDeleteConfirmation && selectedMaterial && (
        <div className="fixed inset-0 flex items-center justify-center bg-gray-900 bg-opacity-50 z-50">
          <div className="bg-white rounded-lg max-w-md w-full mx-4 overflow-hidden shadow-xl">
            <div className="px-6 py-4 bg-red-600">
              <h3 className="text-lg font-medium text-white">Confirm Deletion</h3>
            </div>
            <div className="p-6">
              <p className="text-gray-600 mb-4">
                Are you sure you want to delete the material &quot;{selectedMaterial.name}&quot;? This action cannot be undone.
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
                  onClick={handleDeleteMaterial}
                >
                  Delete Material
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LocalMaterialsLibraryView;