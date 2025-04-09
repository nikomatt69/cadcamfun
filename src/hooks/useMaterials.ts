// src/hooks/useMaterials.ts

import useSWR, { mutate } from 'swr';
import { 
  fetchMaterials, 
  fetchMaterialById, 
  createMaterial, 
  updateMaterial, 
  deleteMaterial,
  CreateMaterialInput,
  UpdateMaterialInput
} from 'src/lib/api/materials';
import { useState } from 'react';
import { Material } from '../types/mainTypes';


// Hook for materials list
export function useMaterials(filters?: {
  search?: string;
}) {
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<Error | null>(null);
  
  // Create the cache key based on filters
  const getKey = () => {
    const key = '/api/materials';
    if (!filters) return key;
    
    const params: string[] = [];
    if (filters.search) params.push(`search=${filters.search}`);
    
    return params.length ? `${key}?${params.join('&')}` : key;
  };
  
  // Fetch materials using SWR
  const { data, error, isLoading, isValidating, mutate: refreshMaterials } = useSWR(
    getKey(),
    () => fetchMaterials(filters)
  );
  
  // Create a new material
  const addMaterial = async (materialData: CreateMaterialInput) => {
    setIsCreating(true);
    setCreateError(null);
    try {
      const newMaterial = await createMaterial(materialData);
      // Update the local cache with the new material
      await refreshMaterials();
      return newMaterial;
    } catch (error) {
      setCreateError(error as Error);
      throw error;
    } finally {
      setIsCreating(false);
    }
  };
  
  return {
    materials: data || [],
    isLoading,
    isCreating,
    error,
    createError,
    refreshMaterials,
    addMaterial
  };
}

// Hook for a single material
export function useMaterial(id: string) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [updateError, setUpdateError] = useState<Error | null>(null);
  const [deleteError, setDeleteError] = useState<Error | null>(null);
  
  // Fetch the material using SWR
  const { data, error, isLoading, mutate: refreshMaterial } = useSWR(
    id ? `/api/materials/${id}` : null,
    () => id ? fetchMaterialById(id) : null
  );
  
  // Update the material
  const updateMaterialData = async (materialData: Partial<Material>) => {
    if (!id) return;
    
    setIsUpdating(true);
    setUpdateError(null);
    try {
      // Optimistic update
      await mutate(`/api/materials/${id}`, 
        { ...data, ...materialData, updatedAt: new Date().toISOString() }, 
        false
      );
      
      // Actual API call
      const updatedMaterial = await updateMaterial({ id });
      
      // Refresh the material data
      await refreshMaterial();
      
      // Also refresh the materials list
      await mutate(
        key => typeof key === 'string' && key.startsWith('/api/materials'),
        undefined, 
        { revalidate: true }
      );
      
      return updatedMaterial;
    } catch (error) {
      setUpdateError(error as Error);
      // Revert the optimistic update
      await refreshMaterial();
      throw error;
    } finally {
      setIsUpdating(false);
    }
  };
  
  // Delete the material
  const removeMaterial = async () => {
    if (!id) return;
    
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteMaterial(id);
      
      // Refresh the materials list
      await mutate(
        key => typeof key === 'string' && key.startsWith('/api/materials'),
        undefined, 
        { revalidate: true }
      );
    } catch (error) {
      setDeleteError(error as Error);
      throw error;
    } finally {
      setIsDeleting(false);
    }
  };
  
  return {
    material: data,
    isLoading,
    isUpdating,
    isDeleting,
    error,
    updateError,
    deleteError,
    refreshMaterial,
    updateMaterial: updateMaterialData,
    deleteMaterial: removeMaterial
  };
}