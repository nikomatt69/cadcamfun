// src/hooks/useDrawings.ts

import useSWR, { mutate } from 'swr';
import { 
  fetchProjectDrawings, 
  fetchDrawingById, 
  createDrawing, 
  updateDrawing, 
  deleteDrawing,
  fetchDrawingVersions,
  createDrawingVersion,
  restoreDrawingVersion,
  CreateDrawingInput,
  UpdateDrawingInput
} from 'src/lib/api/drawings';
import { useState } from 'react';
import { Drawing } from '../types/mainTypes';


// Hook for project drawings
export function useProjectDrawings(projectId: string) {
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<Error | null>(null);
  
  // Fetch project drawings using SWR
  const { data, error, isLoading, isValidating, mutate: refreshDrawings } = useSWR(
    projectId ? `/api/projects/${projectId}/drawings` : null,
    () => projectId ? fetchProjectDrawings(projectId) : null
  );
  
  // Create a new drawing
  const addDrawing = async (drawingData: Omit<CreateDrawingInput, 'projectId'>) => {
    if (!projectId) return;
    
    setIsCreating(true);
    setCreateError(null);
    try {
      const newDrawing = await createDrawing({
        ...drawingData,
        projectId
      });
      
      // Update the local cache with the new drawing
      await refreshDrawings();
      
      return newDrawing;
    } catch (error) {
      setCreateError(error as Error);
      throw error;
    } finally {
      setIsCreating(false);
    }
  };
  
  return {
    drawings: data || [],
    isLoading,
    isCreating,
    error,
    createError,
    refreshDrawings,
    addDrawing
  };
}

// Hook for a single drawing
export function useDrawing(id: string) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [updateError, setUpdateError] = useState<Error | null>(null);
  const [deleteError, setDeleteError] = useState<Error | null>(null);
  
  // Fetch the drawing using SWR
  const { data, error, isLoading, mutate: refreshDrawing } = useSWR(
    id ? `/api/drawings/${id}` : null,
    () => id ? fetchDrawingById(id) : null
  );
  
  // Update the drawing
  const updateDrawingData = async (drawingData: Partial<Drawing>) => {
    if (!id) return;
    
    setIsUpdating(true);
    setUpdateError(null);
    try {
      // Optimistic update
      await mutate(`/api/drawings/${id}`, 
        { ...data, ...drawingData, updatedAt: new Date().toISOString() }, 
        false
      );
      
      // Actual API call
      const updatedDrawing = await updateDrawing({ id });
      
      // Refresh the drawing data
      await refreshDrawing();
      
      // Also refresh the project drawings list
      if (data?.projectId) {
        await mutate(
          `/api/projects/${data.projectId}/drawings`,
          undefined,
          { revalidate: true }
        );
      }
      
      return updatedDrawing;
    } catch (error) {
      setUpdateError(error as Error);
      // Revert the optimistic update
      await refreshDrawing();
      throw error;
    } finally {
      setIsUpdating(false);
    }
  };
  
  // Delete the drawing
  const removeDrawing = async () => {
    if (!id) return;
    
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteDrawing(id);
      
      // Refresh the project drawings list
      if (data?.projectId) {
        await mutate(
          `/api/projects/${data.projectId}/drawings`,
          undefined,
          { revalidate: true }
        );
      }
    } catch (error) {
      setDeleteError(error as Error);
      throw error;
    } finally {
      setIsDeleting(false);
    }
  };
  
  return {
    drawing: data,
    isLoading,
    isUpdating,
    isDeleting,
    error,
    updateError,
    deleteError,
    refreshDrawing,
    updateDrawing: updateDrawingData,
    deleteDrawing: removeDrawing
  };
}

// Hook for drawing versions
export function useDrawingVersions(drawingId: string) {
  const [isCreating, setIsCreating] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [createError, setCreateError] = useState<Error | null>(null);
  const [restoreError, setRestoreError] = useState<Error | null>(null);
  
  // Fetch drawing versions using SWR
  const { data, error, isLoading, mutate: refreshVersions } = useSWR(
    drawingId ? `/api/drawings/${drawingId}/versions` : null,
    () => drawingId ? fetchDrawingVersions(drawingId) : null
  );
  
  // Create a new version
  const createVersion = async () => {
    if (!drawingId) return;
    
    setIsCreating(true);
    setCreateError(null);
    try {
      const newVersion = await createDrawingVersion(drawingId);
      
      // Update the local cache with the new version
      await refreshVersions();
      
      return newVersion;
    } catch (error) {
      setCreateError(error as Error);
      throw error;
    } finally {
      setIsCreating(false);
    }
  };
  
  // Restore to a version
  const restoreVersion = async (versionId: string) => {
    if (!drawingId) return;
    
    setIsRestoring(true);
    setRestoreError(null);
    try {
      const updatedDrawing = await restoreDrawingVersion(drawingId, versionId);
      
      // Update the drawing data
      await mutate(`/api/drawings/${drawingId}`, updatedDrawing, false);
      
      // Also refresh versions list
      await refreshVersions();
      
      return updatedDrawing;
    } catch (error) {
      setRestoreError(error as Error);
      throw error;
    } finally {
      setIsRestoring(false);
    }
  };
  
  return {
    versions: data || [],
    isLoading,
    isCreating,
    isRestoring,
    error,
    createError,
    restoreError,
    refreshVersions,
    createVersion,
    restoreVersion
  };
}