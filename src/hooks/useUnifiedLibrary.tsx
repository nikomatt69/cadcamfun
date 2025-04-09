// src/hooks/useUnifiedLibrary.ts
import { useState, useEffect, useCallback } from 'react';
import { 
  fetchComponents, 
  fetchMaterials, 
  fetchTools 
} from 'src/lib/api/libraries';
import {
  predefinedComponents,
  predefinedMaterials,
  predefinedTools
} from '@/src/lib/predefinedLibraries';
import { ComponentsLibraryState, useLocalComponentsLibraryStore } from '@/src/store/localComponentsLibraryStore';
import { MaterialsLibraryState, useLocalMaterialsLibraryStore } from '@/src/store/localMaterialsLibraryStore';
import { ToolsLibraryState, useLocalToolsLibraryStore } from '@/src/store/localToolsLibraryStore';

// Library source types
export type LibrarySource = 'api' | 'local' | 'predefined';

// Library entity types
export type LibraryEntityType = 'components' | 'materials' | 'tools';

// Base interface for all library items
export interface LibraryItem {
  id: string;
  name: string;
  description?: string;
  type?: string;
  tags?: string[];
  metadata?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

// Component specific interface
export interface ComponentLibraryItem extends LibraryItem {
  type: string;
  data: any;
  thumbnail?: string;
  source: LibrarySource;  // Add 
}

// Material specific interface
export interface MaterialLibraryItem extends LibraryItem {
  color?: string;
  density?: number;
  hardness?: number;
  properties: Record<string, any>;
}

// Tool specific interface
export interface ToolLibraryItem extends LibraryItem {
  type: string;
  diameter: number;
  material: string;
  numberOfFlutes?: number;
  maxRPM?: number;
  coolantType?: string;
  cuttingLength?: number;
  totalLength?: number;
  shankDiameter?: number;
  notes?: string;
}

// Type for filtering library items
export interface LibraryFilter {
  search?: string;
  type?: string;
  category?: string;
  [key: string]: any;
}

// Return type for the useUnifiedLibrary hook
export interface UnifiedLibraryResult<T extends LibraryItem> {
  // Items and state
  items: T[];
  isLoading: boolean;
  error: string | null;
  activeSource: LibrarySource;
  
  // Actions
  setActiveSource: (source: LibrarySource) => void;
  refreshLibrary: () => Promise<void>;
  searchItems: (query: string) => T[];
  filterItems: (filter: LibraryFilter) => T[];
  
  // Item operations
  getItem: (id: string) => T | null;
  saveItem: (item: Partial<T>) => Promise<T | null>;
  deleteItem: (id: string) => Promise<boolean>;
  importToMain: (item: T) => Promise<T | null>;
  
  // Statistics
  sourceStats: Record<LibrarySource, number>;
}

/**
 * Hook for unified access to library items across different sources
 */
export function useUnifiedLibrary<T extends LibraryItem>(
  entityType: LibraryEntityType,
  initialSource: LibrarySource = 'api'
): UnifiedLibraryResult<T> {
  // State for library data
  const [items, setItems] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSource, setActiveSource] = useState<LibrarySource>(initialSource);
  
  // Get access to local library stores
  const componentsStore = useLocalComponentsLibraryStore();
  const materialsStore = useLocalMaterialsLibraryStore();
  const toolsStore = useLocalToolsLibraryStore();
  
  // Stats for each source
  const [sourceStats, setSourceStats] = useState<Record<LibrarySource, number>>({
    api: 0,
    local: 0,
    predefined: 0
  });
  
  // Get the right local store based on entity type
  const getLocalStore = useCallback(() => {
    switch (entityType) {
      case 'components':
        return componentsStore;
      case 'materials':
        return materialsStore;
      case 'tools':
        return toolsStore;
      default:
        throw new Error(`Unknown entity type: ${entityType}`);
    }
  }, [entityType, componentsStore, materialsStore, toolsStore]);
  
  // Get predefined library items
  const getPredefinedItems = useCallback((): T[] => {
    switch (entityType) {
      case 'components':
        return predefinedComponents as unknown as T[];
      case 'materials':
        return predefinedMaterials as unknown as T[];
      case 'tools':
        return predefinedTools as unknown as T[];
      default:
        return [];
    }
  }, [entityType]);
  
