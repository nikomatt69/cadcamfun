// src/hooks/useLibrary.ts
import useSWR, { mutate } from 'swr';
import { useState } from 'react';

// Define types for library items
export interface LibraryItemBase {
  id: string;
  name: string;
  description?: string;
  category: 'component' | 'tool' | 'material' | 'machine';
  type: string;
  properties?: Record<string, any>;
  tags: string[];
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  ownerId?: string;
  organizationId?: string;
}

export interface ComponentLibraryItem extends LibraryItemBase {
  category: 'component';
  data: {
    elements: Array<{
      type: string;
      properties: Record<string, any>;
    }>;
  };
}

export interface CreateLibraryItemInput {
  name: string;
  description?: string;
  category: 'component' | 'tool' | 'material' | 'machine';
  type: string;
  data: any;
  properties?: Record<string, any>;
  tags?: string[];
  organizationId?: string;
  isPublic?: boolean;
}

// Hook for library functionality
export function useLibrary() {
  const [isCreating, setIsCreating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  // Fetch all library items
  const { data: items, error: fetchError, isLoading, mutate: refreshItems } = useSWR<LibraryItemBase[]>(
    '/api/library',
    async (url: string | URL | Request) => {
      const res = await fetch(url);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to fetch library items');
      }
      return res.json();
    }
  );
  
  // Fetch library items by category
  const fetchByCategory = async (category: string) => {
    try {
      const res = await fetch(`/api/library?category=${category}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || `Failed to fetch ${category} items`);
      }
      return await res.json();
    } catch (error) {
      setError(error as Error);
      throw error;
    }
  };
  
  // Create a new library item
  const createItem = async (data: CreateLibraryItemInput) => {
    setIsCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/library', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to create library item');
      }
      
      const newItem = await res.json();
      
      // Update local cache
      await refreshItems();
      
      return newItem;
    } catch (error) {
      setError(error as Error);
      throw error;
    } finally {
      setIsCreating(false);
    }
  };
  
  // Update an existing library item
  const updateItem = async (id: string, data: Partial<CreateLibraryItemInput>) => {
    setIsUpdating(true);
    setError(null);
    try {
      const res = await fetch(`/api/library/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to update library item');
      }
      
      const updatedItem = await res.json();
      
      // Update local cache
      await refreshItems();
      
      return updatedItem;
    } catch (error) {
      setError(error as Error);
      throw error;
    } finally {
      setIsUpdating(false);
    }
  };
  
  // Delete a library item
  const deleteItem = async (id: string) => {
    setIsDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/library/${id}`, {
        method: 'DELETE',
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to delete library item');
      }
      
      // Update local cache
      await refreshItems();
    } catch (error) {
      setError(error as Error);
      throw error;
    } finally {
      setIsDeleting(false);
    }
  };
  
  return {
    libraryItems: items || [],
    isLoading,
    isCreating,
    isUpdating,
    isDeleting,
    error: error || fetchError,
    refreshItems,
    fetchByCategory,
    createItem,
    updateItem,
    deleteItem
  };
}