// src/lib/api/apiHandler.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { ZodError } from 'zod';

export type ApiHandler = (
  req: NextApiRequest,
  res: NextApiResponse
) => Promise<void>;

/**
 * Wrapper that provides:
 * - Consistent error handling
 * - Request logging
 * - Global error catching
 */
export function withErrorHandling(handler: ApiHandler): ApiHandler {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const startTime = Date.now();
    
    // Set default headers
    res.setHeader('Content-Type', 'application/json');
    
    try {
      await handler(req, res);
      
      // Log request duration in development
      if (process.env.NODE_ENV === 'development') {
        const duration = Date.now() - startTime;
        console.log(`${req.method} ${req.url} - ${res.statusCode} - ${duration}ms`);
      }
    } catch (error) {
      // Handle Zod validation errors
      if (error instanceof ZodError) {
        const errors = error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message
        }));
        
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: errors
          }
        });
      }
      
      // Handle known application errors
      if (error instanceof AppApiError) {
        return res.status(error.statusCode).json({
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details
          }
        });
      }
      
      // Log the error
      console.error('API Error:', error);
      
      // Return generic error in production
      const message = process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred'
        : error instanceof Error ? error.message : 'Unknown error';
      
      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message
        }
      });
    }
  };
}

/**
 * Custom application error class
 */
export class AppApiError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code: string = 'INTERNAL_ERROR',
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppApiError';
  }
}

/**
 * Helper to create error responses
 */
export function errorResponse(
  res: NextApiResponse,
  message: string,
  statusCode: number = 400,
  code?: string
) {
  return res.status(statusCode).json({
    success: false,
    error: {
      code: code || 'ERROR',
      message
    }
  });
}

/**
 * Helper to create success responses
 */
export function successResponse<T>(
  res: NextApiResponse,
  data: T,
  statusCode: number = 200
) {
  return res.status(statusCode).json({
    success: true,
    data
  });
}

/**
 * Validate request body with Zod schema
 */
export function validateBody<T>(
  schema: z.ZodSchema<T>,
  body: unknown
): { valid: true; data: T } | { valid: false; error: string } {
  try {
    const data = schema.parse(body);
    return { valid: true, data };
  } catch (error) {
    if (error instanceof ZodError) {
      const messages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
      return { valid: false, error: messages.join(', ') };
    }
    return { valid: false, error: 'Invalid data' };
  }
}

import { z } from 'zod';
