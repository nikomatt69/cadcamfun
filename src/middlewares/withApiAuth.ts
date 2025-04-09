import { NextApiRequest, NextApiResponse } from 'next';
import { getToken } from 'next-auth/jwt';

/**
 * Middleware to protect API routes that require authentication
 */
export function withApiAuth(handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    try {
      // Get token from the session
      const token = await getToken({ 
        req, 
        secret: process.env.NEXTAUTH_SECRET
      });
      
      // If no token exists, user is not authenticated
      if (!token) {
        return res.status(401).json({ 
          success: false, 
          message: 'Authentication required' 
        });
      }
      
      // Add user ID to the request for downstream handlers
      req.userId = token.id as string;
      
      // Call the original handler
      return handler(req, res);
    } catch (error) {
      console.error('Authentication error:', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Internal server error during authentication'
      });
    }
  };
}

// Extend the NextApiRequest interface to include userId
declare module 'next' {
  interface NextApiRequest {
    userId?: string;
  }
}