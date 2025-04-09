// src/pages/api/components/[id]/versions/[versionId].ts
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
    
    const { id, versionId } = req.query;
    
    if (!id || typeof id !== 'string' || !versionId || typeof versionId !== 'string') {
      return res.status(400).json({ message: 'Component ID and Version ID are required' });
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
    
    // Handle GET request - Get specific version
    if (req.method === 'GET') {
      const version = await prisma.componentVersion.findUnique({
        where: { id: versionId },
        include: {
          user: {
            select: { name: true, email: true }
          }
        }
      });
      
      if (!version || version.componentId !== id) {
        return sendErrorResponse(res, 'Version not found', 404);
      }
      
      return sendSuccessResponse(res, version);
    }
    
    // Handle unsupported methods
    return sendErrorResponse(res, 'Method not allowed', 405);
  } catch (error) {
    return handleApiError(error, res);
  }
}