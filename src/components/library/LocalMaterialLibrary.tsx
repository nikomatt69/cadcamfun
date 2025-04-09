// src/components/library/LocalMaterialLibrary.tsx
import React, { useState, useEffect } from 'react';
import { useLocalLibraries, MaterialItem } from '@/src/hooks/useLocalLibraries';
import { Search, Grid, Trash2, ChevronDown, ChevronUp } from 'react-feather';
import AddLibraryItem from './AddLibraryItem';

interface LocalMaterialLibraryProps {
  onSelectMaterial?: (material: MaterialItem) => void;
}

const LocalMaterialLibrary: React.FC<LocalMaterialLibraryProps> = ({ onSelectMaterial }) => {
  const { items: materials, isLoading, error, loadItems, deleteItem, searchItems } = useLocalLibraries<MaterialItem>('materials');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedView, setExpandedView] = useState(true);
  
  // Load materials when component mounts
  useEffect(() => {
    loadItems();
    
    // Listen for material library updates
    const handleLibraryUpdate = () => {
      console.log("Material library updated, refreshing...");
      loadItems();
    };
    
    window.addEventListener('material-library-updated', handleLibraryUpdate);
    
    // Clean up
    return () => {
      window.removeEventListener('material-library-updated', handleLibraryUpdate);
    };
  }, [loadItems]);

  // Filter materials based on search query
  const filteredMaterials = searchQuery ? searchItems(searchQuery) : materials;

  // Handle material selection
  const handleSelectMaterial = (material: MaterialItem) => {
    if (onSelectMaterial) {
      onSelectMaterial(material);
    }
  };

  // Handle material deletion
  const handleDeleteMaterial = (event: React.MouseEvent, materialId: string) => {
    event.stopPropagation();
    if (confirm('Are you sure you want to delete this material?')) {
      deleteItem(materialId);
    }
  };

  // Render library content based on loading state and data
  const renderLibraryContent = () => {
    if (isLoading && materials.length === 0) {
      return (
        <div className="p-2">
          <div className="animate-pulse bg-gray-200 h-6 w-3/4 mb-2 rounded"></div>
          <div className="animate-pulse bg-gray-200 h-20 w-full rounded"></div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="p-2 text-red-600 text-sm">
          Error loading materials: {error}
        </div>
      );
    }

    return (
      <div className="p-2">
        <div className="mb-3">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search size={14} className="text-gray-400" />
            </div>
            <input
              type="text"
              className="block w-full pl-10 pr-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Search materials..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div
          className="flex items-center justify-between px-3 py-2 bg-gray-50 cursor-pointer border border-gray-200 rounded-t-md"
          onClick={() => setExpandedView(!expandedView)}
        >
          <span className="font-medium text-sm">Materials Library</span>
          <div className="text-gray-500">
            {expandedView ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </div>

        {expandedView && (
          <div className="border border-gray-200 border-t-0 rounded-b-md overflow-hidden">
            {filteredMaterials.length === 0 ? (
              <div className="text-center p-4">
                <Grid size={24} className="mx-auto mb-2 text-gray-400" />
                <p className="text-sm text-gray-500">No materials yet</p>
                <p className="text-xs text-gray-400 mt-1">Add materials to your library</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 max-h-60 overflow-y-auto">
                {filteredMaterials.map((material) => (
                  <div
                    key={material.id}
                    className="px-3 py-2 hover:bg-blue-50 flex items-center justify-between cursor-pointer"
                    onClick={() => handleSelectMaterial(material)}
                  >
                    <div className="flex items-center">
                      <div 
                        className="w-6 h-6 rounded-full mr-2"
                        style={{ backgroundColor: material.color || '#ccc' }}
                      />
                      <div>
                        <div className="text-sm font-medium">{material.name}</div>
                        <div className="text-xs text-gray-500 flex space-x-2">
                          <span>{material.density} g/cm³</span>
                          <span>{material.hardness} HRC</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex space-x-1">
                      <button
                        onClick={(e) => handleDeleteMaterial(e, material.id)}
                        className="p-1 text-gray-400 hover:text-red-500 rounded-full hover:bg-gray-100"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Return the main component structure
  return (
    <div className="flex flex-col">
      <div className="flex-1">
        {renderLibraryContent()}
      </div>
      <AddLibraryItem type="materials" onItemAdded={loadItems} />
    </div>
  );
};

export default LocalMaterialLibrary;