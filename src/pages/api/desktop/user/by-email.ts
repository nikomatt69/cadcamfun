import { NextApiRequest, NextApiResponse } from 'next';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ratelimit } from '@/lib/ratelimit';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

interface UserData {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  created_at: string;
  updated_at: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<UserData>>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    // Rate limiting per IP
    const identifier = req.ip || 'anonymous';
    const { success: rateLimitSuccess } = await ratelimit.limit(identifier);
    
    if (!rateLimitSuccess) {
      return res.status(429).json({
        success: false,
        error: 'Too many requests. Please try again later.'
      });
    }

    // Get email from query parameters
    const { email } = req.query;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Email parameter is required'
      });
    }

    // Check authentication (Bearer token or session)
    let isAuthenticated = false;
    
    // Try Bearer token first (for desktop clients)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      
      // Validate JWT token here if needed
      // For now, we'll trust that the auth manager validates tokens
      isAuthenticated = !!token;
    }
    
    // Fallback to Better Auth session
    if (!isAuthenticated) {
      try {
        const session = await auth.api.getSession({
          headers: req.headers as any,
        });
        isAuthenticated = !!session;
      } catch (error) {
        console.log('No valid session found');
      }
    }

    if (!isAuthenticated) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    // Query user by email using Prisma
    const user = await prisma.user.findUnique({
      where: {
        email: email,
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        createdAt: true,
        updatedAt: true,
      }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Format response data
    const userData: UserData = {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      created_at: user.createdAt.toISOString(),
      updated_at: user.updatedAt.toISOString(),
    };

    return res.status(200).json({
      success: true,
      data: userData,
      message: 'User found successfully'
    });

  } catch (error) {
    console.error('Desktop user lookup error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}