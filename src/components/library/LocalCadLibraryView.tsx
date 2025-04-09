// src/components/library/LocalCadLibraryView.tsx
import React, { useState, useEffect } from 'react';
import { useLocalCadLibraryStore, LocalCadDrawing } from '@/src/store/localCadLibraryStore';
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
  X 
} from 'react-feather';

interface LocalCadLibraryViewProps {
  onSelectDrawing?: (drawingId: string) => void;
  onClose?: () => void;
  allowImport?: boolean;
  allowExport?: boolean;
  showCloseButton?: boolean;
}

const LocalCadLibraryView: React.FC<LocalCadLibraryViewProps> = ({
  onSelectDrawing,
  onClose,
  allowImport = true,
  allowExport = true,
  showCloseButton = true
}) => {
  // Local state
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDrawing, setSelectedDrawing] = useState<LocalCadDrawing | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [saveFormData, setSaveFormData] = useState({
    name: '',
    description: '',
    tags: ''
  });
  const [storageInfo, setStorageInfo] = useState(getStorageStats());
  
  // Get CAD library store and local library hook
  const { 
    drawings, 
    loadLibrary, 
    searchDrawings, 
    deleteDrawing, 
    exportDrawing 
  } = useLocalCadLibraryStore();
  
  const { 
    saveCadDrawing, 
    loadCadDrawing, 
    getCurrentCadDrawingData,
    isLoading, 
    error, 
    clearError 
  } = useLocalLibrary();
  
  // Load the library on component mount
  useEffect(() => {
    loadLibrary();
    setStorageInfo(getStorageStats());
  }, [loadLibrary]);
  
  // Filtered drawings based on search query
  const filteredDrawings = searchQuery 
    ? searchDrawings(searchQuery)
    : drawings;
  
  // Handle selecting a drawing
  const handleSelectDrawing = (drawing: LocalCadDrawing) => {
    setSelectedDrawing(drawing);
    if (onSelectDrawing) {
      onSelectDrawing(drawing.id);
    }
  };
  
  // Handle loading a drawing
  const handleLoadDrawing = (drawing: LocalCadDrawing) => {
    loadCadDrawing(drawing.id);
    if (onClose) {
      onClose();
    }
  };
  
  // Handle saving the current drawing
  const handleSaveDrawing = () => {
    const { name, description, tags } = saveFormData;
    const tagsList = tags.split(',').map(tag => tag.trim()).filter(Boolean);
    
    saveCadDrawing(name, description, tagsList);
    setShowSaveModal(false);
    loadLibrary(); // Refresh the library
    setStorageInfo(getStorageStats());
  };
  
  // Handle deleting a drawing
  const handleDeleteDrawing = () => {
    if (selectedDrawing) {
      deleteDrawing(selectedDrawing.id);
      setSelectedDrawing(null);
      setShowDeleteConfirmation(false);
      setShowDetailsModal(false);
      setStorageInfo(getStorageStats());
    }
  };
  
  // Handle exporting a drawing
  const handleExportDrawing = () => {
    if (!selectedDrawing) return;
    
    const exportedDrawing = exportDrawing(selectedDrawing.id);
    if (!exportedDrawing) return;
    
    // Create a download link
    const dataStr = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(exportedDrawing, null, 2)
    )}`;
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute('href', dataStr);
    downloadAnchorNode.setAttribute('download', `${exportedDrawing.name}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };
  
  // Open save modal with current drawing data
  const handleOpenSaveModal = () => {
    const currentDrawing = getCurrentCadDrawingData();
    setSaveFormData({
      name: currentDrawing.name,
      description: currentDrawing.description || '',
      tags: currentDrawing.tags?.join(', ') || ''
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
        <h2 className="text-2xl font-bold text-gray-900">CAD Drawings Library</h2>
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
          <span>CAD Library: {(storageInfo.libraryStats.cad / 1024 / 1024).toFixed(2)} MB</span>
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
            placeholder="Search drawings..."
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
      
      {/* No drawings message */}
      {!isLoading && filteredDrawings.length === 0 && (
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
          <h3 className="mt-2 text-sm font-medium text-gray-900">No drawings found</h3>
          <p className="mt-1 text-sm text-gray-500">
            {searchQuery
              ? `No drawings match "${searchQuery}"`
              : "Save your first drawing to get started"}
          </p>
          <div className="mt-6">
            <button
              onClick={handleOpenSaveModal}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="-ml-1 mr-2 h-5 w-5" />
              Save Current Drawing
            </button>
          </div>
        </div>
      )}
      
      {/* Drawings list */}
      {!isLoading && filteredDrawings.length > 0 && (
        <>
          {viewMode === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredDrawings.map((drawing) => (
                <div
                  key={drawing.id}
                  className="group border border-gray-200 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                >
                  <div 
                    className="h-40 bg-gray-100 relative cursor-pointer"
                    onClick={() => handleSelectDrawing(drawing)}
                  >
                    {drawing.thumbnail ? (
                      <img
                        src={drawing.thumbnail}
                        alt={drawing.name}
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
                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                      </div>
                    )}
                    
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-opacity"></div>
                  </div>
                  
                  <div className="p-4">
                    <h3 className="text-lg font-medium text-gray-900 truncate">
                      {drawing.name}
                    </h3>
                    
                    {drawing.description && (
                      <p className="mt-1 text-sm text-gray-500 line-clamp-2">
                        {drawing.description}
                      </p>
                    )}
                    
                    <div className="mt-2 flex items-center text-xs text-gray-500">
                      <Clock size={14} className="mr-1" />
                      {formatDate(drawing.updatedAt)}
                    </div>
                    
                    {drawing.tags && drawing.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {drawing.tags.map((tag) => (
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
                      onClick={() => handleLoadDrawing(drawing)}
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      Load
                    </button>
                    
                    <div className="flex space-x-2">
                      <button
                        onClick={() => {
                          setSelectedDrawing(drawing);
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
                            setSelectedDrawing(drawing);
                            handleExportDrawing();
                          }}
                          className="p-1 text-gray-500 hover:bg-gray-100 rounded-full"
                          title="Export"
                        >
                          <Download size={16} />
                        </button>
                      )}
                      
                      <button
                        onClick={() => {
                          setSelectedDrawing(drawing);
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
          ) : (
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
                      Size
                    </th>
                    <th scope="col" className="relative px-6 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredDrawings.map((drawing) => (
                    <tr 
                      key={drawing.id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => handleSelectDrawing(drawing)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10 bg-gray-100 rounded-md flex items-center justify-center">
                            {drawing.thumbnail ? (
                              <img
                                src={drawing.thumbnail}
                                alt={drawing.name}
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
                                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                                />
                              </svg>
                            )}
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {drawing.name}
                            </div>
                            {drawing.description && (
                              <div className="text-sm text-gray-500 truncate max-w-xs">
                                {drawing.description}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(drawing.updatedAt)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {drawing.elements?.length || 0} elements
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end space-x-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleLoadDrawing(drawing);
                            }}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            Load
                          </button>
                          
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedDrawing(drawing);
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
                                setSelectedDrawing(drawing);
                                handleExportDrawing();
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
                              setSelectedDrawing(drawing);
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
        </>
      )}
      
      {/* Save Drawing Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-gray-900 bg-opacity-50 z-50">
          <div className="bg-white rounded-lg max-w-md w-full mx-4 overflow-hidden shadow-xl">
            <div className="px-6 py-4 bg-blue-600">
              <h3 className="text-lg font-medium text-white">Save Drawing to Library</h3>
            </div>
            <div className="p-6">
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Drawing Name
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  value={saveFormData.name}
                  onChange={(e) => setSaveFormData({ ...saveFormData, name: e.target.value })}
                  placeholder="Enter a name for this drawing"
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
                  placeholder="e.g. mechanical, 2D, project1"
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
                  onClick={handleSaveDrawing}
                  disabled={!saveFormData.name}
                >
                  Save Drawing
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Drawing Details Modal */}
      {showDetailsModal && selectedDrawing && (
        <div className="fixed inset-0 flex items-center justify-center bg-gray-900 bg-opacity-50 z-50">
          <div className="bg-white rounded-lg max-w-lg w-full mx-4 overflow-hidden shadow-xl">
            <div className="px-6 py-4 flex justify-between items-center bg-gray-100">
              <h3 className="text-lg font-medium text-gray-900">Drawing Details</h3>
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
                    {selectedDrawing.thumbnail ? (
                      <img
                        src={selectedDrawing.thumbnail}
                        alt={selectedDrawing.name}
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
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                    )}
                  </div>
                  
                  <div className="flex flex-col space-y-2">
                    <button
                      onClick={() => handleLoadDrawing(selectedDrawing)}
                      className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center justify-center"
                    >
                      <Upload size={16} className="mr-2" />
                      Load Drawing
                    </button>
                    
                    {allowExport && (
                      <button
                        onClick={handleExportDrawing}
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
                  <h2 className="text-xl font-bold text-gray-900 mb-2">{selectedDrawing.name}</h2>
                  
                  {selectedDrawing.description && (
                    <p className="text-gray-600 mb-4">{selectedDrawing.description}</p>
                  )}
                  
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-1">Created</h4>
                    <p className="text-gray-600">{formatDate(selectedDrawing.createdAt)}</p>
                  </div>
                  
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-1">Last Modified</h4>
                    <p className="text-gray-600">{formatDate(selectedDrawing.updatedAt)}</p>
                  </div>
                  
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-1">Elements</h4>
                    <p className="text-gray-600">{selectedDrawing.elements?.length || 0} elements</p>
                  </div>
                  
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-1">Layers</h4>
                    <p className="text-gray-600">{selectedDrawing.layers?.length || 0} layers</p>
                  </div>
                  
                  {selectedDrawing.tags && selectedDrawing.tags.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-1">Tags</h4>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {selectedDrawing.tags.map((tag) => (
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
      
      {/* Delete Confirmation Modal */}
      {showDeleteConfirmation && selectedDrawing && (
        <div className="fixed inset-0 flex items-center justify-center bg-gray-900 bg-opacity-50 z-50">
          <div className="bg-white rounded-lg max-w-md w-full mx-4 overflow-hidden shadow-xl">
            <div className="px-6 py-4 bg-red-600">
              <h3 className="text-lg font-medium text-white">Confirm Deletion</h3>
            </div>
            <div className="p-6">
              <p className="text-gray-600 mb-4">
                Are you sure you want to delete the drawing &quot;{selectedDrawing.name}&quot;? This action cannot be undone.
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
                  onClick={handleDeleteDrawing}
                >
                  Delete Drawing
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

export default LocalCadLibraryView;