// src/lib/api/tools.ts

import { Tool } from "@prisma/client";




export interface CreateToolInput {
  name: string;
  type: string;
  diameter: number;
  material: string;
  numberOfFlutes?: number;
  maxRPM?: number;
  coolantType?: string;
  cuttingLength?: number;
  totalLength?: number;
  shankDiameter?: number;
  notes?: string;
  organizationId?: string;
  isPublic?: boolean;
}

export interface UpdateToolInput extends Partial<CreateToolInput> {
  id: string;
}

// Fetch all tools with optional filtering
export const fetchTools = async (filters?: {
  type?: string;
  material?: string;
  diameter?: number;
  search?: string;
}): Promise<Tool[]> => {
  try {
    // Build query string from filters
    const queryParams = new URLSearchParams();
    if (filters?.type) queryParams.append('type', filters.type);
    if (filters?.material) queryParams.append('material', filters.material);
    if (filters?.diameter) queryParams.append('diameter', filters.diameter.toString());
    if (filters?.search) queryParams.append('search', filters.search);
    
    const queryString = queryParams.toString();
    const endpoint = `/api/tools${queryString ? `?${queryString}` : ''}`;
    
    const response = await fetch(endpoint);
    
    if (!response.ok) {
      throw new Error('Failed to fetch tools');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching tools:', error);
    throw error;
  }
};

// Fetch a single tool by ID
export const fetchToolById = async (id: string): Promise<Tool> => {
  try {
    const response = await fetch(`/api/tools/${id}`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch tool');
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error fetching tool ${id}:`, error);
    throw error;
  }
};

// Create a new tool
export const createTool = async (toolData: CreateToolInput): Promise<Tool> => {
  try {
    const response = await fetch('/api/tools', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(toolData),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to create tool');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error creating tool:', error);
    throw error;
  }
};

// Update an existing tool
export const updateTool = async ({ id, ...toolData }: UpdateToolInput): Promise<Tool> => {
  try {
    const response = await fetch(`/api/tools/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(toolData),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to update tool');
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error updating tool ${id}:`, error);
    throw error;
  }
};

// Delete a tool
export const deleteTool = async (id: string): Promise<void> => {
  try {
    const response = await fetch(`/api/tools/${id}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to delete tool');
    }
  } catch (error) {
    console.error(`Error deleting tool ${id}:`, error);
    throw error;
  }
};