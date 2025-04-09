// src/lib/api/machineConfigApi.ts
import axios from 'axios';

// Create axios instance with default headers
const api = axios.create({
  headers: {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  }
});

export interface MachineConfigData {
  name: string;
  description?: string;
  type: 'mill' | 'lathe' | 'printer' | 'laser';
  config: {
    workVolume?: {
      x: number;
      y: number;
      z: number;
    };
    maxSpindleSpeed?: number;
    maxFeedRate?: number;
    [key: string]: any;
  };
}

export interface MachineConfig extends MachineConfigData {
  id: string;
  createdAt: string;
  updatedAt: string;
}

// Get all machine configs
export const getMachineConfigs = async (): Promise<MachineConfig[]> => {
  const response = await api.get('/api/machine-configs');
  return response.data;
};

// Get a single machine config
export const getMachineConfig = async (id: string): Promise<MachineConfig> => {
  const response = await api.get(`/api/machine-configs/${id}`);
  return response.data;
};

// Create a new machine config
export const createMachineConfig = async (data: MachineConfigData): Promise<MachineConfig> => {
  const response = await api.post('/api/machine-configs', data);
  return response.data;
};

// Update a machine config
export const updateMachineConfig = async (id: string, data: MachineConfigData): Promise<MachineConfig> => {
  const response = await api.put(`/api/machine-configs/${id}`, data);
  return response.data;
};

// Delete a machine config
export const deleteMachineConfig = async (id: string): Promise<void> => {
  await api.delete(`/api/machine-configs/${id}`);
};