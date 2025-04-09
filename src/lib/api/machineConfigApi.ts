// src/lib/api/machineConfigApi.ts

import { fetchWithErrorHandling } from "./apiUtils";

export interface MachineConfigOwner {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

export interface WorkVolume {
  x: number;
  y: number;
  z: number;
}

export interface MachineConfigDetails {
  type: 'mill' | 'lathe' | 'printer' | 'laser';
  maxSpindleSpeed: number;
  maxFeedRate: number;
  workVolume: WorkVolume;
  controller?: string;
  additionalSettings?: Record<string, any>;
}

export interface MachineConfig {
  id: string;
  name: string;
  description?: string | null;
  type: 'mill' | 'lathe' | 'printer' | 'laser';
  config: MachineConfigDetails;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  ownerId: string;
  owner?: MachineConfigOwner;
  isOwner?: boolean;
  usageCount?: number;
  organizationId?: string | null;
}

export interface CreateMachineConfigDto {
  name: string;
  description?: string;
  type: 'mill' | 'lathe' | 'printer' | 'laser';
  config: MachineConfigDetails;
  organizationId?: string;
  isPublic?: boolean;
}

export interface UpdateMachineConfigDto {
  name?: string;
  description?: string | null;
  type?: 'mill' | 'lathe' | 'printer' | 'laser';
  config?: Partial<MachineConfigDetails>;
  isPublic?: boolean;
}

export interface MachineConfigFilters {
  type?: 'mill' | 'lathe' | 'printer' | 'laser';
  search?: string;
  public?: boolean;
  organizationId?: string;
}

interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Get all machine configurations with optional filters
 */
export async function getMachineConfigs(filters?: MachineConfigFilters): Promise<PaginatedResponse<MachineConfig>> {
  const queryParams = new URLSearchParams();
  
  if (filters?.type) queryParams.append('type', filters.type);
  if (filters?.search) queryParams.append('search', filters.search);
  if (filters?.public !== undefined) queryParams.append('public', filters.public.toString());
  if (filters?.organizationId) queryParams.append('organizationId', filters.organizationId);
  
  const url = `/api/machine-configs${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
  return fetchWithErrorHandling(url);
}

/**
 * Get a specific machine configuration by ID
 */
export async function getMachineConfigById(id: string): Promise<MachineConfig> {
  return fetchWithErrorHandling(`/api/machine-configs/${id}`);
}

/**
 * Create a new machine configuration
 */
export async function createMachineConfig(data: CreateMachineConfigDto): Promise<MachineConfig> {
  return fetchWithErrorHandling('/api/machine-configs', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
}

/**
 * Update an existing machine configuration
 */
export async function updateMachineConfig(id: string, data: UpdateMachineConfigDto): Promise<MachineConfig> {
  return fetchWithErrorHandling(`/api/machine-configs/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
}

/**
 * Delete a machine configuration
 */
export async function deleteMachineConfig(id: string): Promise<void> {
  return fetchWithErrorHandling(`/api/machine-configs/${id}`, {
    method: 'DELETE',
  });
}

/**
 * Check if a machine configuration is in use
 */
export async function isMachineConfigInUse(id: string): Promise<{usageCount: number}> {
  return fetchWithErrorHandling(`/api/machine-configs/${id}/usage`);
}

/**
 * Export machine configurations
 */
export async function exportMachineConfigs(ids?: string[], format: 'json' | 'zip' | 'bucket' = 'json'): Promise<any> {
  const queryParams = new URLSearchParams();
  
  if (format) queryParams.append('format', format);
  if (ids && ids.length > 0) {
    ids.forEach(id => queryParams.append('ids', id));
  }
  
  const url = `/api/machine-configs/export-import?${queryParams.toString()}`;
  return fetchWithErrorHandling(url);
}

/**
 * Import machine configurations
 */
export async function importMachineConfigs(
  data: any,
  importMode: 'create' | 'update' | 'skip' = 'create',
  organizationId?: string
): Promise<{imported: number; skipped: number; errors: string[]}> {
  return fetchWithErrorHandling('/api/machine-configs/export-import', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      data,
      importMode,
      organizationId,
    }),
  });
}

/**
 * Clone a machine configuration
 */
export async function cloneMachineConfig(id: string, newName?: string): Promise<MachineConfig> {
  return fetchWithErrorHandling(`/api/machine-configs/${id}/clone`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: newName
    }),
  });
}

/**
 * Share a machine configuration (update public status)
 */
export async function shareMachineConfig(id: string, isPublic: boolean): Promise<MachineConfig> {
  return updateMachineConfig(id, { isPublic });
}

/**
 * Get machine configuration storage content
 */
export async function getMachineConfigStorage(id: string): Promise<any> {
  return fetchWithErrorHandling(`/api/machine-configs/${id}/storage`);
}

/**
 * Save machine configuration data to storage
 */
export async function saveMachineConfigToStorage(id: string, data: any): Promise<{storagePath: string}> {
  return fetchWithErrorHandling(`/api/machine-configs/${id}/storage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
}

/**
 * Delete machine configuration storage
 */
export async function deleteMachineConfigStorage(id: string): Promise<void> {
  return fetchWithErrorHandling(`/api/machine-configs/${id}/storage`, {
    method: 'DELETE',
  });
}