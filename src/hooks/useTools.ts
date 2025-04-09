// src/hooks/useTools.ts

import useSWR, { mutate } from 'swr';
import { 
  fetchTools, 
  fetchToolById, 
  createTool, 
  updateTool, 
  deleteTool,
  CreateToolInput,
  UpdateToolInput
} from 'src/lib/api/tools';
import { useState } from 'react';
import { Tool } from '../types/mainTypes';





// Hook for tools list
export function useTools(filters?: {
  type?: string;
  material?: string;
  diameter?: number;
  search?: string;
}) {
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<Error | null>(null);
  
  // Create the cache key based on filters
  const getKey = () => {
    const key = '/api/tools';
    if (!filters) return key;
    
    const params: string[] = [];
    if (filters.type) params.push(`type=${filters.type}`);
    if (filters.material) params.push(`material=${filters.material}`);
    if (filters.diameter) params.push(`diameter=${filters.diameter}`);
    if (filters.search) params.push(`search=${filters.search}`);
    
    return params.length ? `${key}?${params.join('&')}` : key;
  };
  
  // Fetch tools using SWR
  const { data, error, isLoading, isValidating, mutate: refreshTools } = useSWR(
    getKey(),
    () => fetchTools(filters)
  );
  
  // Create a new tool
  const addTool = async (toolData: CreateToolInput) => {
    setIsCreating(true);
    setCreateError(null);
    try {
      const newTool = await createTool(toolData);
      // Update the local cache with the new tool
      await refreshTools();
      return newTool;
    } catch (error) {
      setCreateError(error as Error);
      throw error;
    } finally {
      setIsCreating(false);
    }
  };
  
  return {
    tools: data || [],
    isLoading,
    isCreating,
    error,
    createError,
    refreshTools,
    addTool
  };
}

// Hook for a single tool
export function useTool(id: string) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [updateError, setUpdateError] = useState<Error | null>(null);
  const [deleteError, setDeleteError] = useState<Error | null>(null);
  
  // Fetch the tool using SWR
  const { data, error, isLoading, mutate: refreshTool } = useSWR(
    id ? `/api/tools/${id}` : null,
    () => id ? fetchToolById(id) : null
  );
  
  // Update the tool
  const updateToolData = async (toolData: Partial<Tool>) => {
    if (!id) return;
    
    setIsUpdating(true);
    setUpdateError(null);
    try {
      // Optimistic update
      await mutate(`/api/tools/${id}`, 
        { ...data, ...toolData, updatedAt: new Date().toISOString() }, 
        false
      );
      
      // Actual API call
      const updatedTool = await updateTool({ id });
      
      // Refresh the tool data
      await refreshTool();
      
      // Also refresh the tools list
      await mutate(
        key => typeof key === 'string' && key.startsWith('/api/tools'),
        undefined, 
        { revalidate: true }
      );
      
      return updatedTool;
    } catch (error) {
      setUpdateError(error as Error);
      // Revert the optimistic update
      await refreshTool();
      throw error;
    } finally {
      setIsUpdating(false);
    }
  };
  
  // Delete the tool
  const removeTool = async () => {
    if (!id) return;
    
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteTool(id);
      
      // Refresh the tools list
      await mutate(
        key => typeof key === 'string' && key.startsWith('/api/tools'),
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
    tool: data,
    isLoading,
    isUpdating,
    isDeleting,
    error,
    updateError,
    deleteError,
    refreshTool,
    updateTool: updateToolData,
    deleteTool: removeTool
  };
}