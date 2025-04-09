// src/lib/api/organizations.ts

import { Organization } from "@prisma/client";


export interface CreateOrganizationInput {
  name: string;
  description?: string;
}

export interface UpdateOrganizationInput extends Partial<CreateOrganizationInput> {
  id: string;
}

export interface InviteMemberInput {
  email: string;
  role: 'ADMIN' | 'MANAGER' | 'MEMBER';
}

export interface UpdateMemberRoleInput {
  memberId: string;
  role: 'ADMIN' | 'MANAGER' | 'MEMBER';
}

// Fetch all organizations
export const fetchOrganizations = async (): Promise<Organization[]> => {
  try {
    const response = await fetch('/api/organizations');
    
    if (!response.ok) {
      throw new Error('Failed to fetch organizations');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching organizations:', error);
    throw error;
  }
};

// Fetch a single organization by ID
export const fetchOrganizationById = async (id: string): Promise<Organization> => {
  try {
    const response = await fetch(`/api/organizations/${id}`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch organization');
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error fetching organization ${id}:`, error);
    throw error;
  }
};

// Create a new organization
export const createOrganization = async (data: CreateOrganizationInput): Promise<Organization> => {
  try {
    const response = await fetch('/api/organizations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to create organization');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error creating organization:', error);
    throw error;
  }
};

// Update an existing organization
export const updateOrganization = async ({ id, ...data }: UpdateOrganizationInput): Promise<Organization> => {
  try {
    const response = await fetch(`/api/organizations/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to update organization');
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error updating organization ${id}:`, error);
    throw error;
  }
};

// Delete an organization
export const deleteOrganization = async (id: string): Promise<void> => {
  try {
    const response = await fetch(`/api/organizations/${id}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to delete organization');
    }
  } catch (error) {
    console.error(`Error deleting organization ${id}:`, error);
    throw error;
  }
};

// Fetch members of an organization
export const fetchOrganizationMembers = async (organizationId: string): Promise<Organization[]> => {
  try {
    const response = await fetch(`/api/organizations/${organizationId}/members`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch organization members');
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error fetching members for organization ${organizationId}:`, error);
    throw error;
  }
};

// Invite a new member to an organization
export const inviteMember = async (organizationId: string, data: InviteMemberInput): Promise<any> => {
  try {
    const response = await fetch(`/api/organizations/${organizationId}/invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to invite member');
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error inviting member to organization ${organizationId}:`, error);
    throw error;
  }
};

// Update a member's role in an organization
export const updateMemberRole = async (organizationId: string, data: UpdateMemberRoleInput): Promise<Organization> => {
  try {
    const response = await fetch(`/api/organizations/${organizationId}/members`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to update member role');
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error updating member role in organization ${organizationId}:`, error);
    throw error;
  }
};

// Remove a member from an organization
export const removeMember = async (organizationId: string, memberId: string): Promise<void> => {
  try {
    const response = await fetch(`/api/organizations/${organizationId}/members`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ memberId }),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to remove member');
    }
  } catch (error) {
    console.error(`Error removing member from organization ${organizationId}:`, error);
    throw error;
  }
};