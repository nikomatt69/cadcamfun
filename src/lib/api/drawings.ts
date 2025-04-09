// src/lib/api/drawings.ts

import { Drawing, DrawingVersion } from "@prisma/client";

export interface CreateDrawingInput {
  name: string;
  description?: string;
  data: Record<string, any>;
  projectId: string;
  thumbnail?: string;
}

export interface UpdateDrawingInput extends Partial<Omit<CreateDrawingInput, 'projectId'>> {
  id: string;
}

// Fetch all drawings for a project
export const fetchProjectDrawings = async (projectId: string): Promise<Drawing[]> => {
  try {
    const response = await fetch(`/api/projects/${projectId}/drawings`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch project drawings');
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error fetching drawings for project ${projectId}:`, error);
    throw error;
  }
};

// Fetch a single drawing by ID
export const fetchDrawingById = async (id: string): Promise<Drawing> => {
  try {
    const response = await fetch(`/api/drawings/${id}`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch drawing');
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error fetching drawing ${id}:`, error);
    throw error;
  }
};

// Create a new drawing in a project
export const createDrawing = async (drawingData: CreateDrawingInput): Promise<Drawing> => {
  try {
    const response = await fetch(`/api/projects/${drawingData.projectId}/drawings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(drawingData),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to create drawing');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error creating drawing:', error);
    throw error;
  }
};

// Update an existing drawing
export const updateDrawing = async ({ id, ...drawingData }: UpdateDrawingInput): Promise<Drawing> => {
  try {
    const response = await fetch(`/api/drawings/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(drawingData),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to update drawing');
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error updating drawing ${id}:`, error);
    throw error;
  }
};

// Delete a drawing
export const deleteDrawing = async (id: string): Promise<void> => {
  try {
    const response = await fetch(`/api/drawings/${id}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to delete drawing');
    }
  } catch (error) {
    console.error(`Error deleting drawing ${id}:`, error);
    throw error;
  }
};

// Fetch drawing versions
export const fetchDrawingVersions = async (drawingId: string): Promise<DrawingVersion[]> => {
  try {
    const response = await fetch(`/api/drawings/${drawingId}/versions`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch drawing versions');
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error fetching versions for drawing ${drawingId}:`, error);
    throw error;
  }
};

// Create a new version of a drawing
export const createDrawingVersion = async (drawingId: string): Promise<DrawingVersion> => {
  try {
    const response = await fetch(`/api/drawings/${drawingId}/versions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}), // No body needed, server will use current drawing data
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to create drawing version');
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error creating version for drawing ${drawingId}:`, error);
    throw error;
  }
};

// Restore a drawing to a previous version
export const restoreDrawingVersion = async (drawingId: string, versionId: string): Promise<Drawing> => {
  try {
    const response = await fetch(`/api/drawings/${drawingId}/versions`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ versionId }),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to restore drawing version');
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error restoring version ${versionId} for drawing ${drawingId}:`, error);
    throw error;
  }
};