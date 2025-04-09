// src/hooks/useOrganizations.ts

import useSWR, { mutate } from 'swr';
import { 
  fetchOrganizations, 
  fetchOrganizationById, 
  fetchOrganizationMembers,
  createOrganization, 
  updateOrganization, 
  deleteOrganization,
  inviteMember,
  updateMemberRole,
  removeMember,
  CreateOrganizationInput,
  UpdateOrganizationInput,
  InviteMemberInput,
  UpdateMemberRoleInput
} from 'src/lib/api/organizations';
import { useState } from 'react';
import { Organization } from '@prisma/client';


// Hook for organizations list
export function useOrganizations() {
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<Error | null>(null);
  
  // Fetch organizations using SWR
  const { data, error, isLoading, isValidating, mutate: refreshOrganizations } = useSWR(
    '/api/organizations',
    fetchOrganizations
  );
  
  // Create a new organization
  const addOrganization = async (orgData: CreateOrganizationInput) => {
    setIsCreating(true);
    setCreateError(null);
    try {
      const newOrg = await createOrganization(orgData);
      // Update the local cache with the new organization
      await refreshOrganizations();
      return newOrg;
    } catch (error) {
      setCreateError(error as Error);
      throw error;
    } finally {
      setIsCreating(false);
    }
  };
  
  return {
    organizations: data || [],
    isLoading,
    isCreating,
    error,
    createError,
    refreshOrganizations,
    addOrganization
  };
}

// Hook for a single organization
export function useOrganization(id: string) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [updateError, setUpdateError] = useState<Error | null>(null);
  const [deleteError, setDeleteError] = useState<Error | null>(null);
  
  // Fetch the organization using SWR
  const { data, error, isLoading, mutate: refreshOrganization } = useSWR(
    id ? `/api/organizations/${id}` : null,
    () => id ? fetchOrganizationById(id) : null
  );
  
  // Update the organization
  const updateOrganizationData = async (orgData: Partial<Organization>) => {
    if (!id) return;
    
    setIsUpdating(true);
    setUpdateError(null);
    try {
      // Optimistic update
      await mutate(`/api/organizations/${id}`, 
        { ...data, ...orgData, updatedAt: new Date().toISOString() }, 
        false
      );
      
      // Actual API call
      const updatedOrg = await updateOrganization({ id});
      
      // Refresh the organization data
      await refreshOrganization();
      
      // Also refresh the organizations list
      await mutate('/api/organizations', undefined, { revalidate: true });
      
      return updatedOrg;
    } catch (error) {
      setUpdateError(error as Error);
      // Revert the optimistic update
      await refreshOrganization();
      throw error;
    } finally {
      setIsUpdating(false);
    }
  };
  
  // Delete the organization
  const removeOrganization = async () => {
    if (!id) return;
    
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteOrganization(id);
      
      // Refresh the organizations list
      await mutate('/api/organizations', undefined, { revalidate: true });
    } catch (error) {
      setDeleteError(error as Error);
      throw error;
    } finally {
      setIsDeleting(false);
    }
  };
  
  return {
    organization: data,
    isLoading,
    isUpdating,
    isDeleting,
    error,
    updateError,
    deleteError,
    refreshOrganization,
    updateOrganization: updateOrganizationData,
    deleteOrganization: removeOrganization
  };
}

// Hook for organization members
export function useOrganizationMembers(organizationId: string) {
  const [isInviting, setIsInviting] = useState(false);
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [inviteError, setInviteError] = useState<Error | null>(null);
  const [updateRoleError, setUpdateRoleError] = useState<Error | null>(null);
  const [removeError, setRemoveError] = useState<Error | null>(null);
  
  // Fetch organization members using SWR
  const { data, error, isLoading, mutate: refreshMembers } = useSWR(
    organizationId ? `/api/organizations/${organizationId}/members` : null,
    () => organizationId ? fetchOrganizationMembers(organizationId) : null
  );
  
  // Invite a new member
  const inviteNewMember = async (memberData: InviteMemberInput) => {
    if (!organizationId) return;
    
    setIsInviting(true);
    setInviteError(null);
    try {
      const result = await inviteMember(organizationId, memberData);
      
      // Refresh the members list
      await refreshMembers();
      
      return result;
    } catch (error) {
      setInviteError(error as Error);
      throw error;
    } finally {
      setIsInviting(false);
    }
  };
  
  // Update a member's role
  const updateRole = async (memberData: UpdateMemberRoleInput) => {
    if (!organizationId) return;
    
    setIsUpdatingRole(true);
    setUpdateRoleError(null);
    try {
      const updatedMember = await updateMemberRole(organizationId, memberData);
      
      // Update the local cache
      await refreshMembers();
      
      return updatedMember;
    } catch (error) {
      setUpdateRoleError(error as Error);
      throw error;
    } finally {
      setIsUpdatingRole(false);
    }
  };
  
  // Remove a member from the organization
  const removeMemberFromOrg = async (memberId: string) => {
    if (!organizationId) return;
    
    setIsRemoving(true);
    setRemoveError(null);
    try {
      await removeMember(organizationId, memberId);
      
      // Refresh the members list
      await refreshMembers();
    } catch (error) {
      setRemoveError(error as Error);
      throw error;
    } finally {
      setIsRemoving(false);
    }
  };
  
  return {
    members: data || [],
    isLoading,
    isInviting,
    isUpdatingRole,
    isRemoving,
    error,
    inviteError,
    updateRoleError,
    removeError,
    refreshMembers,
    inviteMember: inviteNewMember,
    updateMemberRole: updateRole,
    removeMember: removeMemberFromOrg
  };
}