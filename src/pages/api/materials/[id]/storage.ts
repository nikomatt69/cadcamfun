// src/pages/api/materials/[id]/storage.ts

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
      return sendErrorResponse(res, 'Material ID is required', 400);
    }
    
    // Verify material exists
    const material = await prisma.material.findUnique({
      where: { id }
    });
    
    if (!material) {
      return sendErrorResponse(res, 'Material not found', 404);
    }

    // Verify permissions
    if (userId) {
      const hasAccess = await checkMaterialAccess(userId, material);
      if (!hasAccess) {
        return sendErrorResponse(res, 'You do not have permission to access this material', 403);
      }
    }
    
    // Handle HTTP methods
    if (req.method === 'POST') {
      // Save to bucket
      const materialData = req.body;
      
      if (!materialData) {
        return sendErrorResponse(res, 'Material data is required', 400);
      }
      
      // Generate a unique path for the object
      const objectPath = generateObjectPath('material', id);
      
      // Upload data to bucket
      const storagePath = await uploadToBucket(objectPath, materialData);
      
      // Extract existing properties
      const properties = typeof material.properties === 'object' 
        ? material.properties 
        : {};
      
      // Update material in database with storage path
      await prisma.material.update({
        where: { id },
        data: {
          properties: {
            ...properties,
            storagePath: storagePath
          },
          updatedAt: new Date()
        }
      });
      
      return sendSuccessResponse(
        res, 
        { storagePath }, 
        'Material saved to storage successfully'
      );
    } 
    else if (req.method === 'GET') {
      // Check if material has a storage path
      const storagePath = material.properties && typeof material.properties === 'object' 
        ? (material.properties as any).storagePath 
        : undefined;
      
      if (!storagePath) {
        return sendErrorResponse(res, 'This material does not have storage data', 404);
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
      // Check if material has a storage path
      const storagePath = material.properties && typeof material.properties === 'object' 
        ? (material.properties as any).storagePath 
        : undefined;
      
      if (!storagePath) {
        return sendErrorResponse(res, 'This material does not have storage data', 404);
      }
      
      try {
        // Delete from bucket
        await deleteFromBucket(storagePath);
        
        // Remove storage path from material properties
        const properties = typeof material.properties === 'object' 
          ? { ...material.properties } 
          : {};
        
        
        
        await prisma.material.update({
          where: { id },
          data: {
            properties,
            updatedAt: new Date()
          }
        });
        
        return sendSuccessResponse(
          res, 
          null, 
          'Material storage data deleted successfully'
        );
      } catch (error) {
        console.error('Error deleting material storage:', error);
        return sendErrorResponse(res, 'Failed to delete material storage', 500);
      }
    }
    else {
      return sendErrorResponse(res, 'Method not allowed', 405);
    }
  } catch (error) {
    return handleApiError(error, res);
  }
}

// Helper function to verify material access
async function checkMaterialAccess(userId: string, material: any): Promise<boolean> {
  try {
    // Direct ownership check
    if (material.ownerId === userId) {
      return true;
    }
    
    // Organization membership check
    if (material.organizationId) {
      const userOrganization = await prisma.userOrganization.findUnique({
        where: {
          userId_organizationId: {
            userId,
            organizationId: material.organizationId
          }
        }
      });
      
      if (userOrganization) {
        return true;
      }
    }
    
    // Public access check
    if (material.isPublic) {
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error checking material access:', error);
    return false;
  }
}