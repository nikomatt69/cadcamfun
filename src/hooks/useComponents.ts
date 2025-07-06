// src/hooks/useComponents.ts

import useSWR, { mutate } from "swr";
import {
  fetchComponents,
  fetchProjectComponents,
  fetchComponentById,
  createComponent,
  createProjectComponent,
  updateComponent,
  deleteComponent,
  CreateComponentInput,
  ComponentData
} from "src/lib/api/components";
import { useState } from "react";
import { Component } from "../types/mainTypes";

// Hook for components list
export function useComponents(filters?: { projectId?: string; type?: string; search?: string }) {
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<Error | null>(null);

  // Create the cache key based on filters
  const getKey = () => {
    const key = "/api/components";
    if (!filters) return key;

    const params: string[] = [];
    if (filters.projectId) params.push(`projectId=${filters.projectId}`);
    if (filters.type) params.push(`type=${filters.type}`);
    if (filters.search) params.push(`search=${filters.search}`);

    return params.length ? `${key}?${params.join("&")}` : key;
  };

  // Fetch components using SWR with ottimizzazioni anti-spam
  const {
    data,
    error,
    isLoading,
    isValidating,
    mutate: refreshComponents
  } = useSWR(getKey(), () => fetchComponents(filters), {
    // Configurazioni per ridurre le richieste
    revalidateOnFocus: false, // Non ricaricare al focus della finestra
    revalidateOnReconnect: false, // Non ricaricare alla riconnessione
    revalidateIfStale: false, // Non rivalidare se stale
    dedupingInterval: 10 * 60 * 1000, // Deduplicazione per 10 minuti
    focusThrottleInterval: 5 * 60 * 1000, // Throttle focus events
    errorRetryCount: 2, // Massimo 2 retry
    errorRetryInterval: 5000, // 5 secondi tra i retry
  });

  // Create a new component
  const addComponent = async (componentData: ComponentData) => {
    setIsCreating(true);
    setCreateError(null);
    try {
      const newComponent = await createComponent(componentData);
      // Update the local cache with the new component
      await refreshComponents();
      return newComponent;
    } catch (error) {
      setCreateError(error as Error);
      throw error;
    } finally {
      setIsCreating(false);
    }
  };

  return {
    components: data || [],
    isLoading,
    isCreating,
    error,
    createError,
    refreshComponents,
    addComponent
  };
}

// Hook for a project's components
export function useProjectComponents(projectId: string) {
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<Error | null>(null);

  // Fetch project components using SWR with ottimizzazioni
  const {
    data,
    error,
    isLoading,
    isValidating,
    mutate: refreshComponents
  } = useSWR(
    projectId ? `/api/projects/${projectId}/components` : null, 
    () => projectId ? fetchProjectComponents(projectId) : null,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      dedupingInterval: 10 * 60 * 1000,
      errorRetryCount: 2,
      errorRetryInterval: 5000,
    }
  );

  // Create a new component in the project
  const addComponent = async (componentData: Omit<CreateComponentInput, "projectId">) => {
    if (!projectId) return;

    setIsCreating(true);
    setCreateError(null);
    try {
      const newComponent = await createProjectComponent(projectId, componentData);
      // Update the local cache with the new component
      await refreshComponents();
      return newComponent;
    } catch (error) {
      setCreateError(error as Error);
      throw error;
    } finally {
      setIsCreating(false);
    }
  };

  return {
    components: data || [],
    isLoading,
    isCreating,
    error,
    createError,
    refreshComponents,
    addComponent
  };
}

// Hook for a single component
export function useComponent(id: string) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [updateError, setUpdateError] = useState<Error | null>(null);
  const [deleteError, setDeleteError] = useState<Error | null>(null);

  // Fetch the component using SWR with ottimizzazioni
  const {
    data,
    error,
    isLoading,
    mutate: refreshComponent
  } = useSWR(
    id ? `/api/components/${id}` : null, 
    () => (id ? fetchComponentById(id) : null),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      dedupingInterval: 15 * 60 * 1000, // 15 minuti per singoli componenti
      errorRetryCount: 2,
      errorRetryInterval: 5000,
    }
  );

  // Update the component
  const updateComponentData = async (componentData: Partial<Component>) => {
    if (!id) return;

    setIsUpdating(true);
    setUpdateError(null);
    try {
      // Optimistic update
      await mutate(`/api/components/${id}`, { ...data, ...componentData, updatedAt: new Date().toISOString() }, false);

      // Actual API call
      const updatedComponent = await updateComponent({ id });

      // Refresh the component data
      await refreshComponent();

      // Also refresh the components list
      await mutate(key => typeof key === "string" && key.startsWith("/api/components"), undefined, {
        revalidate: true
      });

      return updatedComponent;
    } catch (error) {
      setUpdateError(error as Error);
      // Revert the optimistic update
      await refreshComponent();
      throw error;
    } finally {
      setIsUpdating(false);
    }
  };

  // Delete the component
  const removeComponent = async () => {
    if (!id) return;

    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteComponent(id);

      // Refresh any components lists
      await mutate(key => typeof key === "string" && key.startsWith("/api/components"), undefined, {
        revalidate: true
      });

      // Also refresh any project components lists
      if (data?.projectId) {
        await mutate(`/api/projects/${data.projectId}/components`, undefined, { revalidate: true });
      }
    } catch (error) {
      setDeleteError(error as Error);
      throw error;
    } finally {
      setIsDeleting(false);
    }
  };

  return {
    component: data,
    isLoading,
    isUpdating,
    isDeleting,
    error,
    updateError,
    deleteError,
    refreshComponent,
    updateComponent: updateComponentData,
    deleteComponent: removeComponent
  };
}