  // Normalize API items to match our interface
  const normalizeApiItems = useCallback((apiItems: any[]): T[] => {
    return apiItems.map(item => {
      // Create a base normalized item
      const normalizedItem: Record<string, any> = {
        id: item.id,
        name: item.name,
        description: item.description || '',
        updatedAt: item.updatedAt,
        createdAt: item.createdAt
      };
      
      // Add entity-specific properties
      if (entityType === 'components') {
        normalizedItem.type = item.type || '';
        normalizedItem.data = item.data || {};
        normalizedItem.thumbnail = item.thumbnail;
      } else if (entityType === 'materials') {
        normalizedItem.properties = item.properties || {};
        if (item.properties) {
          normalizedItem.color = item.properties.color;
          normalizedItem.density = item.properties.density;
          normalizedItem.hardness = item.properties.hardness;
        }
      } else if (entityType === 'tools') {
        normalizedItem.type = item.type;
        normalizedItem.diameter = item.diameter;
        normalizedItem.material = item.material;
        normalizedItem.numberOfFlutes = item.numberOfFlutes;
        normalizedItem.maxRPM = item.maxRPM;
        normalizedItem.coolantType = item.coolantType;
        normalizedItem.cuttingLength = item.cuttingLength;
        normalizedItem.totalLength = item.totalLength;
        normalizedItem.shankDiameter = item.shankDiameter;
        normalizedItem.notes = item.notes;
      }
      
      return normalizedItem as T;
    });
  }, [entityType]);
  
  // Normalize local items to match our interface
  const normalizeLocalItems = useCallback((localItems: any[]): T[] => {
    return localItems.map(item => {
      // Already in the right format
      return item as T;
    });
  }, []);
  
  // Fetch items from API
  const fetchApiItems = useCallback(async (): Promise<T[]> => {
    try {
      let apiItems: any[] = [];
      
      switch (entityType) {
        case 'components':
          apiItems = (await fetchComponents()).data;
          break;
        case 'materials':
          apiItems = (await fetchMaterials()).data;
          break;
        case 'tools':
          apiItems = (await fetchTools()).data;
          break;
      }
      
      return normalizeApiItems(apiItems);
    } catch (error) {
      console.error(`Error fetching ${entityType} from API:`, error);
      throw error;
    }
  }, [entityType, normalizeApiItems]);
  const fetchSourceStats = useCallback(async () => {
    const stats: Record<LibrarySource, number> = {
      api: 0,
      local: 0,
      predefined: 0
    };
    
    try {
      // API count
      try {
        const apiItems = await fetchApiItems();
        stats.api = apiItems.length;
      } catch (e) {
        console.error('Error counting API items:', e);
      }
      
      // Local count
      try {
        const localStore = getLocalStore();
        await localStore.loadLibrary();
        stats.local = entityType === 'components' ? (localStore as ComponentsLibraryState).components.length : 
                     entityType === 'materials' ? (localStore as MaterialsLibraryState).materials.length : 
                     (localStore as ToolsLibraryState).tools.length;
      } catch (e) {
        console.error('Error counting local items:', e);
      }
      
      // Predefined count
      stats.predefined = getPredefinedItems().length;
      
      setSourceStats(stats);
    } catch (e) {
      console.error('Error fetching source stats:', e);
    }
  }, [entityType, fetchApiItems, getLocalStore, getPredefinedItems]);
  // Refresh library data based on active source
  const refreshLibrary = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      let sourceItems: T[] = [];
      
      switch (activeSource) {
        case 'api':
          sourceItems = await fetchApiItems();
          break;
        case 'local':
          const localStore = getLocalStore();
          await localStore.loadLibrary();
          sourceItems = normalizeLocalItems(
            entityType === 'components' ? (localStore as ComponentsLibraryState).components : 
            entityType === 'materials' ? (localStore as MaterialsLibraryState).materials : 
            (localStore as ToolsLibraryState).tools
          );
          break;
        case 'predefined':
          sourceItems = getPredefinedItems();
          break;
      }
      
      setItems(sourceItems);
      
