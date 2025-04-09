// src/pages/api/tools/[id]/storage.ts

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
      return sendErrorResponse(res, 'Tool ID is required', 400);
    }
    
    // Verify tool exists
    const tool = await prisma.tool.findUnique({
      where: { id }
    });
    
    if (!tool) {
      return sendErrorResponse(res, 'Tool not found', 404);
    }
    
    // Verify permissions
    const hasAccess = await checkToolAccess(userId!, tool);
    
    if (!hasAccess) {
      return sendErrorResponse(res, 'You do not have permission to access this tool', 403);
    }
    
    // Handle HTTP methods
    if (req.method === 'POST') {
      // Save to bucket
      const toolData = req.body;
      
      if (!toolData) {
        return sendErrorResponse(res, 'Tool data is required', 400);
      }
      
      // Generate a unique path for the object
      const objectPath = generateObjectPath('tool', id);
      
      // Upload data to bucket
      const storagePath = await uploadToBucket(objectPath, toolData);
      
      // Update tool metadata in database
      const updatedStoragePaths = tool.id ? 
        `${tool.id},${storagePath}` : 
        storagePath;
      
      await prisma.tool.update({
        where: { id },
        data: {
          updatedAt: new Date()
        }
      });
      return sendSuccessResponse(
        res, 
        { storagePath }, 
        'Tool saved to storage successfully'
      );
    } 
    else if (req.method === 'GET') {
      // Determina il percorso di storage
      const requestedPath = req.query.path as string | undefined;
      const storagePaths = tool.id  as string ? tool.id.split(',') : [];
      
      const storagePath = requestedPath 
        || (storagePaths.length > 0 ? storagePaths[storagePaths.length - 1] : null);
      if (!storagePath) {
        return sendErrorResponse(res, 'This tool does not have storage data', 404);
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
      // Determine storage path to delete
      const requestedPath = req.query.path as string | undefined;
      const storagePaths = Array.isArray(tool.id) 
        ? tool.id as string[]
        : [];
      
      const storagePath = requestedPath 
        || (storagePaths.length > 0 ? storagePaths[storagePaths.length - 1] : null);
      
      if (!storagePath) {
        return sendErrorResponse(res, 'This tool does not have storage data', 404);
      }
      
      try {
        // Delete from bucket
        await deleteFromBucket(storagePath);
        
        // Remove the specific storage path from the tool's storage paths
        const updatedStoragePaths = storagePaths.filter(path => path !== storagePath);
        
        await prisma.tool.update({
          where: { id },
          data: {
            updatedAt: new Date()
          }
        });
        return sendSuccessResponse(
          res, 
          null, 
          'Tool storage data deleted successfully'
        );
      } catch (error) {
        console.error('Error deleting tool storage:', error);
        return sendErrorResponse(res, 'Failed to delete tool storage', 500);
      }
    }
    else {
      return sendErrorResponse(res, 'Method not allowed', 405);
    }
  } catch (error) {
    return handleApiError(error, res);
  }
}

// Helper function to verify tool access
async function checkToolAccess(userId: string, tool: any): Promise<boolean> {
  try {
    // You can implement more sophisticated access control here
    // For now, we'll allow access if the user exists
    return !!userId;
  } catch (error) {
    console.error('Error checking tool access:', error);
    return false;
  }
}