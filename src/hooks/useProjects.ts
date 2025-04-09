// src/hooks/useProjects.ts

import useSWR, { mutate } from 'swr';
import { 
  fetchProjects, 
  fetchOrganizationProjects,
  fetchProjectById, 
  createProject, 
  updateProject, 
  deleteProject,
  CreateProjectInput,
  UpdateProjectInput
} from 'src/lib/api/projects';
import { useState } from 'react';


import { Project } from "@prisma/client";
// Hook for projects list
export function useProjects() {
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<Error | null>(null);
  
  // Fetch projects using SWR
  const { data, error, isLoading, isValidating, mutate: refreshProjects } = useSWR(
    '/api/projects',
    fetchProjects
  );
  
  // Create a new project
  const addProject = async (projectData: CreateProjectInput) => {
    setIsCreating(true);
    setCreateError(null);
    try {
      const newProject = await createProject(projectData);
      // Update the local cache with the new project
      await refreshProjects();
      
      // Also refresh organization projects if this is an org project
      if (projectData.organizationId) {
        await mutate(
          `/api/organizations/${projectData.organizationId}/projects`,
          undefined,
          { revalidate: true }
        );
      }
      
      return newProject;
    } catch (error) {
      setCreateError(error as Error);
      throw error;
    } finally {
      setIsCreating(false);
    }
  };
  
  return {
    projects: data || [],
    isLoading,
    isCreating,
    error,
    createError,
    refreshProjects,
    addProject
  };
}

// Hook for organization projects
export function useOrganizationProjects(organizationId: string) {
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<Error | null>(null);
  
  // Fetch organization projects using SWR
  const { data, error, isLoading, isValidating, mutate: refreshProjects } = useSWR(
    organizationId ? `/api/organizations/${organizationId}/projects` : null,
    () => organizationId ? fetchOrganizationProjects(organizationId) : null
  );
  
  // Create a new project in the organization
  const addProject = async (projectData: Omit<CreateProjectInput, 'organizationId'>) => {
    if (!organizationId) return;
    
    setIsCreating(true);
    setCreateError(null);
    try {
      const newProject = await createProject({
        ...projectData,
        organizationId
      });
      
      // Update the local cache with the new project
      await refreshProjects();
      
      // Also refresh all projects
      await mutate('/api/projects', undefined, { revalidate: true });
      
      return newProject;
    } catch (error) {
      setCreateError(error as Error);
      throw error;
    } finally {
      setIsCreating(false);
    }
  };
  
  return {
    projects: data || [],
    isLoading,
    isCreating,
    error,
    createError,
    refreshProjects,
    addProject
  };
}

// Hook for a single project
export function useProject(id: string) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [updateError, setUpdateError] = useState<Error | null>(null);
  const [deleteError, setDeleteError] = useState<Error | null>(null);
  
  // Fetch the project using SWR
  const { data, error, isLoading, mutate: refreshProject } = useSWR(
    id ? `/api/projects/${id}` : null,
    () => id ? fetchProjectById(id) : null
  );
  
  // Update the project
  const updateProjectData = async (projectData: Partial<Project>) => {
    if (!id) return;
    
    setIsUpdating(true);
    setUpdateError(null);
    try {
      // Optimistic update
      await mutate(`/api/projects/${id}`, 
        { ...data, ...projectData, updatedAt: new Date().toISOString() }, 
        false
      );
      
      // Actual API call
      const updatedProject = await updateProject({ id});
      
      // Refresh the project data
      await refreshProject();
      
      // Also refresh the projects list
      await mutate('/api/projects', undefined, { revalidate: true });
      
      // Also refresh organization projects if this is an org project
      if (data) {
        await mutate(
          `/api/organizations/${data.id}/projects`,
          undefined,
          { revalidate: true }
        );
      }
      
      return updatedProject;
    } catch (error) {
      setUpdateError(error as Error);
      // Revert the optimistic update
      await refreshProject();
      throw error;
    } finally {
      setIsUpdating(false);
    }
  };
  
  // Delete the project
  const removeProject = async () => {
    if (!id) return;
    
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteProject(id);
      
      // Refresh the projects list
      await mutate('/api/projects', undefined, { revalidate: true });
      
      // Also refresh organization projects if this is an org project
      if (data) {
        await mutate(
          `/api/organizations/${data.id}/projects`,
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
    project: data,
    isLoading,
    isUpdating,
    isDeleting,
    error,
    updateError,
    deleteError,
    refreshProject,
    updateProject: updateProjectData,
    deleteProject: removeProject
  };
}