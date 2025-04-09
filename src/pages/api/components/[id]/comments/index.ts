// src/pages/api/components/[id]/comments/index.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from 'next-auth/react';
import { prisma } from 'src/lib/prisma';
import { sendErrorResponse, sendSuccessResponse, handleApiError } from 'src/lib/api/helpers';
import { requireAuth } from '@/src/lib/api/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Ensure user is authenticated
    const userId = await requireAuth(req, res);
    if (!userId) return;
    
    const { id } = req.query;
    
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ message: 'Component ID is required' });
    }
    
    // Fetch component to ensure access
    const component = await prisma.component.findFirst({
      where: {
        id,
        OR: [
          { project: { ownerId: userId } },
          { project: { organization: { users: { some: { userId } } } } },
          { isPublic: true }
        ]
      }
    });
    
    if (!component) {
      return sendErrorResponse(res, 'Component not found or access denied', 404);
    }
    
    // Handle GET request - Get comments
    if (req.method === 'GET') {
      const comments = await prisma.componentComment.findMany({
        where: { componentId: id },
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, name: true, email: true, image: true }
          }
        }
      });
      
      return sendSuccessResponse(res, comments);
    }
    
    // Handle POST request - Add comment
    if (req.method === 'POST') {
      const { content } = req.body;
      
      if (!content || content.trim() === '') {
        return sendErrorResponse(res, 'Comment content is required', 400);
      }
      
      const newComment = await prisma.componentComment.create({
        data: {
          componentId: id,
          content,
          userId
        },
        include: {
          user: {
            select: { id: true, name: true, email: true, image: true }
          }
        }
      });
      
      return sendSuccessResponse(res, newComment, 'Comment added successfully');
    }
    
    // Handle unsupported methods
    return sendErrorResponse(res, 'Method not allowed', 405);
  } catch (error) {
    return handleApiError(error, res);
  }
}