// src/components/library/UnifiedLibrarySelector.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useLocalToolsLibraryStore } from '@/src/store/localToolsLibraryStore';
import { useLocalMaterialsLibraryStore } from '@/src/store/localMaterialsLibraryStore';
import { useLocalComponentsLibraryStore } from '@/src/store/localComponentsLibraryStore';
import { predefinedTools, predefinedMaterials, predefinedComponents } from '@/src/lib/predefinedLibraries';
import { fetchTools } from '@/src/lib/api/tools';
import { fetchMaterials } from '@/src/lib/api/materials';
import { fetchComponents } from '@/src/lib/api/components';
import { Search, Filter, Tool, Layers, Package, RefreshCw } from 'react-feather';

// Library types
type LibraryType = 'tools' | 'materials' | 'components';
type SourceType = 'local' | 'predefined' | 'server';

// Item interface
interface LibraryItem {
  id: string;
  name: string;
  type?: string;
  description?: string;
  diameter?: number;
  material?: string;
  source: SourceType;
  sourceId?: string;
  [key: string]: any;
}

interface UnifiedLibrarySelectorProps {
  libraryType: LibraryType[];
  onSelectItem: (item: any) => void;
  isOpen?: boolean;
  onClose?: () => void;
  buttonLabel?: string;
}

