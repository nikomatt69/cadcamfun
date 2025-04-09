// src/pages/api/components/[id]/storage.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from 'next-auth/react';
import { prisma } from 'src/lib/prisma';
import { 
  sendSuccessResponse, 
  sendErrorResponse, 
  handleApiError, 
  ensureAuthenticated 
} from 'src/lib/api/helpers';
import { 
  generateObjectPath, 
  uploadToBucket, 
  downloadFromBucket, 
  generateSignedUrl, 
  deleteFromBucket
} from 'src/lib/storageService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Authentication check
    const { authenticated, userId } = await ensureAuthenticated(req, res, getSession);
    if (!authenticated) return;
    
    const { id } = req.query;
    
    if (!id || typeof id !== 'string') {
      return sendErrorResponse(res, 'Component ID is required', 400);
    }
    
    // Verify component exists and user has access
    const component = await prisma.component.findUnique({
      where: { id },
      include: {
        project: {
          select: {
            id: true,
            ownerId: true,
            organization: {
              select: {
                id: true,
                users: {
                  where: { userId: id },
                  select: { role: true }
                }
              }
            }
          }
        }
      }
    });
    
    if (!component) {
      return sendErrorResponse(res, 'Component not found', 404);
    }
    
    // Verify permissions
    const hasAccess = 
      component.project.ownerId === userId || 
      (component.project.organization && component.project.organization.users.length > 0);
    
    if (!hasAccess) {
      return sendErrorResponse(res, 'You do not have permission to access this component', 403);
    }
    
    // Handle HTTP methods
    if (req.method === 'POST') {
      // Save to bucket
      const componentData = req.body;
      
      if (!componentData) {
        return sendErrorResponse(res, 'Component data is required', 400);
      }
      
      // Generate a unique path for the object
      const objectPath = generateObjectPath('component', id);
      
      // Upload data to bucket
      const storagePath = await uploadToBucket(objectPath, componentData);
      
      // Update component in database with storage path
      await prisma.component.update({
        where: { id },
        data: {
          // Aggiungi il percorso di storage ai metadati
          data: {
            ...(component.data ? JSON.parse(component.data.toString()) : {}),
            storagePath: storagePath
          },
          updatedAt: new Date()
        }
      });
      
      return sendSuccessResponse(
        res, 
        { storagePath }, 
        'Component saved to storage successfully'
      );
    } 
    else if (req.method === 'GET') {
      // Check if component has a storage path
      const storagePath = component.data && typeof component.data === 'object' 
        ? (component.data as any).storagePath 
        : undefined;
      
      if (!storagePath) {
        return sendErrorResponse(res, 'This component does not have storage data', 404);
      }
      
      if (req.query.signedUrl === 'true') {
        // Generate a signed URL for direct access
        const signedUrl = await generateSignedUrl(storagePath);
        return sendSuccessResponse(res, { signedUrl });
      } else {
        // Download data directly
        const data = await downloadFromBucket(storagePath);
        return sendSuccessResponse(res, data);
      }
    }
    else if (req.method === 'DELETE') {
      // Check if component has a storage path
      const storagePath = component.data && typeof component.data === 'object' 
        ? (component.data as any).storagePath 
        : undefined;
      
      if (!storagePath) {
        return sendErrorResponse(res, 'This component does not have storage data', 404);
      }
      
      try {
        // Delete from bucket
        await deleteFromBucket(storagePath);
        
        // Remove storage path from component metadata
        await prisma.component.update({
          where: { id },
          data: {
            data: {
              ...component.data?.toString,
              storagePath: null
            },
            updatedAt: new Date()
          }
        });
        
        return sendSuccessResponse(
          res, 
          null, 
          'Component storage data deleted successfully'
        );
      } catch (error) {
        console.error('Error deleting component storage:', error);
        return sendErrorResponse(res, 'Failed to delete component storage', 500);
      }
    }
    else {
      return sendErrorResponse(res, 'Method not allowed', 405);
    }
  } catch (error) {
    return handleApiError(error, res);
  }
}