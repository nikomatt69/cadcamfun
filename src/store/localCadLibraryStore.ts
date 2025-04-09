// src/store/localCadLibraryStore.ts
import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { 
  storeData, 
  retrieveData, 
  STORAGE_KEYS 
} from '@/src/lib/localStorageService';
import { Element } from '@/src/store/elementsStore';
import { Layer } from '@/src/store/layerStore';
import { createLocalStore, LocalStoreState, loadFromStorage, saveToStorage } from './localStoreUtils';

// Define a CAD drawing with all necessary data to reproduce it
export interface LocalCadDrawing {
  id: string;
  name: string;
  description?: string;
  elements: Element[];
  layers: Layer[];
  thumbnail?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  meta?: {
    software: string;
    version: string;
    [key: string]: any;
  };
}

export interface CadLibraryState extends LocalStoreState {
  drawings: LocalCadDrawing[];
  
  // Actions
  loadLibrary: () => void;
  addDrawing: (drawing: Omit<LocalCadDrawing, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateDrawing: (id: string, updates: Partial<Omit<LocalCadDrawing, 'id' | 'createdAt' | 'updatedAt'>>) => boolean;
  deleteDrawing: (id: string) => boolean;
  clearLibrary: () => void;
  exportDrawing: (id: string) => LocalCadDrawing | null;
  importDrawing: (drawing: Omit<LocalCadDrawing, 'id' | 'createdAt' | 'updatedAt'>) => string;
  searchDrawings: (query: string) => LocalCadDrawing[];
}

const initialState: Partial<CadLibraryState> = {
  drawings: [],
  isLoading: false,
  error: null,
};

export const useLocalCadLibraryStore = create(
  createLocalStore<CadLibraryState>(
    (set, get) => ({
      ...initialState as CadLibraryState,
      
      loadLibrary: () => {
        set({ isLoading: true });
        const drawings = loadFromStorage<LocalCadDrawing[]>(STORAGE_KEYS.CAD_LIBRARY, 
          (error) => set({ error: `Failed to load CAD library: ${error.message}` })
        ) || [];
        set({ drawings, isLoading: false });
      },
      
      addDrawing: (drawing) => {
        const now = new Date().toISOString();
        const newDrawing: LocalCadDrawing = {
          id: uuidv4(),
          createdAt: now,
          updatedAt: now,
          ...drawing,
          meta: {
            software: 'CAD/CAM FUN',
            version: '1.0.0',
            ...drawing.meta
          }
        };
        
        set((state) => ({
          drawings: [...state.drawings, newDrawing]
        }));
        
        return newDrawing.id;
      },
      
      updateDrawing: (id, updates) => {
        const { drawings } = get();
        const drawingIndex = drawings.findIndex(d => d.id === id);
        
        if (drawingIndex === -1) {
          set({ error: `Drawing with ID ${id} not found` });
          return false;
        }
        
        const updatedDrawings = [...drawings];
        updatedDrawings[drawingIndex] = {
          ...updatedDrawings[drawingIndex],
          ...updates,
          updatedAt: new Date().toISOString()
        };
        
        set({ drawings: updatedDrawings });
        return true;
      },
      
      deleteDrawing: (id) => {
        const { drawings } = get();
        const filteredDrawings = drawings.filter(d => d.id !== id);
        
        if (filteredDrawings.length === drawings.length) {
          set({ error: `Drawing with ID ${id} not found` });
          return false;
        }
        
        set({ drawings: filteredDrawings });
        return true;
      },
      
      clearLibrary: () => {
        set({ drawings: [] });
      },
      
      exportDrawing: (id) => {
        const { drawings } = get();
        const drawing = drawings.find(d => d.id === id);
        
        if (!drawing) {
          set({ error: `Drawing with ID ${id} not found` });
          return null;
        }
        
        return { ...drawing };
      },
      
      importDrawing: (drawing) => {
        return get().addDrawing(drawing);
      },
      
      searchDrawings: (query) => {
        const { drawings } = get();
        const lowerCaseQuery = query.toLowerCase();
        
        return drawings.filter(drawing => 
          drawing.name.toLowerCase().includes(lowerCaseQuery) ||
          (drawing.description && drawing.description.toLowerCase().includes(lowerCaseQuery)) ||
          (drawing.tags && drawing.tags.some(tag => tag.toLowerCase().includes(lowerCaseQuery)))
        );
      }
    }),
    {
      name: 'LocalCadLibrary',
      storageKey: STORAGE_KEYS.CAD_LIBRARY,
      enableDevtools: true
    }
  )
);

// Initialize the library when the module is imported
if (typeof window !== 'undefined') {
  useLocalCadLibraryStore.getState().loadLibrary();
}