const UnifiedLibrarySelector: React.FC<UnifiedLibrarySelectorProps> = ({
  libraryType,
  onSelectItem,
  isOpen = true,
  onClose,
  buttonLabel = "Select from Library"
}) => {
  // States
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<LibraryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSource, setActiveSource] = useState<SourceType | 'all'>('all');

  // Local library stores
  const toolsStore = useLocalToolsLibraryStore();
  const materialsStore = useLocalMaterialsLibraryStore();
  const componentsStore = useLocalComponentsLibraryStore();

  // Load items from all sources
  const loadAllItems = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      let allItems: LibraryItem[] = [];
      // Carica dagli archivi locali
      if (libraryType.includes('tools')) {
        toolsStore.loadLibrary();
        const localTools = toolsStore.tools.map(tool => ({
          ...tool,
          source: 'local' as SourceType,
          sourceId: tool.id
        }));
        allItems = [...allItems, ...localTools];
      } else if (libraryType.includes('materials')) {
        materialsStore.loadLibrary();
        const localMaterials = materialsStore.materials.map(material => ({
          ...material,
          source: 'local' as SourceType,
          sourceId: material.id
        }));
        allItems = [...allItems, ...localMaterials];
      } else if (libraryType.includes('components')) {
        componentsStore.loadLibrary();
        const localComponents = componentsStore.components.map(component => ({
          ...component,
          source: 'local' as SourceType,
          sourceId: component.id
        }));
        allItems = [...allItems, ...localComponents];
      }
      // Carica gli elementi predefiniti
      if (libraryType.includes('tools')) {
        const predefined = predefinedTools.map(tool => ({
          ...tool,
          id: `predefined-${tool.name?.replace(/\s+/g, '-').toLowerCase() || Math.random().toString(36).substr(2, 9)}`,
          source: 'predefined' as SourceType,
          sourceId: tool.name
        }));
        allItems = [...allItems, ...predefined];
      } else if (libraryType.includes('materials')) {
        const predefined = predefinedMaterials.map(material => ({
          ...material,
          id: `predefined-${material.name?.replace(/\s+/g, '-').toLowerCase() || Math.random().toString(36).substr(2, 9)}`,
          source: 'predefined' as SourceType,
          sourceId: material.name,
          description: material.description ?? undefined
        }));
        allItems = [...allItems, ...predefined];
      } else if (libraryType.includes('components')) {
        const predefined = predefinedComponents.map(component => ({
          ...component,
          id: `predefined-${component.name?.replace(/\s+/g, '-').toLowerCase() || Math.random().toString(36).substr(2, 9)}`,
          source: 'predefined' as SourceType,
          sourceId: component.name,
          type: component.type || undefined,
          description: component.description ?? undefined
        }));
        allItems = [...allItems, ...predefined];
      }
      
      // Load from server API
      try {
        if (libraryType.includes('tools')) {
          const serverTools = await fetchTools({});
          const formattedTools = serverTools.map(tool => ({
            ...tool,
            source: 'server' as SourceType,
            sourceId: tool.id
          }));
          allItems = [...allItems, ...formattedTools];
        } else if (libraryType.includes('materials')) {
          const serverMaterials = await fetchMaterials({});
          const formattedMaterials = serverMaterials.map(material => ({
            ...material,
            source: 'server' as SourceType,
            sourceId: material.id,
            description: material.description ?? undefined
          }));
          allItems = [...allItems, ...formattedMaterials];
        } else if (libraryType.includes('components')) {
          const serverComponents = await fetchComponents({});
          const formattedComponents = serverComponents.map(component => ({
            ...component.data,
            id: component.data.id,
            name: component.data.name,
            source: 'server' as SourceType,
            sourceId: component.data.id,
            type: component.data.type ?? undefined,
            description: component.data.description ?? ''
          }));
          allItems = [...allItems, ...formattedComponents];
        }
      } catch (apiError) {
        console.error(`Errore nel recupero di ${libraryType} dall'API:`, apiError);
        // Continua con gli elementi locali e predefiniti
      }
      
      // Store all items
      setItems(allItems);
      setFilteredItems(allItems);
    } catch (err) {
      setError(`Failed to load items: ${err instanceof Error ? err.message : 'Unknown error'}`);
      console.error(`Error loading ${libraryType}:`, err);
    } finally {
      setIsLoading(false);
    }
  }, [libraryType, toolsStore, materialsStore, componentsStore]);
  
  // Initialize
  useEffect(() => {
    if (isOpen) {
      loadAllItems();
    }
  }, [isOpen, loadAllItems]);
  
  // Filter items when search or source changes
  useEffect(() => {
    const filtered = items.filter(item => {
      // Source filter
      if (activeSource !== 'all' && item.source !== activeSource) {
        return false;
      }
      
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          (item.name && item.name.toLowerCase().includes(query)) ||
          (item.description && item.description.toLowerCase().includes(query)) ||
          (item.type && item.type.toLowerCase().includes(query)) ||
          (item.material && item.material.toLowerCase().includes(query))
        );
      }
      
      return true;
    });
    
    setFilteredItems(filtered);
  }, [items, searchQuery, activeSource]);
  
  // Get source badge color
  const getSourceBadgeColor = (source: SourceType) => {
    switch(source) {
      case 'local': return 'bg-green-100 text-green-800';
      case 'predefined': return 'bg-blue-100 text-blue-800';
      case 'server': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };
  
  // Get source label
  const getSourceLabel = (source: SourceType) => {
    switch(source) {
      case 'local': return 'Locale';
      case 'predefined': return 'Standard';
      case 'server': return 'Server';
      default: return source;
    }
  };
  
  // Get icon based on library type and item
  const getItemIcon = (item: LibraryItem) => {
    if (libraryType.includes('tools')) {
      return <Tool size={16} className="text-blue-500" />;
    } else if (libraryType.includes('materials')) {
      if (item.color) {
        return (
          <div 
            className="w-4 h-4 rounded-full"
            style={{ backgroundColor: item.color }}
          />
        );
      }
      return <Layers size={16} className="text-orange-500" />;
    } else {
      return <Package size={16} className="text-green-500" />;
    }
  };
  
  // Handle item selection
  const handleSelectItem = (item: LibraryItem) => {
    // Find the original item based on source
    let originalItem;
    if (item.source === 'local') {
      if (libraryType.includes('tools')) {
        originalItem = toolsStore.tools.find(t => t.id === item.sourceId);
      } else if (libraryType.includes('materials')) {
        originalItem = materialsStore.materials.find(m => m.id === item.sourceId);
      } else {
        originalItem = componentsStore.components.find(c => c.id === item.sourceId);
      }
    } else if (item.source === 'predefined') {
      if (libraryType.includes('tools')) {
        originalItem = predefinedTools.find(t => t.name === item.sourceId);
      } else if (libraryType.includes('materials')) {
        originalItem = predefinedMaterials.find(m => m.name === item.sourceId);
      } else {
        originalItem = predefinedComponents.find(c => c.name === item.sourceId);
      }
    } else {
      // Server items are already in the correct format
      originalItem = item;
    }
    
    if (originalItem) {
      onSelectItem(originalItem);
      if (onClose) onClose();
    }
  };

  // Render either dropdown or modal
  const renderLibraryContent = () => {
    return (
      <div className="bg-white rounded-lg shadow-lg overflow-hidden max-w-4xl w-full max-h-[80vh] flex flex-col">
        <div className="px-4 py-3 border-b flex justify-between items-center bg-gray-50">
          <h2 className="text-lg font-medium text-gray-900">
            {libraryType.includes('tools') ? 'Utensili' : 
             libraryType.includes('materials') ? 'Materiali' : 'Componenti'} Library
          </h2>
          {onClose && (
            <button 
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        
        <div className="p-4 border-b bg-gray-50">
          <div className="flex flex-col md:flex-row space-y-2 md:space-y-0 md:space-x-4">
            <div className="relative flex-grow">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search size={16} className="text-gray-400" />
              </div>
              <input
                type="text"
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder={`Search ${libraryType}...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            
            <div className="flex space-x-1">
              <button
                className={`px-3 py-2 rounded-md text-sm font-medium ${
                  activeSource === 'all' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                onClick={() => setActiveSource('all')}
              >
                All
              </button>
              <button
                className={`px-3 py-2 rounded-md text-sm font-medium ${
                  activeSource === 'local' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                onClick={() => setActiveSource('local')}
              >
                Local
              </button>
              <button
                className={`px-3 py-2 rounded-md text-sm font-medium ${
                  activeSource === 'predefined' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                onClick={() => setActiveSource('predefined')}
              >
                Standard
              </button>
              <button
                className={`px-3 py-2 rounded-md text-sm font-medium ${
                  activeSource === 'server' ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                onClick={() => setActiveSource('server')}
              >
                Server
              </button>
              
              <button
                className="px-3 py-2 rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200"
                onClick={loadAllItems}
                title="Refresh"
              >
                <RefreshCw size={16} />
              </button>
            </div>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          ) : error ? (
            <div className="p-4 bg-red-50 text-red-600 rounded-md">
              {error}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center p-8 text-gray-500">
              No items found. Try changing your search or filters.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredItems.map((item) => (
                <div
                  key={`${item.source}-${item.id}`}
                  className="border rounded-md p-4 hover:shadow-md cursor-pointer transition-shadow"
                  onClick={() => handleSelectItem(item)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center">
                      <span className="mr-2">{getItemIcon(item)}</span>
                      <h3 className="font-medium text-gray-900 truncate max-w-xs">{item.name}</h3>
                    </div>
                    <span className={`px-2 py-0.5 text-xs rounded-full ${getSourceBadgeColor(item.source)}`}>
                      {getSourceLabel(item.source)}
                    </span>
                  </div>
                  
                  <div className="text-sm text-gray-600 mt-1 line-clamp-2">
                    {item.description || (
                      libraryType.includes('tools') 
                        ? `${item.type || 'Tool'} - ${item.diameter}mm ${item.material || ''}`
                        : libraryType.includes('materials')
                          ? `${item.properties?.density ? `${item.properties.density}g/cm³` : ''} ${item.properties?.hardness ? `Hardness: ${item.properties.hardness}` : ''}`
                          : `${item.type || 'Component'}`
                    )}
                  </div>
                  
                  {libraryType.includes('tools') && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {item.diameter && (
                        <span className="px-2 py-0.5 text-xs bg-gray-100 rounded-full">
                          ⌀{item.diameter}mm
                        </span>
                      )}
                      {item.numberOfFlutes && (
                        <span className="px-2 py-0.5 text-xs bg-gray-100 rounded-full">
                          {item.numberOfFlutes} flutes
                        </span>
                      )}
                      {item.material && (
                        <span className="px-2 py-0.5 text-xs bg-gray-100 rounded-full">
                          {item.material}
                        </span>
                      )}
                    </div>
                  )}
                  
                  {libraryType.includes('materials') && item.properties && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {item.properties.density && (
                        <span className="px-2 py-0.5 text-xs bg-gray-100 rounded-full">
                          {item.properties.density}g/cm³
                        </span>
                      )}
                      {item.properties.hardness && (
                        <span className="px-2 py-0.5 text-xs bg-gray-100 rounded-full">
                          Hardness: {item.properties.hardness}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  // Dropdown or Button + Modal pattern
  if (!isOpen) {
    return (
      <button
        onClick={onClose}
        className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex items-center"
      >
        {libraryType.includes('tools') ? <Tool size={16} className="mr-2" /> : 
         libraryType.includes('materials') ? <Layers size={16} className="mr-2" /> : 
         <Package size={16} className="mr-2" />}
        {buttonLabel}
      </button>
    );
  }

  // Modal view
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 flex items-center justify-center p-4">
      {renderLibraryContent()}
    </div>
  );
};

export default UnifiedLibrarySelector;