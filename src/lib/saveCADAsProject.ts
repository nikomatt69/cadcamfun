// src/lib/utils/saveCADAsProject.ts
import { useElementsStore } from 'src/store/elementsStore';
import { createProject } from './api/projects';
import { createDrawing } from './api/drawings';


interface SaveOptions {
  name: string;
  description?: string;
  organizationId?: string;
  isPublic?: boolean;
}

/**
 * Save the current CAD document as a new project
 * @param options Project options
 * @returns Promise with the created project and drawing IDs
 */
export async function saveCADAsProject(options: SaveOptions): Promise<{
  projectId: string;
  drawingId: string;
}> {
  if (!options.name) {
    throw new Error('Project name is required');
  }
  
  // Get current elements from store
  const elements = useElementsStore.getState().elements;
  const selectedElement = useElementsStore.getState().selectedElement;
  
  // Create a new project
  const project = await createProject({
    name: options.name,
    description: options.description,
    organizationId: options.organizationId,
    // Add isPublic if your API supports it
  });
  
  // Prepare drawing data
  const drawingData = {
    name: `${options.name} Drawing`,
    description: `Main drawing for project ${options.name}`,
    data: {
      elements: elements,
      selectedElement: selectedElement ? selectedElement.id : null,
      version: '1.0'
    },
    projectId: project.id,
    // You might want to add a thumbnail image here
  };
  
  // Create a new drawing in the project
  const drawing = await createDrawing(drawingData);
  
  return {
    projectId: project.id,
    drawingId: drawing.id
  };
}