// src/hooks/useLocalLibrary.ts
import { useState } from 'react';
import { useElementsStore, Element } from '@/src/store/elementsStore';
import { useLayerStore, Layer } from '@/src/store/layerStore';
import { useCAMStore } from '@/src/store/camStore';
import { 
  useLocalCadLibraryStore, 
  LocalCadDrawing 
} from '@/src/store/localCadLibraryStore';
import { 
  useLocalCamLibraryStore, 
  LocalCamProject 
} from '@/src/store/localCamLibraryStore';

interface LocalLibraryHookReturn {
  // CAD operations
  saveCadDrawing: (name: string, description?: string, tags?: string[]) => string | null;
  loadCadDrawing: (drawingId: string) => boolean;
  getCurrentCadDrawingData: () => Omit<LocalCadDrawing, 'id' | 'createdAt' | 'updatedAt'>;
  
  // CAM operations
  saveCamProject: (name: string, description?: string, tags?: string[]) => string | null;
  loadCamProject: (projectId: string) => boolean;
  getCurrentCamProjectData: () => Omit<LocalCamProject, 'id' | 'createdAt' | 'updatedAt'>;
  
  // General state
  isLoading: boolean;
  error: string | null;
  clearError: () => void;
  
  // Storage utilities
  generateThumbnail: () => Promise<string | null>;
}

/**
 * Hook for interacting with local CAD and CAM libraries
 */
