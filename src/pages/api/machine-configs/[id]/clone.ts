// src/pages/api/machine-configs/[id]/clone.ts
import { requireAuth, sendSuccessResponse, sendErrorResponse } from '@/src/lib/api/auth';
import { handleApiError } from '@/src/lib/api/auth';
import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from 'src/lib/prisma';
import { Prisma } from '@prisma/client';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const userId = await requireAuth(req, res);
    if (!userId) return;
    
    // Only support POST method
    if (req.method !== 'POST') {
      res.setHeader('Allow', ['POST']);
      return sendErrorResponse(res, `Method ${req.method} Not Allowed`, 405);
    }
    
    const { id } = req.query;
    const { name } = req.body;
    
    if (!id || typeof id !== 'string') {
      return sendErrorResponse(res, 'Machine configuration ID is required', 400);
    }
    
    // Get the source machine config
    const sourceConfig = await prisma.machineConfig.findUnique({
      where: { id }
    });
    
    if (!sourceConfig) {
      return sendErrorResponse(res, 'Source machine configuration not found', 404);
    }
    
    // Check if user has permission to access this config
    if (!sourceConfig.isPublic && sourceConfig.ownerId !== userId) {
      return sendErrorResponse(res, 'You do not have permission to clone this machine configuration', 403);
    }
    
    // Create the clone with the new name or a default one
    const cloneName = name || `${sourceConfig.name} (Copy)`;
    
    const clonedConfig = await prisma.machineConfig.create({
      data: {
        name: cloneName,
        description: sourceConfig.description,
        type: sourceConfig.type,
        config: sourceConfig.config as Prisma.JsonObject,
        ownerId: userId,
        isPublic: false // Always create clones as private
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true
          }
        }
      }
    });
    
    return sendSuccessResponse(res, 
      {
        ...clonedConfig,
        isOwner: true,
        usageCount: 0
      }, 
      'Machine configuration cloned successfully'
    );
  } catch (error) {
    return handleApiError(error, res);
  }
}