// src/lib/api/toolpaths.ts
import { Toolpath } from "@prisma/client";

export interface CreateToolpathInput {
  name: string;
  description?: string;
  data?: Record<string, any>;
  type?: string;
  operationType?: string;
  projectId: string;
  gcode?: string;
  isPublic?: boolean;
  createdBy: string;
}

export interface ToolpathData {
  id: string;
  name: string;
  description?: string;
  type: string;
  operationType: string;
  projectId: string;
  data: Record<string, any>;
  gcode: string | null;
  isPublic: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  userId: string;
}

export const createProjectToolpath = async (
  projectId: string,
  toolpathData: Omit<CreateToolpathInput, 'projectId'>
): Promise<Toolpath> => {
  try {
    const response = await fetch(`/api/projects/${projectId}/toolpaths`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(toolpathData),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to create toolpath');
    }

    return await response.json();
  } catch (error) {
    console.error(`Error creating toolpath in project ${projectId}:`, error);
    throw error;
  }
};

export const fetchProjectToolpaths = async (projectId: string): Promise<Toolpath[]> => {
  try {
    const response = await fetch(`/api/projects/${projectId}/toolpaths`);

    if (!response.ok) {
      throw new Error('Failed to fetch project toolpaths');
    }

    return await response.json();
  } catch (error) {
    console.error(`Error fetching toolpaths for project ${projectId}:`, error);
    throw error;
  }
};

// Create a new toolpath
export const createToolpath = async (toolpathData: CreateToolpathInput): Promise<ToolpathData> => {
  try {
    const response = await fetch('/api/toolpaths', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(toolpathData),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to create toolpath');
    }

    return await response.json();
  } catch (error) {
    console.error('API error creating toolpath:', error);
    throw error;
  }
};

// Fetch toolpath by ID
export const fetchToolpathById = async (id: string): Promise<ToolpathData> => {
  try {
    const response = await fetch(`/api/toolpaths/${id}`);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to fetch toolpath');
    }

    return await response.json();
  } catch (error) {
    console.error(`API error fetching toolpath ${id}:`, error);
    throw error;
  }
};

// Update an existing toolpath
export const updateToolpath = async (toolpathData: Partial<ToolpathData> & { id: string }): Promise<ToolpathData> => {
  try {
    const response = await fetch(`/api/toolpaths/${toolpathData.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(toolpathData),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to update toolpath');
    }

    return await response.json();
  } catch (error) {
    console.error(`API error updating toolpath ${toolpathData.id}:`, error);
    throw error;
  }
};

// Delete a toolpath
export const deleteToolpath = async (id: string): Promise<void> => {
  try {
    const response = await fetch(`/api/toolpaths/${id}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to delete toolpath');
    }
  } catch (error) {
    console.error(`API error deleting toolpath ${id}:`, error);
    throw error;
  }
};

// Fetch all toolpaths with optional filters
export const fetchToolpaths = async (filters?: {
  projectId?: string;
  type?: string;
  operationType?: string;
  search?: string;
  isPublic?: boolean;
}): Promise<ToolpathData[]> => {
  try {
    let url = '/api/toolpaths';
    
    // Add query parameters if filters are provided
    if (filters) {
      const params = new URLSearchParams();
      
      if (filters.projectId) params.append('projectId', filters.projectId);
      if (filters.type) params.append('type', filters.type);
      if (filters.operationType) params.append('operationType', filters.operationType);
      if (filters.search) params.append('search', filters.search);
      if (filters.isPublic !== undefined) params.append('public', String(filters.isPublic));
      
      if (params.toString()) {
        url += `?${params.toString()}`;
      }
    }
    
    const response = await fetch(url);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to fetch toolpaths');
    }

    return await response.json();
  } catch (error) {
    console.error('API error fetching toolpaths:', error);
    throw error;
  }
};

// eslint-disable-next-line import/no-anonymous-default-export
export default {
  createToolpath,
  fetchToolpathById,
  updateToolpath,
  deleteToolpath,
  fetchToolpaths,
  createProjectToolpath,
  fetchProjectToolpaths
};