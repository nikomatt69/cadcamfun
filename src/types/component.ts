// src/types/component.ts
import { z } from 'zod';

/**
 * Comprehensive type definitions for the component system
 * These types are designed to be used across the entire application
 * to ensure consistency between frontend and backend
 */

// Element Types - Base types for all component elements
export interface BaseElement {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  z: number;
  layerId: string;
  description?: string;
}

// Common shape properties
export interface ShapeElement extends BaseElement {
  color: string;
  depth: number;
  width: number;
  height: number;
  radius: number;
  rotation?: {
    x: number;
    y: number;
    z: number;
  };
}

// Specific element types
export interface CylinderElement extends ShapeElement {
  type: 'cylinder';
}

export interface CubeElement extends ShapeElement {
  type: 'cube';
}

export interface RectangleElement extends ShapeElement {
  type: 'rectangle';
}

export interface LineElement extends BaseElement {
  type: 'line';
  color: string;
  linewidth: number;
  x1: number;
  y1: number;
  z1: number;
  x2: number;
  y2: number;
  z2: number;
}

// Union type for all possible elements
export type ComponentElement = 
  | CylinderElement 
  | CubeElement 
  | RectangleElement 
  | LineElement 
  | (BaseElement & Record<string, any>); // Allow for extensibility

// Component metadata
export interface ComponentMetadata {
  createdAt: string;
  isComposite?: boolean;
  elementCount?: number;
  elementTypes?: string[];
  [key: string]: any; // Allow for extensibility
}

// Component geometry
export interface ComponentGeometry {
  type: string;
  elements: any[];
  [key: string]: any; // Allow for extensibility
}

// Main component data structure
export interface ComponentData {
  id?: string;
  name: string;
  type: string;
  version?: string;
  elements?: ComponentElement[];
  geometry?: ComponentGeometry;
  metadata?: ComponentMetadata;
  properties?: Record<string, any>;
  [key: string]: any; // Allow for extensibility with any other fields
}

// Complete component structure (matching Prisma model)
export interface Component {
  id: string;
  name: string;
  description?: string | null;
  data: ComponentData;
  thumbnail?: string | null;
  type?: string | null;
  isPublic: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
  projectId: string;
  project?: {
    id: string;
    name: string;
    ownerId: string;
  };
}

// Type for component version
export interface ComponentVersion {
  id: string;
  componentId: string;
  data: ComponentData;
  changeMessage?: string | null;
  userId: string;
  createdAt: Date | string;
  user?: {
    name?: string | null;
    email?: string | null;
  };
}

// Create/update input types 
export interface CreateComponentInput {
  name: string;
  description?: string | null;
  data: ComponentData | Record<string, any>;
  type?: string;
  projectId: string;
  isPublic?: boolean;
  thumbnail?: string | null;
}

export interface UpdateComponentInput {
  id: string;
  name?: string;
  description?: string | null;
  data?: ComponentData | Record<string, any>;
  type?: string;
  isPublic?: boolean;
  thumbnail?: string | null;
}

// Zod schemas for validation

// Base element schema - shared properties
export const baseElementSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  x: z.number(),
  y: z.number(),
  z: z.number(),
  layerId: z.string(),
  description: z.string().optional(),
});

// Shape element schema - extends base with common shape properties
export const shapeElementSchema = baseElementSchema.extend({
  color: z.string(),
  depth: z.number(),
  width: z.number(),
  height: z.number(),
  radius: z.number(),
  rotation: z.object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
  }).optional(),
});

// Specific element schemas
export const cylinderElementSchema = shapeElementSchema.extend({
  type: z.literal('cylinder'),
});

export const cubeElementSchema = shapeElementSchema.extend({
  type: z.literal('cube'),
});

export const rectangleElementSchema = shapeElementSchema.extend({
  type: z.literal('rectangle'),
});

export const lineElementSchema = baseElementSchema.extend({
  type: z.literal('line'),
  color: z.string(),
  linewidth: z.number(),
  x1: z.number(),
  y1: z.number(),
  z1: z.number(),
  x2: z.number(),
  y2: z.number(),
  z2: z.number(),
});

// Component element schema (union of all element types)
export const componentElementSchema = z.union([
  cylinderElementSchema,
  cubeElementSchema,
  rectangleElementSchema,
  lineElementSchema,
  // Fallback for any other type
  baseElementSchema.catchall(z.any()),
]);

// Component data schema
export const componentDataSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  type: z.string(),
  version: z.string().optional(),
  elements: z.array(componentElementSchema).optional(),
  geometry: z.object({
    type: z.string(),
    elements: z.array(z.any()),
  }).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  properties: z.record(z.string(), z.any()).optional(),
}).catchall(z.any());

// Create component input schema
export const createComponentSchema = z.object({
  name: z.string(),
  description: z.string().optional().nullable(),
  data: componentDataSchema.or(z.record(z.string(), z.any())),
  type: z.string().optional(),
  projectId: z.string(),
  isPublic: z.boolean().optional(),
  thumbnail: z.string().optional().nullable(),
});

// Update component input schema
export const updateComponentSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional().nullable(),
  data: componentDataSchema.or(z.record(z.string(), z.any())).optional(),
  type: z.string().optional(),
  isPublic: z.boolean().optional(),
  thumbnail: z.string().optional().nullable(),
});

/**
 * Helper functions for working with components
 */

// Validate and normalize component data
export function validateComponentData(data: unknown): { valid: boolean; data?: ComponentData; errors?: string[] } {
  try {
    const result = componentDataSchema.safeParse(data);
    
    if (result.success) {
      return { valid: true, data: normalizeComponentData(result) };
    } else {
      return { 
        valid: false, 
        errors: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`) 
      };
    }
  } catch (error) {
    return { 
      valid: false, 
      errors: [error instanceof Error ? error.message : 'Unknown validation error'] 
    };
  }
}

// Ensure component has all required fields
export function normalizeComponentData(data: Partial<ComponentData>): ComponentData {
  return {
    id: data.id || '',
    name: data.name || 'Unnamed Component',
    type: data.type || 'custom',
    version: data.version || '1.0',
    elements: data.elements || [],
    geometry: data.geometry || { type: 'custom', elements: [] },
    metadata: data.metadata || { 
      createdAt: new Date().toISOString() 
    },
    properties: data.properties || {},
    ...data
  };
}

// Format component for UI display
export function formatComponentForDisplay(component: Component): Component {
  return {
    ...component,
    createdAt: formatDateValue(component.createdAt),
    updatedAt: formatDateValue(component.updatedAt),
    data: component.data || {}
  };
}

// Helper to handle various date formats
function formatDateValue(value: string | Date): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  
  if (typeof value === 'string') {
    try {
      return new Date(value).toISOString();
    } catch (e) {
      return value;
    }
  }
  
  return String(value);
}