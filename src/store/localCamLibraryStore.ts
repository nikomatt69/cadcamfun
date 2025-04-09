// src/store/localCamLibraryStore.ts
import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { Toolpath, ToolpathModification } from '@/src/types/ai';
import { GCodeCommand } from '@/src/types/GCode';

// Define storage keys
export const STORAGE_KEYS = {
  CAM_LIBRARY: 'cam_library'
};

// Helper functions to store and retrieve data from localStorage
export const storeData = <T>(key: string, data: T): boolean => {
  try {
    const serializedData = JSON.stringify(data);
    localStorage.setItem(key, serializedData);
    return true;
  } catch (error) {
    console.error('Error storing data:', error);
    return false;
  }
};

export const retrieveData = <T>(key: string): T | null => {
  try {
    const serializedData = localStorage.getItem(key);
    if (!serializedData) return null;
    return JSON.parse(serializedData) as T;
  } catch (error) {
    console.error('Error retrieving data:', error);
    return null;
  }
};

// Define a CAM project with toolpaths, gcode, and other CAM data
export interface LocalCamProject {
  id: string;
  name: string;
  description?: string;
  toolpaths: Toolpath[];
  gcode?: string;
  thumbnail?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  machineConfig?: {
    name: string;
    type: string;
    parameters: Record<string, any>;
  };
  material?: {
    name: string;
    type: string;
    parameters: Record<string, any>;
  };
  tools?: {
    id: string;
    name: string;
    type: string;
    diameter: number;
    [key: string]: any;
  }[];
  parsedGCode?: GCodeCommand[];
  meta?: {
    software: string;
    version: string;
    [key: string]: any;
  };
}

export interface CamLibraryState {
  projects: LocalCamProject[];
  isLoading: boolean;
  error: string | null;
  
