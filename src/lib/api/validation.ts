// src/lib/api/validation.ts
import { z } from 'zod';

export function validateNumber(value: any, defaultValue: number = 0): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? defaultValue : parsed;
  }
  return defaultValue;
}

export function validateBoolean(value: any, defaultValue: boolean = false): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return defaultValue;
}

// Project validation schemas
export const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(100, 'Name too long'),
  description: z.string().max(500, 'Description too long').optional(),
  organizationId: z.string().optional(),
  isPublic: z.boolean().optional()
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  isPublic: z.boolean().optional()
});

// Component validation schemas
export const createComponentSchema = z.object({
  name: z.string().min(1, 'Component name is required').max(100),
  description: z.string().max(500).optional(),
  data: z.any(),
  type: z.string().optional(),
  isPublic: z.boolean().optional(),
  projectId: z.string().optional()
});

// Toolpath validation schemas
export const createToolpathSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  data: z.any(),
  type: z.string().optional(),
  operationType: z.string().optional(),
  projectId: z.string(),
  drawingId: z.string().optional(),
  materialId: z.string().optional(),
  toolId: z.string().optional(),
  machineConfigId: z.string().optional()
});

// Drawing validation schemas
export const createDrawingSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  data: z.any(),
  thumbnail: z.string().optional(),
  projectId: z.string()
});

// Material validation schemas
export const createMaterialSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  type: z.string().optional(),
  density: z.number().positive().optional(),
  hardness: z.number().positive().optional(),
  isPublic: z.boolean().optional()
});

// Tool validation schemas
export const createToolSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.string().optional(),
  diameter: z.number().positive().optional(),
  material: z.string().optional(),
  flutes: z.number().int().positive().optional(),
  cuttingLength: z.number().positive().optional(),
  totalLength: z.number().positive().optional(),
  maxRPM: z.number().positive().optional(),
  isPublic: z.boolean().optional()
});

// Organization validation schemas
export const createOrganizationSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional()
});

// User validation schemas
export const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  image: z.string().url().optional()
});

// Validation helper function
export function validateRequest<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  
  if (result.success) {
    return { success: true, data: result.data };
  }
  
  const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
  return { success: false, error: errors.join(', ') };
}

// Pagination validation
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20)
});

export type PaginationParams = z.infer<typeof paginationSchema>;
