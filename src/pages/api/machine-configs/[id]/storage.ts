// src/pages/api/machine-configs/[id]/storage.ts

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
      return sendErrorResponse(res, 'Machine configuration ID is required', 400);
    }
    
    // Verify machine configuration exists
    const machineConfig = await prisma.machineConfig.findUnique({
      where: { id }
    });
    
    if (!machineConfig) {
      return sendErrorResponse(res, 'Machine configuration not found', 404);
    }

    // Verify permissions
    const hasAccess = machineConfig.ownerId === userId || machineConfig.isPublic;
    if (!hasAccess) {
      return sendErrorResponse(res, 'You do not have permission to access this machine configuration', 403);
    }
    
    // Handle HTTP methods
    if (req.method === 'POST') {
      // Only the owner can save to storage
      if (machineConfig.ownerId !== userId) {
        return sendErrorResponse(res, 'Only the owner can modify this machine configuration', 403);
      }
      
      // Save to bucket
      const configData = req.body;
      
      if (!configData) {
        return sendErrorResponse(res, 'Machine configuration data is required', 400);
      }
      
      // Generate a unique path for the object
      const objectPath = generateObjectPath('machine-config', id);
      
      // Upload data to bucket
      const storagePath = await uploadToBucket(objectPath, configData);
      
      // Extract existing properties from config if needed
      const configObj = typeof machineConfig.config === 'object' 
        ? machineConfig.config 
        : {};
      
      // Update machine configuration in database with storage path
      await prisma.machineConfig.update({
        where: { id },
        data: {
          config: {
            ...configObj,
            storagePath: storagePath
          },
          updatedAt: new Date()
        }
      });
      
      return sendSuccessResponse(
        res, 
        { storagePath }, 
        'Machine configuration saved to storage successfully'
      );
    } 
    else if (req.method === 'GET') {
      // Check if machine configuration has a storage path
      const storagePath = machineConfig.config && typeof machineConfig.config === 'object' 
        ? (machineConfig.config as any).storagePath 
        : undefined;
      
      if (!storagePath) {
        return sendErrorResponse(res, 'This machine configuration does not have storage data', 404);
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
      // Only the owner can delete from storage
      if (machineConfig.ownerId !== userId) {
        return sendErrorResponse(res, 'Only the owner can delete this machine configuration', 403);
      }
      
      // Check if machine configuration has a storage path
      const storagePath = machineConfig.config && typeof machineConfig.config === 'object' 
        ? (machineConfig.config as any).storagePath 
        : undefined;
      
      if (!storagePath) {
        return sendErrorResponse(res, 'This machine configuration does not have storage data', 404);
      }
      
      try {
        // Delete from bucket
        await deleteFromBucket(storagePath);
        
        // Remove storage path from machine configuration config
        const configObj = typeof machineConfig.config === 'object' 
          ? { ...machineConfig.config } 
          : {};
        
        delete (configObj as any).storagePath;
        
        await prisma.machineConfig.update({
          where: { id },
          data: {
            config: configObj,
            updatedAt: new Date()
          }
        });
        
        return sendSuccessResponse(
          res, 
          null, 
          'Machine configuration storage data deleted successfully'
        );
      } catch (error) {
        console.error('Error deleting machine configuration storage:', error);
        return sendErrorResponse(res, 'Failed to delete machine configuration storage', 500);
      }
    }
    else {
      return sendErrorResponse(res, 'Method not allowed', 405);
    }
  } catch (error) {
    return handleApiError(error, res);
  }
}
