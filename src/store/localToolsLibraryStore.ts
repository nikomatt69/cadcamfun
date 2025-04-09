// src/store/localToolsLibraryStore.ts
import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { 
  storeData, 
  retrieveData, 
  STORAGE_KEYS 
} from '@/src/lib/localStorageService';

// Add tools storage key
const TOOLS_STORAGE_KEY = 'cadcam_local_tools_library';

// Extend storage keys
if (!STORAGE_KEYS.TOOLS_LIBRARY) {
  Object.defineProperty(STORAGE_KEYS, 'TOOLS_LIBRARY', {
    value: TOOLS_STORAGE_KEY,
    writable: false
  });
}

// Define a Tool with all necessary data
export interface LocalTool {
  id: string;
  name: string;
  type: string;
  diameter: number;
  material: string;
  description?: string;
  numberOfFlutes?: number;
  maxRPM?: number;
  coolantType?: string;
  cuttingLength?: number;
  totalLength?: number;
  shankDiameter?: number;
  notes?: string;
  thumbnail?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  meta?: {
    [key: string]: any;
  };
}

export interface ToolsLibraryState {
  tools: LocalTool[];
  isLoading: boolean;
  error: string | null;
  
  // Actions
  loadLibrary: () => void;
  saveLibrary: () => boolean;
  addTool: (tool: Omit<LocalTool, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateTool: (id: string, updates: Partial<Omit<LocalTool, 'id' | 'createdAt' | 'updatedAt'>>) => boolean;
  deleteTool: (id: string) => boolean;
  clearLibrary: () => boolean;
  exportTool: (id: string) => LocalTool | null;
  importTool: (tool: Omit<LocalTool, 'id' | 'createdAt' | 'updatedAt'>) => string;
  searchTools: (query: string) => LocalTool[];
  filterTools: (filters: { type?: string; material?: string; }) => LocalTool[];
}

export const useLocalToolsLibraryStore = create<ToolsLibraryState>((set, get) => ({
  tools: [],
  isLoading: false,
  error: null,
  
  // Load library from localStorage
  loadLibrary: () => {
    set({ isLoading: true, error: null });
    
    try {
      const library = retrieveData<LocalTool[]>(STORAGE_KEYS.TOOLS_LIBRARY) || [];
      set({ tools: library, isLoading: false });
    } catch (error) {
      set({ 
        error: `Failed to load tools library: ${error instanceof Error ? error.message : 'Unknown error'}`,
        isLoading: false
      });
    }
  },
  
  // Save library to localStorage
  saveLibrary: () => {
    try {
      const { tools } = get();
      const success = storeData(STORAGE_KEYS.TOOLS_LIBRARY, tools);
      
      if (!success) {
        set({ error: 'Failed to save library: Storage limit may be exceeded' });
        return false;
      }
      
      return true;
    } catch (error) {
      set({ 
        error: `Failed to save tools library: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
      return false;
    }
  },
  
  // Add a new tool to the library
  addTool: (tool) => {
    const now = new Date().toISOString();
    const newTool: LocalTool = {
      id: uuidv4(),
      createdAt: now,
      updatedAt: now,
      ...tool,
      meta: {
        ...tool.meta
      }
    };
    
    set((state) => ({
      tools: [...state.tools, newTool]
    }));
    
    // Save the updated library
    get().saveLibrary();
    
    // Force refresh the library
    setTimeout(() => {
      get().loadLibrary();
      // Dispatch refresh event
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('tool-library-updated'));
      }
    }, 100);
    
    return newTool.id;
  },
  
  // Update an existing tool
  updateTool: (id, updates) => {
    const { tools } = get();
    const toolIndex = tools.findIndex(t => t.id === id);
    
    if (toolIndex === -1) {
      set({ error: `Tool with ID ${id} not found` });
      return false;
    }
    
    const updatedTools = [...tools];
    updatedTools[toolIndex] = {
      ...updatedTools[toolIndex],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    
    set({ tools: updatedTools });
    
    // Save the updated library
    return get().saveLibrary();
  },
  
  // Delete a tool from the library
  deleteTool: (id) => {
    const { tools } = get();
    const filteredTools = tools.filter(t => t.id !== id);
    
    // If no tools were removed, the ID was invalid
    if (filteredTools.length === tools.length) {
      set({ error: `Tool with ID ${id} not found` });
      return false;
    }
    
    set({ tools: filteredTools });
    
    // Save the updated library
    return get().saveLibrary();
  },
  
  // Clear the entire library
  clearLibrary: () => {
    set({ tools: [] });
    return get().saveLibrary();
  },
  
  // Export a tool (for external use)
  exportTool: (id) => {
    const { tools } = get();
    const tool = tools.find(t => t.id === id);
    
    if (!tool) {
      set({ error: `Tool with ID ${id} not found` });
      return null;
    }
    
    return { ...tool };
  },
  
  // Import a tool (from external source)
  importTool: (tool) => {
    // Use the addTool method to ensure consistent IDs and timestamps
    return get().addTool(tool);
  },
  
  // Search for tools by name, description, type, material or tags
  searchTools: (query) => {
    const { tools } = get();
    const lowerCaseQuery = query.toLowerCase();
    
    return tools.filter(tool => 
      tool.name.toLowerCase().includes(lowerCaseQuery) ||
      (tool.description && tool.description.toLowerCase().includes(lowerCaseQuery)) ||
      tool.type.toLowerCase().includes(lowerCaseQuery) ||
      tool.material.toLowerCase().includes(lowerCaseQuery) ||
      (tool.notes && tool.notes.toLowerCase().includes(lowerCaseQuery)) ||
      (tool.tags && tool.tags.some(tag => tag.toLowerCase().includes(lowerCaseQuery)))
    );
  },
  
  // Filter tools by type and/or material
  filterTools: (filters) => {
    const { tools } = get();
    
    return tools.filter(tool => {
      let matchesType = true;
      let matchesMaterial = true;
      
      if (filters.type && filters.type !== '') {
        matchesType = tool.type === filters.type;
      }
      
      if (filters.material && filters.material !== '') {
        matchesMaterial = tool.material === filters.material;
      }
      
      return matchesType && matchesMaterial;
    });
  }
}));

// Initialize the library when the module is imported
if (typeof window !== 'undefined') {
  useLocalToolsLibraryStore.getState().loadLibrary();
}