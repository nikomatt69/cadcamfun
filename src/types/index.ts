// src/types/index.ts
// TypeScript Type Definitions - Enterprise Level

// Re-export from existing type files
export * from './cad';
export * from './component';
export * from './ai';
export * from './AITypes';
export * from './mainTypes';
export * from './models';

// Re-export from stores for convenience
export type { Element, Point, AIDesignSuggestion } from '../store/elementsStore';
export type { Layer, LayerSettings } from '../store/layerStore';
export type { ViewMode, ToolType, WorkpieceConfig } from '../store/cadStore';

// Additional Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export type CreateInput<T> = Omit<T, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateInput<T> = Partial<Omit<T, 'id' | 'createdAt' | 'updatedAt'>>;
export type WhereInput<T> = Partial<Record<keyof T, unknown>>;

export interface FilterOptions {
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface SortOption {
  field: string;
  order: 'asc' | 'desc';
}
