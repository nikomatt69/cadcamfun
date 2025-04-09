// src/store/localComponentsLibraryStore.ts
import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { 
  storeData, 
  retrieveData, 
  STORAGE_KEYS 
} from '@/src/lib/localStorageService';

// Add components storage key
const COMPONENTS_STORAGE_KEY = 'cadcam_local_components_library';

// Extend storage keys
if (!STORAGE_KEYS) {
  Object.defineProperty(STORAGE_KEYS, 'COMPONENTS_LIBRARY', {
    value: COMPONENTS_STORAGE_KEY,
    writable: false
  });
}

// Define a Component with all necessary data
export interface LocalComponent {
  id: string;
  name: string;
  description?: string;
  type: string;
  data: any;
  thumbnail?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  meta?: {
    specifications?: Record<string, any>;
    [key: string]: any;
  };
}

export interface ComponentsLibraryState {
  components: LocalComponent[];
  isLoading: boolean;
  error: string | null;
  
  // Actions
  loadLibrary: () => void;
  saveLibrary: () => boolean;
  addComponent: (component: Omit<LocalComponent, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateComponent: (id: string, updates: Partial<Omit<LocalComponent, 'id' | 'createdAt' | 'updatedAt'>>) => boolean;
  deleteComponent: (id: string) => boolean;
  clearLibrary: () => boolean;
  exportComponent: (id: string) => LocalComponent | null;
  importComponent: (component: Omit<LocalComponent, 'id' | 'createdAt' | 'updatedAt'>) => string;
  searchComponents: (query: string) => LocalComponent[];
}

export const useLocalComponentsLibraryStore = create<ComponentsLibraryState>((set, get) => ({
  components: [],
  isLoading: false,
  error: null,
  
  // Load library from localStorage
  loadLibrary: () => {
    set({ isLoading: true, error: null });
    
    try {
      const library = retrieveData<LocalComponent[]>(STORAGE_KEYS.COMPONENTS_LIBRARY) || [];
      set({ components: library, isLoading: false });
    } catch (error) {
      set({ 
        error: `Failed to load components library: ${error instanceof Error ? error.message : 'Unknown error'}`,
        isLoading: false
      });
    }
  },
  
  // Save library to localStorage
  saveLibrary: () => {
    try {
      const { components } = get();
      const success = storeData(STORAGE_KEYS.COMPONENTS_LIBRARY, components);
      
      if (!success) {
        set({ error: 'Failed to save library: Storage limit may be exceeded' });
        return false;
      }
      
      return true;
    } catch (error) {
      set({ 
        error: `Failed to save components library: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
      return false;
    }
  },
  
  // Add a new component to the library
  addComponent: (component) => {
    const now = new Date().toISOString();
    const newComponent: LocalComponent = {
      id: uuidv4(),
      createdAt: now,
      updatedAt: now,
      ...component,
      meta: {
        ...component.meta
      }
    };
    
    set((state) => ({
      components: [...state.components, newComponent]
    }));
    
    // Save the updated library
    get().saveLibrary();
    
    // Force a reload of the library to ensure all components are updated
    setTimeout(() => {
      get().loadLibrary();
      // Dispatch a custom event to notify listeners that a component was added
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('component-library-updated'));
      }
    }, 100);
    
    return newComponent.id;
  },
  
  // Update an existing component
  updateComponent: (id, updates) => {
    const { components } = get();
    const componentIndex = components.findIndex(c => c.id === id);
    
    if (componentIndex === -1) {
      set({ error: `Component with ID ${id} not found` });
      return false;
    }
    
    const updatedComponents = [...components];
    updatedComponents[componentIndex] = {
      ...updatedComponents[componentIndex],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    
    set({ components: updatedComponents });
    
    // Save the updated library
    const success = get().saveLibrary();
    
    // Force a reload of the library
    if (success && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('component-library-updated'));
    }
    
    return success;
  },
  
  // Delete a component from the library
  deleteComponent: (id) => {
    const { components } = get();
    const filteredComponents = components.filter(c => c.id !== id);
    
    // If no components were removed, the ID was invalid
    if (filteredComponents.length === components.length) {
      set({ error: `Component with ID ${id} not found` });
      return false;
    }
    
    set({ components: filteredComponents });
    
    // Save the updated library
    const success = get().saveLibrary();
    
    // Force a reload of the library
    if (success && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('component-library-updated'));
    }
    
    return success;
  },
  
  // Clear the entire library
  clearLibrary: () => {
    set({ components: [] });
    return get().saveLibrary();
  },
  
  // Export a component (for external use)
  exportComponent: (id) => {
    const { components } = get();
    const component = components.find(c => c.id === id);
    
    if (!component) {
      set({ error: `Component with ID ${id} not found` });
      return null;
    }
    
    return { ...component };
  },
  
  // Import a component (from external source)
  importComponent: (component) => {
    // Use the addComponent method to ensure consistent IDs and timestamps
    return get().addComponent(component);
  },
  
  // Search for components by name, description, type, or tags
  searchComponents: (query) => {
    const { components } = get();
    const lowerCaseQuery = query.toLowerCase();
    
    return components.filter(component => 
      component.name.toLowerCase().includes(lowerCaseQuery) ||
      (component.description && component.description.toLowerCase().includes(lowerCaseQuery)) ||
      component.type.toLowerCase().includes(lowerCaseQuery) ||
      (component.tags && component.tags.some(tag => tag.toLowerCase().includes(lowerCaseQuery)))
    );
  }
}));

// Initialize the library when the module is imported
if (typeof window !== 'undefined') {
  useLocalComponentsLibraryStore.getState().loadLibrary();
}