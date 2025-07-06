// src/store/contextStore.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ContextFile {
  id: string;
  name: string;
  type: string;
  size: number;
  content: string;
  dateAdded: number;
}

export interface ContextLimits {
  maxFiles: number;
  maxTotalCharacters: number;
  maxFileSize: number; // in bytes
}

export interface ContextSession {
  id: string;
  title: string;
  description: string;
  files: ContextFile[];
  activeFileIds: string[];
  createdAt: number;
  updatedAt: number;
}

interface ContextState {
  // Current session
  currentSession: ContextSession;
  
  // Limits
  limits: ContextLimits;
  
  // Legacy compatibility
  contextFiles: ContextFile[];
  activeContextIds: string[];
  
  // Session management
  setSessionTitle: (title: string) => void;
  setSessionDescription: (description: string) => void;
  
  // File management
  addContextFile: (file: File) => Promise<ContextFile>;
  removeContextFile: (id: string) => void;
  toggleContextActive: (id: string) => void;
  setActiveContexts: (ids: string[]) => void;
  clearAllContexts: () => void;
  getActiveContexts: () => ContextFile[];
  
  // Usage tracking
  getTotalCharacters: () => number;
  getRemainingFiles: () => number;
  getRemainingCharacters: () => number;
  getUsagePercentage: () => { files: number; characters: number };
  
  // Context window validation
  validateContextForModel: (modelType?: string) => { isValid: boolean; warning?: string; recommendation?: string };
}

const DEFAULT_LIMITS: ContextLimits = {
  maxFiles: 6,
  maxTotalCharacters: 60000,
  maxFileSize: 3 * 1024 * 1024
};

const createEmptySession = (): ContextSession => ({
  id: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  title: "",
  description: "",
  files: [],
  activeFileIds: [],
  createdAt: Date.now(),
  updatedAt: Date.now()
});

export const useContextStore = create<ContextState>()(
  persist(
    (set, get) => ({
      currentSession: createEmptySession(),
      limits: DEFAULT_LIMITS,
      
      // Legacy compatibility - computed from current session
      get contextFiles() {
        return get().currentSession.files;
      },
      get activeContextIds() {
        return get().currentSession.activeFileIds;
      },

      setSessionTitle: (title: string) => {
        set(state => ({
          currentSession: {
            ...state.currentSession,
            title,
            updatedAt: Date.now()
          }
        }));
      },

      setSessionDescription: (description: string) => {
        set(state => ({
          currentSession: {
            ...state.currentSession,
            description,
            updatedAt: Date.now()
          }
        }));
      },

      addContextFile: async (file: File) => {
        const state = get();
        
        // Check limits
        if (state.currentSession.files.length >= state.limits.maxFiles) {
          throw new Error(`Maximum number of files reached (${state.limits.maxFiles})`);
        }
        
        if (file.size > state.limits.maxFileSize) {
          throw new Error(`File size exceeds limit (${(state.limits.maxFileSize / (1024 * 1024)).toFixed(1)}MB)`);
        }
        
        const content = await readFileAsText(file);
        const totalCharsAfterAdd = state.getTotalCharacters() + content.length;
        
        if (totalCharsAfterAdd > state.limits.maxTotalCharacters) {
          throw new Error(`Total character limit would be exceeded (${state.limits.maxTotalCharacters.toLocaleString()})`);
        }

        const newFile: ContextFile = {
          id: `ctx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: file.name,
          type: file.type,
          size: file.size,
          content,
          dateAdded: Date.now()
        };

        set(state => ({
          currentSession: {
            ...state.currentSession,
            files: [...state.currentSession.files, newFile],
            activeFileIds: [...state.currentSession.activeFileIds, newFile.id],
            updatedAt: Date.now()
          }
        }));

        return newFile;
      },

      removeContextFile: (id: string) => {
        set(state => ({
          currentSession: {
            ...state.currentSession,
            files: state.currentSession.files.filter(file => file.id !== id),
            activeFileIds: state.currentSession.activeFileIds.filter(ctxId => ctxId !== id),
            updatedAt: Date.now()
          }
        }));
      },

      toggleContextActive: (id: string) => {
        set(state => {
          const isActive = state.currentSession.activeFileIds.includes(id);
          return {
            currentSession: {
              ...state.currentSession,
              activeFileIds: isActive
                ? state.currentSession.activeFileIds.filter(ctxId => ctxId !== id)
                : [...state.currentSession.activeFileIds, id],
              updatedAt: Date.now()
            }
          };
        });
      },

      setActiveContexts: (ids: string[]) => {
        set(state => ({
          currentSession: {
            ...state.currentSession,
            activeFileIds: ids,
            updatedAt: Date.now()
          }
        }));
      },

      clearAllContexts: () => {
        set({ currentSession: createEmptySession() });
      },

      getActiveContexts: () => {
        const { currentSession } = get();
        return currentSession.files.filter(file => currentSession.activeFileIds.includes(file.id));
      },

      getTotalCharacters: () => {
        const { currentSession } = get();
        return currentSession.files.reduce((total, file) => total + file.content.length, 0);
      },

      getRemainingFiles: () => {
        const { currentSession, limits } = get();
        return Math.max(0, limits.maxFiles - currentSession.files.length);
      },

      getRemainingCharacters: () => {
        const { limits } = get();
        const used = get().getTotalCharacters();
        return Math.max(0, limits.maxTotalCharacters - used);
      },

      getUsagePercentage: () => {
        const { currentSession, limits } = get();
        const totalChars = get().getTotalCharacters();
        
        return {
          files: Math.min(100, (currentSession.files.length / limits.maxFiles) * 100),
          characters: Math.min(100, (totalChars / limits.maxTotalCharacters) * 100)
        };
      },

      validateContextForModel: (modelType?: string) => {
        const { currentSession, limits } = get();
        const totalChars = get().getTotalCharacters();
        
        if (totalChars > limits.maxTotalCharacters) {
          return {
            isValid: false,
            warning: "Context size exceeds the model's capability",
            recommendation: `Consider reducing the number of files or the total character count`
          };
        }

        return {
          isValid: true
        };
      }
    }),
    {
      name: "cad-context-storage",
      partialize: state => ({
        currentSession: state.currentSession,
        limits: state.limits
      })
    }
  )
);

// Utility function to read file content
const readFileAsText = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = event => {
      if (event.target?.result) {
        resolve(event.target.result as string);
      } else {
        reject(new Error("Failed to read file"));
      }
    };
    reader.onerror = () => reject(new Error("Error reading file"));
    reader.readAsText(file);
  });
};
