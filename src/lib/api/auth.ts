// src/lib/api/auth.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { getToken } from 'next-auth/jwt';
import { getSession } from 'next-auth/react';

type AuthResult = {
  userId: string | null;
  authenticated: boolean;
};

/**
 * Middleware to check authentication and extract the user ID
 */
export async function ensureAuthenticated(
  req: NextApiRequest, 
  res: NextApiResponse,
  sessionGetter = getSession
): Promise<AuthResult> {
  try {
    // Try to get session first
    const session = await sessionGetter({ req });
    
    if (session && session.user && session.user.id) {
      return { 
        authenticated: true,
        userId: session.user.id 
      };
    }
    
    // If no session, try JWT token
    const token = await getToken({ 
      req, 
      secret: process.env.NEXTAUTH_SECRET 
    });
    
    if (token && token.id) {
      return { 
        authenticated: true,
        userId: token.id as string 
      };
    }
    
    // No authentication found
    return { authenticated: false, userId: null };
  } catch (error) {
    console.error("Authentication error:", error);
    return { authenticated: false, userId: null };
  }
}

/**
 * Middleware to require authentication for API routes
 * Returns userId if authenticated, otherwise sends a 401 response
 */
export async function requireAuth(
  req: NextApiRequest, 
  res: NextApiResponse
): Promise<string | null> {
  const { authenticated, userId } = await ensureAuthenticated(req, res);
  
  if (!authenticated) {
    res.status(401).json({ 
      success: false, 
      message: 'Authentication required' 
    });
    return null;
  }
  
  return userId;
}

/**
 * Helper for API response handling
 */
export function sendSuccessResponse(
  res: NextApiResponse,
  data: any,
  message?: string
) {
  return res.status(200).json({
    success: true,
    data,
    message
  });
}

/**
 * Helper for error response handling
 */
export function sendErrorResponse(
  res: NextApiResponse,
  message: string,
  statusCode: number = 400
) {
  return res.status(statusCode).json({
    success: false,
    message
  });
}

/**
 * Helper for API error handling
 */
export function handleApiError(error: any, res: NextApiResponse) {
  console.error('API Error:', error);
  
  if (error.code === 'P2025') {
    return sendErrorResponse(res, 'Record not found', 404);
  }
  
  return sendErrorResponse(
    res, 
    error.message || 'An unexpected error occurred', 
    500
  );
}