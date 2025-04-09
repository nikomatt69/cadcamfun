// src/components/cad/UnifiedComponentsBrowser.tsx
import React, { useState, useEffect } from 'react';
import { 
  ComponentLibraryItem, 
  LibrarySource
} from '@/src/hooks/useUnifiedLibrary';
import { Package, Grid, Database, Search, Box, RefreshCw } from 'react-feather';
import { useLocalComponentsLibraryStore } from '@/src/store/localComponentsLibraryStore';
import { predefinedComponents } from '@/src/lib/predefinedLibraries';
import { fetchComponents } from '@/src/lib/api/libraries';

interface UnifiedComponentsBrowserProps {
  onSelectComponent: (component: ComponentLibraryItem) => void;
}

const UnifiedComponentsBrowser: React.FC<UnifiedComponentsBrowserProps> = ({ onSelectComponent }) => {
  // State
  const [components, setComponents] = useState<ComponentLibraryItem[]>([]);
  const [filteredComponents, setFilteredComponents] = useState<ComponentLibraryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeSource, setActiveSource] = useState<LibrarySource | 'all'>('all');
  
  // Access local store
  const { components: localComponents, loadLibrary } = useLocalComponentsLibraryStore();
  
  // Load all components from different sources
  const loadAllComponents = async () => {
    setIsLoading(true);
    try {
      // Load local components
      loadLibrary();
      
      // Format components from all sources
      let allComponents: ComponentLibraryItem[] = [];
      
      // Add local components
      const formattedLocalComponents = localComponents.map(comp => ({
        ...comp,
        id: comp.id,
        source: 'local' as LibrarySource
      }));
      allComponents = [...allComponents, ...formattedLocalComponents];
      
      // Add predefined components
      const formattedPredefined = predefinedComponents.map(comp => ({
        ...comp,
        id: comp.data || `predefined-${comp.name?.replace(/\s+/g, '-').toLowerCase()}`,
        source: 'predefined' as LibrarySource,
        type: comp.type || 'unknown' // Provide default value for null type
      })) as ComponentLibraryItem[];
      
      allComponents = [...allComponents, ...formattedPredefined];
      
      // Try to load from API if available
      try {
        const { data: apiComponents } = await fetchComponents();
        if (apiComponents) {
          const formattedApiComponents = apiComponents.map((comp: any) => ({
            ...comp,
            source: 'api' as LibrarySource
          }));
          allComponents = [...allComponents, ...formattedApiComponents];
        }
      } catch (error) {
        console.log('API components not available');
      }
      
      setComponents(allComponents);
      setFilteredComponents(allComponents);
    } catch (error) {
      console.error('Error loading components:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Initial load
  useEffect(() => {
    loadAllComponents();
  }, []);
  
  // Filter components when search or source changes
  useEffect(() => {
    let filtered = components;
    
    // Filter by source
    if (activeSource !== 'all') {
      filtered = filtered.filter(comp => comp.source === activeSource);
    }
    
    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(comp => 
        comp.name.toLowerCase().includes(query) ||
        (comp.description && comp.description.toLowerCase().includes(query)) ||
        (comp.type && comp.type.toLowerCase().includes(query))
      );
    }
    
    setFilteredComponents(filtered);
  }, [components, searchQuery, activeSource]);
  
  // Get icon for component type
  const getComponentIcon = (component: ComponentLibraryItem) => {
    const type = component.type || '';
    
    if (type.includes('mechanical')) return <Box className="text-blue-500" />;
    if (type.includes('electronic')) return <Grid className="text-green-500" />;
    if (type.includes('geometric')) return <Database className="text-purple-500" />;
    
    return <Package className="text-gray-500" />;
  };
  
  // Get source badge style
  const getSourceBadgeStyle = (source: LibrarySource) => {
    switch (source) {
      case 'local': return 'bg-green-100 text-green-800';
      case 'predefined': return 'bg-blue-100 text-blue-800';
      case 'api': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };
  
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-medium text-gray-700">Unified Components</h3>
        <button 
          onClick={loadAllComponents}
          className="p-1 text-gray-500 hover:text-gray-700 rounded-md hover:bg-gray-100"
          title="Refresh"
        >
          <RefreshCw size={14} />
        </button>
      </div>
      
      {/* Search and filters */}
      <div className="space-y-2">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
            <Search size={14} className="text-gray-400" />
          </div>
          <input
            type="text"
            placeholder="Search components..."
            className="block w-full pl-8 pr-2 py-1.5 text-sm border border-gray-300 rounded-md"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        
        <div className="flex space-x-1">
          <button
            className={`px-2 py-1 text-xs rounded-md ${activeSource === 'all' ? 'bg-gray-200' : 'bg-gray-100'}`}
            onClick={() => setActiveSource('all')}
          >
            All
          </button>
          <button
            className={`px-2 py-1 text-xs rounded-md ${activeSource === 'local' ? 'bg-green-200' : 'bg-gray-100'}`}
            onClick={() => setActiveSource('local')}
          >
            Local
          </button>
          <button
            className={`px-2 py-1 text-xs rounded-md ${activeSource === 'predefined' ? 'bg-blue-200' : 'bg-gray-100'}`}
            onClick={() => setActiveSource('predefined')}
          >
            Standard
          </button>
          <button
            className={`px-2 py-1 text-xs rounded-md ${activeSource === 'api' ? 'bg-purple-200' : 'bg-gray-100'}`}
            onClick={() => setActiveSource('api')}
          >
            API
          </button>
        </div>
      </div>
      
      {/* Components list */}
      <div className="overflow-y-auto max-h-64 border border-gray-200 rounded-md">
        {isLoading ? (
          <div className="p-4 flex justify-center">
            <div className="animate-spin h-5 w-5 border-2 border-blue-500 rounded-full border-t-transparent"></div>
          </div>
        ) : filteredComponents.length === 0 ? (
          <div className="p-4 text-center text-sm text-gray-500">
            No components found
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredComponents.map(component => (
              <div 
                key={`${component.source}-${component.id}`} 
                className="p-2 hover:bg-gray-50 cursor-pointer"
                onClick={() => onSelectComponent(component)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="p-1 bg-gray-100 rounded-md mr-2">
                      {getComponentIcon(component)}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-800">{component.name}</div>
                      {component.type && (
                        <div className="text-xs text-gray-500">{component.type}</div>
                      )}
                    </div>
                  </div>
                  <div className={`px-1.5 py-0.5 text-xs rounded-full ${getSourceBadgeStyle(component.source as LibrarySource)}`}>
                    {component.source}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default UnifiedComponentsBrowser;