  // Actions
  loadLibrary: () => void;
  saveLibrary: () => boolean;
  addProject: (project: Omit<LocalCamProject, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateProject: (id: string, updates: Partial<Omit<LocalCamProject, 'id' | 'createdAt' | 'updatedAt'>>) => boolean;
  deleteProject: (id: string) => boolean;
  clearLibrary: () => boolean;
  exportProject: (id: string) => LocalCamProject | null;
  importProject: (project: Omit<LocalCamProject, 'id' | 'createdAt' | 'updatedAt'>) => string;
  searchProjects: (query: string) => LocalCamProject[];
  
  // Toolpath specific actions
  addToolpath: (projectId: string, toolpath: Omit<Toolpath, 'id'>) => string | null;
  updateToolpath: (projectId: string, toolpathId: string, updates: Partial<Toolpath>) => boolean;
  deleteToolpath: (projectId: string, toolpathId: string) => boolean;
  
  // G-code specific actions
  updateGCode: (projectId: string, gcode: string) => boolean;
  parseGCode: (projectId: string) => GCodeCommand[] | null;
}

export const useLocalCamLibraryStore = create<CamLibraryState>((set, get) => ({
  projects: [],
  isLoading: false,
  error: null,
  
  // Load library from localStorage
  loadLibrary: () => {
    set({ isLoading: true, error: null });
    
    try {
      const library = retrieveData<LocalCamProject[]>(STORAGE_KEYS.CAM_LIBRARY) || [];
      set({ projects: library, isLoading: false });
    } catch (error) {
      set({ 
        error: `Failed to load CAM library: ${error instanceof Error ? error.message : 'Unknown error'}`,
        isLoading: false
      });
    }
  },
  
  // Save library to localStorage
  saveLibrary: () => {
    try {
      const { projects } = get();
      const success = storeData(STORAGE_KEYS.CAM_LIBRARY, projects);
      
      if (!success) {
        set({ error: 'Failed to save library: Storage limit may be exceeded' });
        return false;
      }
      
      return true;
    } catch (error) {
      set({ 
        error: `Failed to save CAM library: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
      return false;
    }
  },
  
  // Add a new project to the library
  addProject: (project) => {
    const now = new Date().toISOString();
    const newProject: LocalCamProject = {
      id: uuidv4(),
      createdAt: now,
      updatedAt: now,
      ...project,
      meta: {
        software: 'CAD/CAM FUN',
        version: '1.0.0',
        ...project.meta
      }
    };
    
    set((state) => ({
      projects: [...state.projects, newProject]
    }));
    
    // Save the updated library
    get().saveLibrary();
    
    return newProject.id;
  },
  
  // Update an existing project
  updateProject: (id, updates) => {
    const { projects } = get();
    const projectIndex = projects.findIndex(p => p.id === id);
    
    if (projectIndex === -1) {
      set({ error: `Project with ID ${id} not found` });
      return false;
    }
    
    const updatedProjects = [...projects];
    updatedProjects[projectIndex] = {
      ...updatedProjects[projectIndex],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    
    set({ projects: updatedProjects });
    
    // Save the updated library
    return get().saveLibrary();
  },
  
  // Delete a project from the library
  deleteProject: (id) => {
    const { projects } = get();
    const filteredProjects = projects.filter(p => p.id !== id);
    
    // If no projects were removed, the ID was invalid
    if (filteredProjects.length === projects.length) {
      set({ error: `Project with ID ${id} not found` });
      return false;
    }
    
    set({ projects: filteredProjects });
    
    // Save the updated library
    return get().saveLibrary();
  },
  
  // Clear the entire library
  clearLibrary: () => {
    set({ projects: [] });
    return get().saveLibrary();
  },
  
  // Export a project (for external use)
  exportProject: (id) => {
    const { projects } = get();
    const project = projects.find(p => p.id === id);
    
    if (!project) {
      set({ error: `Project with ID ${id} not found` });
      return null;
    }
    
    return { ...project };
  },
  
  // Import a project (from external source)
  importProject: (project) => {
    // Use the addProject method to ensure consistent IDs and timestamps
    return get().addProject(project);
  },
  
  // Search for projects by name, description, or tags
  searchProjects: (query) => {
    const { projects } = get();
    const lowerCaseQuery = query.toLowerCase();
    
    return projects.filter(project => 
      project.name.toLowerCase().includes(lowerCaseQuery) ||
      (project.description && project.description.toLowerCase().includes(lowerCaseQuery)) ||
      (project.tags && project.tags.some(tag => tag.toLowerCase().includes(lowerCaseQuery)))
    );
  },
  
  // Toolpath specific actions
  addToolpath: (projectId, toolpath) => {
    const { projects } = get();
    const projectIndex = projects.findIndex(p => p.id === projectId);
    
    if (projectIndex === -1) {
      set({ error: `Project with ID ${projectId} not found` });
      return null;
    }
    
    const newToolpath: Toolpath = {
      id: uuidv4(),
      ...toolpath
    };
    
    const updatedProjects = [...projects];
    updatedProjects[projectIndex] = {
      ...updatedProjects[projectIndex],
      toolpaths: [...(updatedProjects[projectIndex].toolpaths || []), newToolpath],
      updatedAt: new Date().toISOString()
    };
    
    set({ projects: updatedProjects });
    
    // Save the updated library
    get().saveLibrary();
    
    return newToolpath.id as string;
  },
  
  updateToolpath: (projectId, toolpathId, updates) => {
    const { projects } = get();
    const projectIndex = projects.findIndex(p => p.id === projectId);
    
    if (projectIndex === -1) {
      set({ error: `Project with ID ${projectId} not found` });
      return false;
    }
    
    const project = projects[projectIndex];
    const toolpathIndex = project.toolpaths?.findIndex(t => t.id === toolpathId) ?? -1;
    
    if (toolpathIndex === -1) {
      set({ error: `Toolpath with ID ${toolpathId} not found in project ${projectId}` });
      return false;
    }
    
    const updatedProjects = [...projects];
    const updatedToolpaths = [...(project.toolpaths || [])];
    updatedToolpaths[toolpathIndex] = {
      ...updatedToolpaths[toolpathIndex],
      ...updates
    };
    
    updatedProjects[projectIndex] = {
      ...updatedProjects[projectIndex],
      toolpaths: updatedToolpaths,
      updatedAt: new Date().toISOString()
    };
    
    set({ projects: updatedProjects });
    
    // Save the updated library
    return get().saveLibrary();
  },
  
  deleteToolpath: (projectId, toolpathId) => {
    const { projects } = get();
    const projectIndex = projects.findIndex(p => p.id === projectId);
    
    if (projectIndex === -1) {
      set({ error: `Project with ID ${projectId} not found` });
      return false;
    }
    
    const project = projects[projectIndex];
    
    if (!project.toolpaths) {
      set({ error: `No toolpaths found in project ${projectId}` });
      return false;
    }
    
    const updatedToolpaths = project.toolpaths.filter(t => t.id !== toolpathId);
    
    // If no toolpaths were removed, the ID was invalid
    if (updatedToolpaths.length === project.toolpaths.length) {
      set({ error: `Toolpath with ID ${toolpathId} not found in project ${projectId}` });
      return false;
    }
    
    const updatedProjects = [...projects];
    updatedProjects[projectIndex] = {
      ...updatedProjects[projectIndex],
      toolpaths: updatedToolpaths,
      updatedAt: new Date().toISOString()
    };
    
    set({ projects: updatedProjects });
    
    // Save the updated library
    return get().saveLibrary();
  },
  
  // G-code specific actions
  updateGCode: (projectId, gcode) => {
    const { projects } = get();
    const projectIndex = projects.findIndex(p => p.id === projectId);
    
    if (projectIndex === -1) {
      set({ error: `Project with ID ${projectId} not found` });
      return false;
    }
    
    const updatedProjects = [...projects];
    updatedProjects[projectIndex] = {
      ...updatedProjects[projectIndex],
      gcode,
      updatedAt: new Date().toISOString()
    };
    
    set({ projects: updatedProjects });
    
    // Save the updated library
    return get().saveLibrary();
  },
  
  parseGCode: (projectId) => {
    const { projects } = get();
    const project = projects.find(p => p.id === projectId);
    
    if (!project) {
      set({ error: `Project with ID ${projectId} not found` });
      return null;
    }
    
    if (!project.gcode) {
      set({ error: `No G-code found in project ${projectId}` });
      return null;
    }
    
    try {
      // Simple G-code parser (this would be more complex in a real implementation)
      const parsedCommands: GCodeCommand[] = project.gcode
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith(';'))
        .map(line => {
          const commentIndex = line.indexOf(';');
          const command = commentIndex >= 0 ? line.substring(0, commentIndex).trim() : line.trim();
          const comment = commentIndex >= 0 ? line.substring(commentIndex + 1).trim() : undefined;
          
          // Extract command and parameters
          const match = command.match(/^([G|M]\d+)\s*(.*)$/i);
          if (!match) return null;
          
          const [, cmd, params] = match;
          const parameters: Record<string, number> = {};
          
          // Parse parameters (e.g., X10 Y20 Z5)
          params.split(/\s+/).forEach(param => {
            const paramMatch = param.match(/^([A-Z])(-?\d+\.?\d*)$/i);
            if (paramMatch) {
              const [, key, value] = paramMatch;
              parameters[key.toUpperCase()] = parseFloat(value);
            }
          });
          
          return { 
            command: cmd, 
            parameters, 
            ...(comment !== undefined ? { comment } : {}) 
          } as GCodeCommand;
        })
        .filter((cmd): cmd is GCodeCommand => cmd !== null);
      
      // Update the project with parsed G-code
      const updatedProjects = [...projects];
      const projectIndex = projects.findIndex(p => p.id === projectId);
      
      updatedProjects[projectIndex] = {
        ...updatedProjects[projectIndex],
        parsedGCode: parsedCommands,
        updatedAt: new Date().toISOString()
      };
      
      set({ projects: updatedProjects });
      
      // Save the updated library
      get().saveLibrary();
      
      return parsedCommands;
    } catch (error) {
      set({ 
        error: `Failed to parse G-code: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
      return null;
    }
  }
}));

// Initialize the library when the module is imported
if (typeof window !== 'undefined') {
  // Check if we're in browser environment before accessing localStorage
  useLocalCamLibraryStore.getState().loadLibrary();
}