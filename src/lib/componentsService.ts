// src/lib/componentService.ts
import { 
  Component, 
  CreateComponentInput,
  UpdateComponentInput,
  validateComponentData,
  normalizeComponentData
} from 'src/types/component';

/**
 * Unified component service that replaces the previous duplicate implementations
 * This service handles all component-related API calls and data transformation
 */

// Create a new component
export async function createComponent(
  componentData: CreateComponentInput
): Promise<Component> {
  try {
    // Validate component data
    const dataValidation = validateComponentData(componentData.data);
    if (!dataValidation.valid) {
      throw new Error(`Invalid component data: ${dataValidation.errors?.join(', ')}`);
    }

    // Normalize component data
    const normalizedData = normalizeComponentData(componentData.data);
    
    // Prepare data for API
    const apiData = {
      name: componentData.name,
      description: componentData.description || null,
      data: normalizedData,
      projectId: componentData.projectId,
      type: componentData.type || normalizedData.type || 'custom',
      isPublic: componentData.isPublic || false,
      thumbnail: componentData.thumbnail || null,
    };

    // Make API request
    const response = await fetch('/api/components', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(apiData),
    });

    // Handle errors
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to create component');
    }

    // Return response data
    return await response.json();
  } catch (error) {
    console.error('Error creating component:', error);
    throw error;
  }
}

// Fetch component by ID
export async function fetchComponentById(id: string): Promise<Component> {
  try {
    if (!id) {
      throw new Error('Component ID is required');
    }
    
    const response = await fetch(`/api/components/${id}`);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to fetch component');
    }

    return await response.json();
  } catch (error) {
    console.error(`Error fetching component ${id}:`, error);
    throw error;
  }
}

// Update an existing component
export async function updateComponent(componentData: UpdateComponentInput): Promise<Component> {
  try {
    if (!componentData.id) {
      throw new Error('Component ID is required for updates');
    }
    
    // If data is provided, validate it
    if (componentData.data) {
      const dataValidation = validateComponentData(componentData.data);
      if (!dataValidation.valid) {
        throw new Error(`Invalid component data: ${dataValidation.errors?.join(', ')}`);
      }
    }
    
    // Create clean update object with only defined fields
    const updateData: Record<string, any> = {};
    if (componentData.name !== undefined) updateData.name = componentData.name;
    if (componentData.description !== undefined) updateData.description = componentData.description;
    if (componentData.type !== undefined) updateData.type = componentData.type;
    if (componentData.isPublic !== undefined) updateData.isPublic = componentData.isPublic;
    if (componentData.thumbnail !== undefined) updateData.thumbnail = componentData.thumbnail;
    
    // If data is provided, include it in the update
    if (componentData.data) {
      updateData.data = normalizeComponentData(componentData.data);
    }
    
    // Make API request with complete component ID to ensure proper routing
    const response = await fetch(`/api/components/${componentData.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updateData),
    });

    // Handle errors with detailed messages
    if (!response.ok) {
      let errorMessage = 'Failed to update component';
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorMessage;
      } catch (e) {
        // If response parsing fails, use status text
        errorMessage = `Status ${response.status}: ${response.statusText}`;
      }
      throw new Error(errorMessage);
    }

    return await response.json();
  } catch (error) {
    console.error(`Error updating component ${componentData.id}:`, error);
    throw error;
  }
}

// Delete a component
export async function deleteComponent(id: string): Promise<void> {
  try {
    if (!id) {
      throw new Error('Component ID is required for deletion');
    }
    
    const response = await fetch(`/api/components/${id}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to delete component');
    }
  } catch (error) {
    console.error(`Error deleting component ${id}:`, error);
    throw error;
  }
}

// Fetch components with filters
export async function fetchComponents(filters?: {
  projectId?: string;
  type?: string;
  search?: string;
  isPublic?: boolean;
}): Promise<Component[]> {
  try {
    // Build URL with query parameters
    let url = '/api/components';
    
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
    console.error('Error fetching components:', error);
    throw error;
  }
}

// Create component from CAD elements
export async function createComponentFromElements(params: {
  name: string;
  description: string;
  projectId: string;
  type: string;
  elements: any[];
  isPublic?: boolean;
}): Promise<Component> {
  try {
    // Format the data for the component API
    const componentData: CreateComponentInput = {
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
    
    // Create the component using the main create function
    return await createComponent(componentData);
  } catch (error) {
    console.error('Error creating component from elements:', error);
    throw error;
  }
}

// Save component version
export async function saveComponentVersion(
  componentId: string, 
  data: any, 
  changeMessage?: string
): Promise<any> {
  try {
    if (!componentId) {
      throw new Error('Component ID is required to save version');
    }
    
    // Validate component data
    const dataValidation = validateComponentData(data);
    if (!dataValidation.valid) {
      throw new Error(`Invalid component data: ${dataValidation.errors?.join(', ')}`);
    }
    
    const response = await fetch(`/api/components/${componentId}/versions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: normalizeComponentData(data),
        changeMessage: changeMessage || 'Updated component'
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to save component version');
    }

    return await response.json();
  } catch (error) {
    console.error(`Error saving component version for ${componentId}:`, error);
    throw error;
  }
}

// Get component versions
export async function getComponentVersions(componentId: string): Promise<any[]> {
  try {
    if (!componentId) {
      throw new Error('Component ID is required to fetch versions');
    }
    
    const response = await fetch(`/api/components/${componentId}/versions`);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to fetch component versions');
    }

    return await response.json();
  } catch (error) {
    console.error(`Error fetching versions for component ${componentId}:`, error);
    throw error;
  }
}

// Restore a component version
export async function restoreComponentVersion(
  componentId: string, 
  versionId: string
): Promise<Component> {
  try {
    if (!componentId || !versionId) {
      throw new Error('Component ID and Version ID are required to restore version');
    }
    
    const response = await fetch(`/api/components/${componentId}/versions/restore`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: componentId, versionId }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to restore component version');
    }

    return await response.json();
  } catch (error) {
    console.error(`Error restoring version ${versionId} for component ${componentId}:`, error);
    throw error;
  }
}

// Default export for compatibility with existing code
export default {
  createComponent,
  fetchComponentById,
  updateComponent,
  deleteComponent,
  fetchComponents,
  createComponentFromElements,
  saveComponentVersion,
  getComponentVersions,
  restoreComponentVersion,
};