      // Update stats
      fetchSourceStats();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Error loading ${entityType} from ${activeSource} source: ${errorMessage}`);
      console.error(`Error loading ${entityType} from ${activeSource} source:`, err);
    } finally {
      setIsLoading(false);
    }
  }, [activeSource, fetchSourceStats, fetchApiItems, getLocalStore, normalizeLocalItems, entityType, getPredefinedItems]);
  
  // Fetch stats for all sources
  
  
  // Search items by query
  const searchItems = useCallback((query: string): T[] => {
    if (!query) return items;
    
    const lowerQuery = query.toLowerCase();
    return items.filter(item => 
      item.name.toLowerCase().includes(lowerQuery) ||
      (item.description && item.description.toLowerCase().includes(lowerQuery)) ||
      (item.type && item.type.toLowerCase().includes(lowerQuery)) ||
      (item.tags && item.tags.some(tag => tag.toLowerCase().includes(lowerQuery)))
    );
  }, [items]);
  
  // Filter items by criteria
  const filterItems = useCallback((filter: LibraryFilter): T[] => {
    if (!filter || Object.keys(filter).length === 0) return items;
    
    return items.filter(item => {
      // Check each filter criteria
      for (const [key, value] of Object.entries(filter)) {
        if (!value) continue;
        
        if (key === 'search') {
          const searchQuery = value.toLowerCase();
          const nameMatch = item.name.toLowerCase().includes(searchQuery);
          const descMatch = item.description && item.description.toLowerCase().includes(searchQuery);
          const tagMatch = item.tags && item.tags.some(tag => tag.toLowerCase().includes(searchQuery));
          
          if (!nameMatch && !descMatch && !tagMatch) return false;
        }
        else if (key === 'type' && item.type !== value) {
          return false;
        }
        else if (key === 'category') {
          // Handle category-specific filtering
          if (entityType === 'materials' && (item as unknown as MaterialLibraryItem).properties?.category !== value) {
            return false;
          }
        }
        // Handle other filter criteria as needed
      }
      
      return true;
    });
  }, [items, entityType]);
  
  // Get a single item by ID
  const getItem = useCallback((id: string): T | null => {
    return items.find(item => item.id === id) || null;
  }, [items]);
  
  // Save an item to the appropriate store
  const saveItem = useCallback(async (item: Partial<T>): Promise<T | null> => {
    if (activeSource === 'predefined') {
      setError("Cannot save to predefined library");
      return null;
    }
    
    setIsLoading(true);
    
    try {
      if (activeSource === 'api') {
        // Save to API
        // This would need API endpoints for saving items
        setError("API save not implemented");
        return null;
      } else {
        // Save to local store
        const localStore = getLocalStore();
        const savedItem = await localStore.saveLibrary(); // This will need to be adjusted based on entity type
        
        // Refresh to get updated items
        await refreshLibrary();
        return savedItem as unknown as T;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Error saving ${entityType} to ${activeSource} source: ${errorMessage}`);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [activeSource, entityType, getLocalStore, refreshLibrary]);
  
  // Delete an item
  const deleteItem = useCallback(async (id: string): Promise<boolean> => {
    if (activeSource === 'predefined') {
      setError("Cannot delete from predefined library");
      return false;
    }
    
    setIsLoading(true);
    
    try {
      if (activeSource === 'api') {
        // Delete from API
        // This would need API endpoints for deleting items
        setError("API delete not implemented");
        return false;
      } else {
        // Delete from local store
        const localStore = getLocalStore();
        let result;
        switch (entityType) {
          case 'components':
            result = (id);
            break;
          case 'materials':
            result = (id);
            break;
          case 'tools':
            result = (id);
            break;
          default:
            result = false;
        }
        // Refresh to get updated items
        await refreshLibrary();
        return typeof result === 'boolean' ? result : false;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Error deleting ${entityType} from ${activeSource} source: ${errorMessage}`);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [activeSource, entityType, getLocalStore, refreshLibrary]);
  
  // Import an item to the main library (API)
  const importToMain = useCallback(async (item: T): Promise<T | null> => {
    setIsLoading(true);
    
    try {
      // This would need API endpoints for importing items
      setError("API import not implemented");
      return null;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Error importing ${entityType} to API: ${errorMessage}`);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [entityType]);
  
  // Update items when active source changes
  useEffect(() => {
    refreshLibrary();
  }, [activeSource, refreshLibrary]);
  
  // Fetch source stats on mount
  useEffect(() => {
    fetchSourceStats();
    
    // Set up event listeners for library updates
    const handleLocalLibraryUpdate = () => {
      if (activeSource === 'local') {
        refreshLibrary();
      } else {
        fetchSourceStats();
      }
    };
    
    window.addEventListener(`${entityType}-library-updated`, handleLocalLibraryUpdate);
    
    return () => {
      window.removeEventListener(`${entityType}-library-updated`, handleLocalLibraryUpdate);
    };
  }, [entityType, activeSource, refreshLibrary, fetchSourceStats]);
  
  return {
    // Items and state
    items,
    isLoading,
    error,
    activeSource,
    
    // Actions
    setActiveSource,
    refreshLibrary,
    searchItems,
    filterItems,
    
    // Item operations
    getItem,
    saveItem,
    deleteItem,
    importToMain,
    
    // Statistics
    sourceStats
  };
}
