// src/lib/api/projects.ts

import { Project } from "@prisma/client";



export interface CreateProjectInput {
  name: string;
  description?: string;
  organizationId?: string;
}

export interface UpdateProjectInput extends Partial<CreateProjectInput> {
  id: string;
}

// Fetch all projects
export const fetchProjects = async (): Promise<Project[]> => {
  try {
    const response = await fetch('/api/projects');
    
    if (!response.ok) {
      throw new Error('Failed to fetch projects');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching projects:', error);
    throw error;
  }
};

// Fetch projects for an organization
export const fetchOrganizationProjects = async (organizationId: string): Promise<Project[]> => {
  try {
    const response = await fetch(`/api/organizations/${organizationId}/projects`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch organization projects');
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error fetching projects for organization ${organizationId}:`, error);
    throw error;
  }
};

// Fetch a single project by ID
export const fetchProjectById = async (id: string): Promise<Project> => {
  try {
    const response = await fetch(`/api/projects/${id}`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch project');
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error fetching project ${id}:`, error);
    throw error;
  }
};

// Create a new project
export const createProject = async (projectData: CreateProjectInput): Promise<Project> => {
  try {
    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(projectData),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to create project');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error creating project:', error);
    throw error;
  }
};

// Update an existing project
export const updateProject = async ({ id, ...projectData }: UpdateProjectInput): Promise<Project> => {
  try {
    const response = await fetch(`/api/projects/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(projectData),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to update project');
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error updating project ${id}:`, error);
    throw error;
  }
};

// Delete a project
export const deleteProject = async (id: string): Promise<void> => {
  try {
    const response = await fetch(`/api/projects/${id}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to delete project');
    }
  } catch (error) {
    console.error(`Error deleting project ${id}:`, error);
    throw error;
  }
};

// src/lib/api/projects.ts

