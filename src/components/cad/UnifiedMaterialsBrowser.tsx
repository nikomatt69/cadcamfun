// src/components/cad/UnifiedMaterialsBrowser.tsx
import React, { useState, useEffect } from 'react';
import { Grid, Square, Search, RefreshCw, Layers, FileText, Shield } from 'react-feather';
import { useLocalMaterialsLibraryStore } from '@/src/store/localMaterialsLibraryStore';
import { predefinedMaterials } from '@/src/lib/predefinedLibraries';
import { fetchMaterials } from '@/src/lib/api/libraries';

export type MaterialLibrarySource = 'local' | 'predefined' | 'api';

export interface MaterialLibraryItem {
  id: string;
  name: string;
  description?: string;
  type?: string;
  color?: string;
  density?: number;
  hardness?: number;
  properties?: Record<string, any>;
  data?: any;
  source: MaterialLibrarySource;
}

interface UnifiedMaterialsBrowserProps {
  onSelectMaterial: (material: MaterialLibraryItem) => void;
}

const UnifiedMaterialsBrowser: React.FC<UnifiedMaterialsBrowserProps> = ({ onSelectMaterial }) => {
  // State
  const [materials, setMaterials] = useState<MaterialLibraryItem[]>([]);
  const [filteredMaterials, setFilteredMaterials] = useState<MaterialLibraryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeSource, setActiveSource] = useState<MaterialLibrarySource | 'all'>('all');
  
  // Access local store
  const { materials: localMaterials, loadLibrary } = useLocalMaterialsLibraryStore();
  
  // Load all materials from different sources
  const loadAllMaterials = async () => {
    setIsLoading(true);
    try {
      // Load local materials
      loadLibrary();
      
      // Format materials from all sources
      let allMaterials: MaterialLibraryItem[] = [];
      
      // Add local materials
      const formattedLocalMaterials = localMaterials.map(material => ({
        ...material,
        id: material.id,
        source: 'local' as MaterialLibrarySource
      }));
      allMaterials = [...allMaterials, ...formattedLocalMaterials];
      
      // Add predefined materials
      const formattedPredefined = predefinedMaterials.map(material => ({
        ...material,
        id: `predefined-${material.name?.replace(/\s+/g, '-').toLowerCase()}`|| material.name,
        source: 'predefined' as MaterialLibrarySource,
        type: material?.properties || 'unknown' // Provide default value for null type
      })) as MaterialLibraryItem[];
      
      allMaterials = [...allMaterials, ...formattedPredefined];
      
      // Try to load from API if available
      try {
        const { data: apiMaterials } = await fetchMaterials();
        if (apiMaterials) {
          const formattedApiMaterials = apiMaterials.map((material: any) => ({
            ...material,
            source: 'api' as MaterialLibrarySource
          }));
          allMaterials = [...allMaterials, ...formattedApiMaterials];
        }
      } catch (error) {
        console.log('API materials not available');
      }
      
      setMaterials(allMaterials);
      setFilteredMaterials(allMaterials);
    } catch (error) {
      console.error('Error loading materials:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Initial load
  useEffect(() => {
    loadAllMaterials();
  }, []);
  
  // Filter materials when search or source changes
  useEffect(() => {
    let filtered = materials;
    
    // Filter by source
    if (activeSource !== 'all') {
      filtered = filtered.filter(material => material.source === activeSource);
    }
    
    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(material => 
        material.name.toLowerCase().includes(query) ||
        (material.description && material.description.toLowerCase().includes(query)) ||
        (material.type && material.type.toLowerCase().includes(query))
      );
    }
    
    setFilteredMaterials(filtered);
  }, [materials, searchQuery, activeSource]);
  
  // Get icon for material type
  const getMaterialIcon = (material: MaterialLibraryItem) => {
    const type = material.type?.toLowerCase() || '';
    
    if (type.includes('wood')) return <Layers className="text-yellow-700" />;
    if (type.includes('metal')) return <Shield className="text-gray-500" />;
    if (type.includes('plastic')) return <Square className="text-blue-500" />;
    if (type.includes('composite')) return <FileText className="text-purple-500" />;
    
    return <Grid className="text-gray-500" />;
  };

  // Get color swatch if available
  const getColorSwatch = (material: MaterialLibraryItem) => {
    if (!material.color) return null;
    
    return (
      <div 
        className="w-4 h-4 rounded-full mr-1 border border-gray-300"
        style={{ backgroundColor: material.color }}
      />
    );
  };
  
  // Get source badge style
  const getSourceBadgeStyle = (source: MaterialLibrarySource) => {
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
        <h3 className="text-sm font-medium text-gray-700">Unified Materials</h3>
        <button 
          onClick={loadAllMaterials}
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
            placeholder="Search materials..."
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
      
      {/* Materials list */}
      <div className="overflow-y-auto max-h-64 border border-gray-200 rounded-md">
        {isLoading ? (
          <div className="p-4 flex justify-center">
            <div className="animate-spin h-5 w-5 border-2 border-blue-500 rounded-full border-t-transparent"></div>
          </div>
        ) : filteredMaterials.length === 0 ? (
          <div className="p-4 text-center text-sm text-gray-500">
            No materials found
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredMaterials.map(material => (
              <div 
                key={`${material.source}-${material.id}`} 
                className="p-2 hover:bg-gray-50 cursor-pointer"
                onClick={() => onSelectMaterial(material)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="p-1 bg-gray-100 rounded-md mr-2 flex items-center">
                      {getColorSwatch(material)}
                      {getMaterialIcon(material)}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-800">{material.name}</div>
                      <div className="flex items-center gap-2">
                        {material.type && (
                          <div className="text-xs text-gray-500">{material.type}</div>
                        )}
                        {material.density && (
                          <div className="text-xs text-gray-500">{material.density} g/cm³</div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className={`px-1.5 py-0.5 text-xs rounded-full ${getSourceBadgeStyle(material.source as MaterialLibrarySource)}`}>
                    {material.source}
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

export default UnifiedMaterialsBrowser;