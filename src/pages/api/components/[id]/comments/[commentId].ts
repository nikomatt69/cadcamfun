// src/pages/api/components/[id]/comments/[commentId].ts
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
    
    const { id, commentId } = req.query;
    
    if (!id || typeof id !== 'string' || !commentId || typeof commentId !== 'string') {
      return res.status(400).json({ message: 'Component ID and Comment ID are required' });
    }
    
    // Fetch comment to ensure access
    const comment = await prisma.componentComment.findUnique({
      where: { id: commentId },
      include: { component: true }
    });
    
    if (!comment || comment.component.id !== id) {
      return sendErrorResponse(res, 'Comment not found', 404);
    }
    
    // Handle DELETE request - Delete comment
    if (req.method === 'DELETE') {
      // Only allow the comment creator or project owner to delete
      const canDelete = comment.userId === userId || await prisma.component.findFirst({
        where: {
          id,
          project: { ownerId: userId }
        }
      });
      
      if (!canDelete) {
        return sendErrorResponse(res, 'Not authorized to delete this comment', 403);
      }
      
      await prisma.componentComment.delete({
        where: { id: commentId }
      });
      
      return sendSuccessResponse(res, null, 'Comment deleted successfully');
    }
    
    // Handle PUT request - Update comment
    if (req.method === 'PUT') {
      // Only allow the comment creator to edit
      if (comment.userId !== userId) {
        return sendErrorResponse(res, 'Not authorized to edit this comment', 403);
      }
      
      const { content } = req.body;
      
      if (!content || content.trim() === '') {
        return sendErrorResponse(res, 'Comment content is required', 400);
      }
      
      const updatedComment = await prisma.componentComment.update({
        where: { id: commentId },
        data: {
          content,
          updatedAt: new Date()
        },
        include: {
          user: {
            select: { id: true, name: true, email: true, image: true }
          }
        }
      });
      
      return sendSuccessResponse(res, updatedComment, 'Comment updated successfully');
    }
    
    // Handle unsupported methods
    return sendErrorResponse(res, 'Method not allowed', 405);
  } catch (error) {
    return handleApiError(error, res);
  }
}