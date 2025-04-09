// src/store/contextStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ContextFile {
  id: string;
  name: string;
  type: string;
  size: number;
  content: string;
  dateAdded: number;
}

interface ContextState {
  contextFiles: ContextFile[];
  activeContextIds: string[];
  addContextFile: (file: File) => Promise<ContextFile>;
  removeContextFile: (id: string) => void;
  toggleContextActive: (id: string) => void;
  setActiveContexts: (ids: string[]) => void;
  clearAllContexts: () => void;
  getActiveContexts: () => ContextFile[];
}

export const useContextStore = create<ContextState>()(
  persist(
    (set, get) => ({
      contextFiles: [],
      activeContextIds: [],
      
      addContextFile: async (file: File) => {
        const content = await readFileAsText(file);
        const newFile: ContextFile = {
          id: `ctx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: file.name,
          type: file.type,
          size: file.size,
          content,
          dateAdded: Date.now(),
        };
        
        set((state) => ({
          contextFiles: [...state.contextFiles, newFile],
          activeContextIds: [...state.activeContextIds, newFile.id],
        }));
        
        return newFile;
      },
      
      removeContextFile: (id: string) => {
        set((state) => ({
          contextFiles: state.contextFiles.filter((file) => file.id !== id),
          activeContextIds: state.activeContextIds.filter((ctxId) => ctxId !== id),
        }));
      },
      
      toggleContextActive: (id: string) => {
        set((state) => {
          const isActive = state.activeContextIds.includes(id);
          return {
            activeContextIds: isActive
              ? state.activeContextIds.filter((ctxId) => ctxId !== id)
              : [...state.activeContextIds, id],
          };
        });
      },
      
      setActiveContexts: (ids: string[]) => {
        set({ activeContextIds: ids });
      },
      
      clearAllContexts: () => {
        set({ contextFiles: [], activeContextIds: [] });
      },
      
      getActiveContexts: () => {
        const { contextFiles, activeContextIds } = get();
        return contextFiles.filter((file) => activeContextIds.includes(file.id));
      },
    }),
    {
      name: 'cad-context-storage',
      partialize: (state) => ({
        contextFiles: state.contextFiles,
        activeContextIds: state.activeContextIds,
      }),
    }
  )
);

// Utility function to read file content
const readFileAsText = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        resolve(event.target.result as string);
      } else {
        reject(new Error('Failed to read file'));
      }
    };
    reader.onerror = () => reject(new Error('Error reading file'));
    reader.readAsText(file);
  });
};