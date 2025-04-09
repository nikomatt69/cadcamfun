// src/store/localMaterialsLibraryStore.ts
import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { 
  storeData, 
  retrieveData, 
  STORAGE_KEYS 
} from '@/src/lib/localStorageService';

// Add materials storage key
const MATERIALS_STORAGE_KEY = 'cadcam_local_materials_library';

// Extend storage keys
if (!STORAGE_KEYS.MATERIALS_LIBRARY) {
  Object.defineProperty(STORAGE_KEYS, 'MATERIALS_LIBRARY', {
    value: MATERIALS_STORAGE_KEY,
    writable: false
  });
}

// Define a Material with all necessary data
export interface LocalMaterial {
  id: string;
  name: string;
  description?: string;
  properties: {
    density: number;
    hardness: number;
    color: string;
    [key: string]: any;
  };
  thumbnail?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  meta?: {
    [key: string]: any;
  };
}

export interface MaterialsLibraryState {
  materials: LocalMaterial[];
  isLoading: boolean;
  error: string | null;
  
  // Actions
  loadLibrary: () => void;
  saveLibrary: () => boolean;
  addMaterial: (material: Omit<LocalMaterial, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateMaterial: (id: string, updates: Partial<Omit<LocalMaterial, 'id' | 'createdAt' | 'updatedAt'>>) => boolean;
  deleteMaterial: (id: string) => boolean;
  clearLibrary: () => boolean;
  exportMaterial: (id: string) => LocalMaterial | null;
  importMaterial: (material: Omit<LocalMaterial, 'id' | 'createdAt' | 'updatedAt'>) => string;
  searchMaterials: (query: string) => LocalMaterial[];
}

export const useLocalMaterialsLibraryStore = create<MaterialsLibraryState>((set, get) => ({
  materials: [],
  isLoading: false,
  error: null,
  
  // Load library from localStorage
  loadLibrary: () => {
    set({ isLoading: true, error: null });
    
    try {
      const library = retrieveData<LocalMaterial[]>(STORAGE_KEYS.MATERIALS_LIBRARY) || [];
      set({ materials: library, isLoading: false });
    } catch (error) {
      set({ 
        error: `Failed to load materials library: ${error instanceof Error ? error.message : 'Unknown error'}`,
        isLoading: false
      });
    }
  },
  
  // Save library to localStorage
  saveLibrary: () => {
    try {
      const { materials } = get();
      const success = storeData(STORAGE_KEYS.MATERIALS_LIBRARY, materials);
      
      if (!success) {
        set({ error: 'Failed to save library: Storage limit may be exceeded' });
        return false;
      }
      
      return true;
    } catch (error) {
      set({ 
        error: `Failed to save materials library: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
      return false;
    }
  },
  
  // Add a new material to the library
  addMaterial: (material) => {
    const now = new Date().toISOString();
    const newMaterial: LocalMaterial = {
      id: uuidv4(),
      createdAt: now,
      updatedAt: now,
      ...material,
      properties: {
        ...material.properties
      },
      meta: {
        ...material.meta
      }
    };
    
    set((state) => ({
      materials: [...state.materials, newMaterial]
    }));
    
    // Save the updated library
    get().saveLibrary();
    
    // Force refresh the library
    setTimeout(() => {
      get().loadLibrary();
      // Dispatch refresh event
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('material-library-updated'));
      }
    }, 100);
    
    return newMaterial.id;
  },
  
  // Update an existing material
  updateMaterial: (id, updates) => {
    const { materials } = get();
    const materialIndex = materials.findIndex(m => m.id === id);
    
    if (materialIndex === -1) {
      set({ error: `Material with ID ${id} not found` });
      return false;
    }
    
    const updatedMaterials = [...materials];
    updatedMaterials[materialIndex] = {
      ...updatedMaterials[materialIndex],
      ...updates,
      properties: updates.properties 
        ? { ...updatedMaterials[materialIndex].properties, ...updates.properties }
        : updatedMaterials[materialIndex].properties,
      updatedAt: new Date().toISOString()
    };
    
    set({ materials: updatedMaterials });
    
    // Save the updated library
    return get().saveLibrary();
  },
  
  // Delete a material from the library
  deleteMaterial: (id) => {
    const { materials } = get();
    const filteredMaterials = materials.filter(m => m.id !== id);
    
    // If no materials were removed, the ID was invalid
    if (filteredMaterials.length === materials.length) {
      set({ error: `Material with ID ${id} not found` });
      return false;
    }
    
    set({ materials: filteredMaterials });
    
    // Save the updated library
    return get().saveLibrary();
  },
  
  // Clear the entire library
  clearLibrary: () => {
    set({ materials: [] });
    return get().saveLibrary();
  },
  
  // Export a material (for external use)
  exportMaterial: (id) => {
    const { materials } = get();
    const material = materials.find(m => m.id === id);
    
    if (!material) {
      set({ error: `Material with ID ${id} not found` });
      return null;
    }
    
    return { ...material };
  },
  
  // Import a material (from external source)
  importMaterial: (material) => {
    // Use the addMaterial method to ensure consistent IDs and timestamps
    return get().addMaterial(material);
  },
  
  // Search for materials by name, description, or tags
  searchMaterials: (query) => {
    const { materials } = get();
    const lowerCaseQuery = query.toLowerCase();
    
    return materials.filter(material => 
      material.name.toLowerCase().includes(lowerCaseQuery) ||
      (material.description && material.description.toLowerCase().includes(lowerCaseQuery)) ||
      (material.tags && material.tags.some(tag => tag.toLowerCase().includes(lowerCaseQuery)))
    );
  }
}));

// Initialize the library when the module is imported
if (typeof window !== 'undefined') {
  useLocalMaterialsLibraryStore.getState().loadLibrary();
}