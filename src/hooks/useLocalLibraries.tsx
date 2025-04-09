// src/hooks/useLocalLibraries.tsx
import { useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';

// Define types for all libraries
export interface BaseLibraryItem {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
}

export interface ComponentItem extends BaseLibraryItem {
  type: string;
  meta: any;
  data: any;
  thumbnail?: string;
}

export interface MaterialItem extends BaseLibraryItem {
  color: string;
  density: number;
  hardness: number;
  properties: Record<string, any>;
}

export interface ToolItem extends BaseLibraryItem {
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

// Define library types
export type LibraryType = 'components' | 'materials' | 'tools';

// Define the hook
export function useLocalLibraries<T extends BaseLibraryItem>(libraryType: LibraryType) {
  const [items, setItems] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Storage keys
  const getStorageKey = () => `localLibrary_${libraryType}`;

  // Load all items
  const loadItems = useCallback(() => {
    setIsLoading(true);
    setError(null);
    
    try {
      const storedItems = localStorage.getItem(getStorageKey());
      if (storedItems) {
        setItems(JSON.parse(storedItems));
      } else {
        setItems([]);
      }
    } catch (err) {
      console.error(`Error loading ${libraryType} from local storage:`, err);
      setError(`Failed to load ${libraryType}. ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  }, [libraryType]);

  // Save an item
  const saveItem = useCallback((item: Partial<T>) => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Load current items
      const storedItems = localStorage.getItem(getStorageKey());
      let currentItems: T[] = storedItems ? JSON.parse(storedItems) : [];
      
      const now = new Date().toISOString();
      
      if (item.id) {
        // Update existing item
        const itemIndex = currentItems.findIndex(i => i.id === item.id);
        
        if (itemIndex >= 0) {
          currentItems[itemIndex] = {
            ...currentItems[itemIndex],
            ...item,
            updatedAt: now
          };
        } else {
          throw new Error(`Item with ID ${item.id} not found`);
        }
      } else {
        // Create new item
        const newItem = {
          ...item,
          id: uuidv4(),
          createdAt: now,
          updatedAt: now
        } as T;
        
        currentItems.push(newItem);
      }
      
      // Save back to storage
      localStorage.setItem(getStorageKey(), JSON.stringify(currentItems));
      
      // Update state
      setItems(currentItems);
      
      return currentItems.find(i => i.id === item.id) || currentItems[currentItems.length - 1];
    } catch (err) {
      console.error(`Error saving ${libraryType} to local storage:`, err);
      setError(`Failed to save ${libraryType}. ${err instanceof Error ? err.message : 'Unknown error'}`);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [libraryType]);

  // Delete an item
  const deleteItem = useCallback((id: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Load current items
      const storedItems = localStorage.getItem(getStorageKey());
      let currentItems: T[] = storedItems ? JSON.parse(storedItems) : [];
      
      // Filter out the item to delete
      const updatedItems = currentItems.filter(item => item.id !== id);
      
      // Save back to storage
      localStorage.setItem(getStorageKey(), JSON.stringify(updatedItems));
      
      // Update state
      setItems(updatedItems);
      return true;
    } catch (err) {
      console.error(`Error deleting ${libraryType} from local storage:`, err);
      setError(`Failed to delete ${libraryType}. ${err instanceof Error ? err.message : 'Unknown error'}`);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [libraryType]);

  // Get a single item by ID
  const getItem = useCallback((id: string): T | null => {
    try {
      const storedItems = localStorage.getItem(getStorageKey());
      if (!storedItems) return null;
      
      const items: T[] = JSON.parse(storedItems);
      return items.find(item => item.id === id) || null;
    } catch (err) {
      console.error(`Error getting ${libraryType} from local storage:`, err);
      setError(`Failed to get ${libraryType}. ${err instanceof Error ? err.message : 'Unknown error'}`);
      return null;
    }
  }, [libraryType]);

  // Search items
  const searchItems = useCallback((query: string): T[] => {
    if (!query) return items;
    
    const lowerQuery = query.toLowerCase();
    return items.filter(item => {
      return (
        item.name.toLowerCase().includes(lowerQuery) ||
        (item.description?.toLowerCase().includes(lowerQuery)) ||
        (item.tags?.some(tag => tag.toLowerCase().includes(lowerQuery)))
      );
    });
  }, [items]);

  

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    items,
    isLoading,
    error,
    loadItems,
    saveItem,
    deleteItem,
    getItem,
    searchItems,
    clearError
  };
}