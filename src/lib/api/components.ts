/**
 * API service for component operations
 */

import { Component } from "@prisma/client";
export interface CreateComponentInput {
  name: string;
  description?: string;
  data: Record<string, any>;
  type?: string;
  projectId: string;
  isPublic?: boolean;
}
// Type for component data
export interface ComponentData {
  id?: string;
  name: string;
  description?: string;
  projectId: string;
  type: string;
  data: Record<string, any>;
  isPublic?: boolean;
  thumbnail?: string;
}
export const createProjectComponent = async (
  projectId: string, 
  componentData: Omit<CreateComponentInput, 'projectId'>
): Promise<Component> => {
  try {
    const response = await fetch(`/api/projects/${projectId}/components`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(componentData),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to create component');
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error creating component in project ${projectId}:`, error);
    throw error;
  }
};


export const fetchProjectComponents = async (projectId: string): Promise<Component[]> => {
  try {
    const response = await fetch(`/api/projects/${projectId}/components`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch project components');
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error fetching components for project ${projectId}:`, error);
    throw error;
  }
};
// Create a new component
export const createComponent = async (componentData: Omit<ComponentData, 'id'>): Promise<ComponentData> => {
  try {
    const response = await fetch('/api/components', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(componentData),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to create component');
    }

    return await response.json();
  } catch (error) {
    console.error('API error creating component:', error);
    throw error;
  }
};

// Fetch component by ID
export const fetchComponentById = async (id: string): Promise<ComponentData> => {
  try {
    const response = await fetch(`/api/components/${id}`);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to fetch component');
    }

    return await response.json();
  } catch (error) {
    console.error(`API error fetching component ${id}:`, error);
    throw error;
  }
};

// Update an existing component
export const updateComponent = async (componentData: Partial<ComponentData> & { id: string }): Promise<ComponentData> => {
  try {
    const response = await fetch(`/api/components/${componentData.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(componentData),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to update component');
    }

    return await response.json();
  } catch (error) {
    console.error(`API error updating component ${componentData.id}:`, error);
    throw error;
  }
};

// Delete a component
export const deleteComponent = async (id: string): Promise<void> => {
  try {
    const response = await fetch(`/api/components/${id}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to delete component');
    }
  } catch (error) {
    console.error(`API error deleting component ${id}:`, error);
    throw error;
  }
};

// Fetch all components with optional filters
export const fetchComponents = async (filters?: {
  projectId?: string;
  type?: string;
  search?: string;
  isPublic?: boolean;
}): Promise<ComponentData[]> => {
  try {
    let url = '/api/components';
    
    // Add query parameters if filters are provided
    if (filters) {
      const params = new URLSearchParams();
      
      if (filters.projectId) params.append('projectId', filters.projectId);
      if (filters.type) params.append('type', filters.type);
      if (filters.search) params.append('search', filters.search);
      if (filters.isPublic !== undefined) params.append('public', String(filters.isPublic));
      
      if (params.toString()) {
        url += `?${params.toString()}`;
      }
    }
    
    const response = await fetch(url);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to fetch components');
    }

    return await response.json();
  } catch (error) {
    console.error('API error fetching components:', error);
    throw error;
  }
};

// Create a component from CAD selection
export const createComponentFromElements = async (params: {
  name: string;
  description: string;
  projectId: string;
  type: string;
  elements: any[];
  isPublic?: boolean;
}): Promise<ComponentData> => {
  try {
    // Format the data for the component API
    const componentData = {
      name: params.name,
      description: params.description,
      projectId: params.projectId,
      type: params.type,
      isPublic: params.isPublic || false,
      data: {
        type: params.type,
        version: "1.0", 
        elements: params.elements,
        properties: {
          createdAt: new Date().toISOString(),
          source: "CAD Editor"
        }
      }
    };
    
    // Create the component
    return await createComponent(componentData);
  } catch (error) {
    console.error('Error creating component from elements:', error);
    throw error;
  }
};

// eslint-disable-next-line import/no-anonymous-default-export
export default {
  createComponent,
  fetchComponentById,
  updateComponent,
  deleteComponent,
  fetchComponents,
  createComponentFromElements
};