export const useLocalLibrary = (): LocalLibraryHookReturn => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  // Get store states
  const elementsStore = useElementsStore();
  const layerStore = useLayerStore();
  const camStore = useCAMStore();
  const cadLibraryStore = useLocalCadLibraryStore();
  const camLibraryStore = useLocalCamLibraryStore();
  
  /**
   * Capture the current state of the CAD drawing
   */
  const getCurrentCadDrawingData = (): Omit<LocalCadDrawing, 'id' | 'createdAt' | 'updatedAt'> => {
    const elements = elementsStore.elements;
    const layers = layerStore.layers;
    
    return {
      name: 'Untitled Drawing',
      elements,
      layers,
      meta: {
        software: 'CAD/CAM FUN',
        version: '1.0.0',
      }
    };
  };
  
  /**
   * Capture the current state of the CAM project
   */
  const getCurrentCamProjectData = (): Omit<LocalCamProject, 'id' | 'createdAt' | 'updatedAt'> => {
    const toolpaths = camStore.toolpaths;
    const gcode = camStore.gcode;
    const camItems = camStore.camItems;
    
    // Get machine config if available
    const machineConfig = camItems.find(item => item.type === 'machine')?.details;
    
    // Get material if available
    const material = camItems.find(item => item.details === 'material')?.details;
    
    // Get tools
    const tools = camItems
      .filter(item => item.type === 'tool')
      .map(item => ({
        id: item.id,
        ...item.details
      }));
    
    return {
      name: 'Untitled CAM Project',
      toolpaths,
      gcode,
      machineConfig: machineConfig ? {
        name: machineConfig.name || 'Unknown Machine',
        type: machineConfig.type || 'mill',
        parameters: machineConfig
      } : undefined,
      material: material ? {
        name: material.name || 'Unknown Material',
        type: material.type || 'generic',
        parameters: material
      } : undefined,
      tools: tools.length > 0 ? tools : undefined,
      meta: {
        software: 'CAD/CAM FUN',
        version: '1.0.0',
      }
    };
  };
  
  /**
   * Save the current CAD drawing to the local library
   */
  const saveCadDrawing = (name: string, description?: string, tags?: string[]): string | null => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Get current drawing data
      const drawingData = getCurrentCadDrawingData();
      
      // Add name, description, and tags
      drawingData.name = name || drawingData.name;
      drawingData.description = description;
      drawingData.tags = tags;
      
      // Generate thumbnail (non-blocking)
      generateThumbnail().then(thumbnail => {
        if (thumbnail) {
          // Update the saved drawing with the thumbnail
          const savedDrawings = cadLibraryStore.drawings;
          const drawingWithThisName = savedDrawings.find(d => d.name === name);
          
          if (drawingWithThisName) {
            cadLibraryStore.updateDrawing(drawingWithThisName.id, { thumbnail });
          }
        }
      });
      
      // Check if a drawing with this name already exists
      const existingDrawing = cadLibraryStore.drawings.find(d => d.name === name);
      
      let drawingId: string;
      
      if (existingDrawing) {
        // Update existing drawing
        cadLibraryStore.updateDrawing(existingDrawing.id, drawingData);
        drawingId = existingDrawing.id;
      } else {
        // Add new drawing
        drawingId = cadLibraryStore.addDrawing(drawingData);
      }
      
      setIsLoading(false);
      return drawingId;
    } catch (error) {
      const errorMessage = `Failed to save CAD drawing: ${error instanceof Error ? error.message : 'Unknown error'}`;
      setError(errorMessage);
      setIsLoading(false);
      return null;
    }
  };
  
  /**
   * Load a CAD drawing from the local library
   */
  const loadCadDrawing = (drawingId: string): boolean => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Find the drawing in the library
      const drawing = cadLibraryStore.drawings.find(d => d.id === drawingId);
      
      if (!drawing) {
        throw new Error(`Drawing with ID ${drawingId} not found`);
      }
      
      // Load elements and layers
      const elements = drawing.elements || [];
      const layers = drawing.layers || [];
      
      // Reset current state
      elementsStore.clearSelection();
      
      // Replace layers first (since elements reference layers)
      layerStore.layers = layers;
      
      if (layers.length > 0) {
        layerStore.activeLayer = layers[0].id;
      }
      
      // Then replace elements
      elementsStore.elements = elements;
      
      setIsLoading(false);
      return true;
    } catch (error) {
      const errorMessage = `Failed to load CAD drawing: ${error instanceof Error ? error.message : 'Unknown error'}`;
      setError(errorMessage);
      setIsLoading(false);
      return false;
    }
  };
  
  /**
   * Save the current CAM project to the local library
   */
  const saveCamProject = (name: string, description?: string, tags?: string[]): string | null => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Get current project data
      const projectData = getCurrentCamProjectData();
      
      // Add name, description, and tags
      projectData.name = name || projectData.name;
      projectData.description = description;
      projectData.tags = tags;
      
      // Generate thumbnail (non-blocking)
      generateThumbnail().then(thumbnail => {
        if (thumbnail) {
          // Update the saved project with the thumbnail
          const savedProjects = camLibraryStore.projects;
          const projectWithThisName = savedProjects.find(p => p.name === name);
          
          if (projectWithThisName) {
            camLibraryStore.updateProject(projectWithThisName.id, { thumbnail });
          }
        }
      });
      
      // Check if a project with this name already exists
      const existingProject = camLibraryStore.projects.find(p => p.name === name);
      
      let projectId: string;
      
      if (existingProject) {
        // Update existing project
        camLibraryStore.updateProject(existingProject.id, projectData);
        projectId = existingProject.id;
      } else {
        // Add new project
        projectId = camLibraryStore.addProject(projectData);
      }
      
      setIsLoading(false);
      return projectId;
    } catch (error) {
      const errorMessage = `Failed to save CAM project: ${error instanceof Error ? error.message : 'Unknown error'}`;
      setError(errorMessage);
      setIsLoading(false);
      return null;
    }
  };
  
  /**
   * Load a CAM project from the local library
   */
  const loadCamProject = (projectId: string): boolean => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Find the project in the library
      const project = camLibraryStore.projects.find(p => p.id === projectId);
      
      if (!project) {
        throw new Error(`Project with ID ${projectId} not found`);
      }
      
      // Clear current state
      camStore.clearSelectedEntities();
      
      // Load toolpaths
      if (project.toolpaths && project.toolpaths.length > 0) {
         project.toolpaths;
      }
      
      // Load G-code
      if (project.gcode) {
        camStore.setGcode(project.gcode);
      }
      
      // Load machine configuration
      if (project.machineConfig) {
        const existingMachineItem = camStore.camItems.find(item => item.type === 'machine');
        
        if (existingMachineItem) {
          camStore.updateItem(existingMachineItem.id, {
            details: project.machineConfig.parameters
          });
        } else {
          camStore.addItem({
            name: project.machineConfig.name,
            type: 'machine',
            details: project.machineConfig.parameters
          });
        }
      }
      
      // Load material
      if (project.material) {
        const existingMaterialItem = camStore.camItems.find(item => item.details === 'material');
        
        if (existingMaterialItem) {
          camStore.updateItem(existingMaterialItem.id, {
            details: project.material.parameters
          });
        } else {
          camStore.addItem({
            name: project.material.name,
            type:'machine',
            details: project.material.parameters
          });
        }
      }
      
      // Load tools
      if (project.tools && project.tools.length > 0) {
        // Remove existing tools
        const existingToolItems = camStore.camItems.filter(item => item.type === 'tool');
        existingToolItems.forEach(item => camStore.removeItem(item.id));
        
        // Add new tools
        project.tools.forEach(tool => {
          const { id, ...toolDetails } = tool;
          camStore.addItem({
            name: toolDetails.name || 'Tool',
            type: 'tool',
            details: toolDetails
          });
        });
      }
      
      setIsLoading(false);
      return true;
    } catch (error) {
      const errorMessage = `Failed to load CAM project: ${error instanceof Error ? error.message : 'Unknown error'}`;
      setError(errorMessage);
      setIsLoading(false);
      return false;
    }
  };
  
  /**
   * Generate a thumbnail of the current view
   */
  const generateThumbnail = async (): Promise<string | null> => {
    // In a real implementation, this would capture the canvas view
    // For now, we'll just simulate it with a placeholder
    
    if (typeof document === 'undefined') {
      return null;
    }
    
    try {
      // Try to find a canvas element
      const canvas = document.querySelector('canvas');
      
      if (!canvas) {
        return null;
      }
      
      // Get base64 image data from canvas
      return canvas.toDataURL('image/png');
    } catch (error) {
      console.error('Failed to generate thumbnail:', error);
      return null;
    }
  };
  
  const clearError = () => setError(null);
  
  return {
    saveCadDrawing,
    loadCadDrawing,
    getCurrentCadDrawingData,
    saveCamProject,
    loadCamProject,
    getCurrentCamProjectData,
    isLoading,
    error,
    clearError,
    generateThumbnail
  };
};