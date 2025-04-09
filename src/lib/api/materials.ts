// src/lib/api/materials.ts

import { Material } from "@prisma/client";



export interface CreateMaterialInput {
  name: string;
  description?: string;
  properties: {
    density: number;
    hardness: number;
    color: string;
    [key: string]: any;
  };
  organizationId?: string;
  isPublic?: boolean;
}

export interface UpdateMaterialInput extends Partial<CreateMaterialInput> {
  id: string;
}

// Fetch all materials with optional filtering
export const fetchMaterials = async (filters?: {
  search?: string;
}): Promise<Material[]> => {
  try {
    // Build query string from filters
    const queryParams = new URLSearchParams();
    if (filters?.search) queryParams.append('search', filters.search);
    
    const queryString = queryParams.toString();
    const endpoint = `/api/materials${queryString ? `?${queryString}` : ''}`;
    
    const response = await fetch(endpoint);
    
    if (!response.ok) {
      throw new Error('Failed to fetch materials');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching materials:', error);
    throw error;
  }
};

// Fetch a single material by ID
export const fetchMaterialById = async (id: string): Promise<Material> => {
  try {
    const response = await fetch(`/api/materials/${id}`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch material');
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error fetching material ${id}:`, error);
    throw error;
  }
};

// Create a new material
export const createMaterial = async (materialData: CreateMaterialInput): Promise<Material> => {
  try {
    const response = await fetch('/api/materials', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(materialData),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to create material');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error creating material:', error);
    throw error;
  }
};

// Update an existing material
export const updateMaterial = async ({ id, ...materialData }: UpdateMaterialInput): Promise<Material> => {
  try {
    const response = await fetch(`/api/materials/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(materialData),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to update material');
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error updating material ${id}:`, error);
    throw error;
  }
};

// Delete a material
export const deleteMaterial = async (id: string): Promise<void> => {
  try {
    const response = await fetch(`/api/materials/${id}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to delete material');
    }
  } catch (error) {
    console.error(`Error deleting material ${id}:`, error);
    throw error;
  }
};