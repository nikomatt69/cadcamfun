import { User } from '@prisma/client';

export type MachineType = 'mill' | 'lathe' | 'printer' | 'laser';

export interface WorkVolume {
  x: number;
  y: number;
  z: number;
}

export interface MachineConfigDetails {
  workVolume: WorkVolume;
  maxSpindleSpeed: number;
  maxFeedRate: number;
  controller?: string;
  additionalSettings?: Record<string, any>;
}

export interface MachineConfigOwner {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

export interface MachineConfig {
  id: string;
  name: string;
  description: string | null;
  type: MachineType;
  config: MachineConfigDetails;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
  ownerId: string;
  organizationId: string | null;
  owner?: MachineConfigOwner;
  isOwner?: boolean;
  usageCount?: number;
}

export interface CreateMachineConfigDto {
  name: string;
  description?: string;
  type: MachineType;
  config: MachineConfigDetails;
  organizationId?: string;
  isPublic?: boolean;
}

export interface UpdateMachineConfigDto {
  name?: string;
  description?: string | null;
  type?: MachineType;
  config?: Partial<MachineConfigDetails>;
  isPublic?: boolean;
}

export interface MachineConfigFilters {
  type?: MachineType;
  search?: string;
  public?: boolean;
  organizationId?: string;
  page?: number;
  limit?: number;
  sortBy?: keyof MachineConfig;
  sortOrder?: 'asc' | 'desc';
} 