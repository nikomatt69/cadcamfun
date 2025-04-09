// src/pages/api/toolpaths/[id]/comments/index.ts
import { NextApiRequest, NextApiResponse } from 'next';
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
      return res.status(400).json({ message: 'Toolpath ID is required' });
    }
    
    // Fetch toolpath to ensure access
    const toolpath = await prisma.toolpath.findFirst({
      where: {
        id,
        OR: [
          { createdBy: userId },
          { project: { organization: { users: { some: { userId } } } } },
          { isPublic: true }
        ]
      }
    });
    
    if (!toolpath) {
      return sendErrorResponse(res, 'Toolpath not found or access denied', 404);
    }
    
    // Handle GET request - Get comments
    if (req.method === 'GET') {
      const comments = await prisma.toolpathComment.findMany({
        where: { toolpathId: id },
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
      
      const newComment = await prisma.toolpathComment.create({
        data: {
          toolpathId: id,
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