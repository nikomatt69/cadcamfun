// src/pages/api/components/[id]/versions/restore.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from 'src/lib/prisma';
import { requireAuth } from '@/src/lib/api/auth';
import { Prisma } from '@prisma/client';
import { validateComponentData, normalizeComponentData } from 'src/types/component';

/**
 * Improved API handler for restoring component versions
 * Fixes issues with ID validation and error handling
 */

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Ensure user is authenticated
    const userId = await requireAuth(req, res);
    if (!userId) return;
    
    // Only allow POST requests
    if (req.method !== 'POST') {
      return res.status(405).json({ message: 'Method not allowed' });
    }
    
    // Extract component ID and version ID from request body
    const { id, versionId } = req.body;
    
    // Validate required fields
    if (!id || !versionId) {
      return res.status(400).json({ 
        message: 'Component ID and Version ID are required' 
      });
    }
    
    // Verify write access to the component
    const component = await prisma.component.findFirst({
      where: {
        id,
        OR: [
          { project: { ownerId: userId } },
          { project: { organization: { users: { some: { userId } } } } }
        ]
      }
    });
    
    if (!component) {
      return res.status(404).json({ 
        message: 'Component not found or access denied' 
      });
    }
    
    try {
      // Fetch the version to restore
      const versionToRestore = await prisma.componentVersion.findUnique({
        where: { id: versionId }
      });
      
      if (!versionToRestore || versionToRestore.componentId !== id) {
        return res.status(404).json({ message: 'Version not found' });
      }
      
      // Validate the version data before restoring
      if (versionToRestore.data) {
        const validation = validateComponentData(versionToRestore.data);
        if (!validation.valid) {
          return res.status(400).json({ 
            message: `Invalid version data: ${validation.errors?.join(', ')}` 
          });
        }
      }
      
      // Create a new version to represent the current state before restoring
      await prisma.componentVersion.create({
        data: {
          componentId: id,
          data: component.data as Prisma.InputJsonValue,
          changeMessage: 'Auto-saved before version restore',
          userId
        }
      });
      
      // Normalize the data to ensure it has all required fields
      const normalizedData = normalizeComponentData(versionToRestore.data as any);
      
      // Update the component with the restored data
      const updatedComponent = await prisma.component.update({
        where: { id },
        data: {
          data: normalizedData as Prisma.InputJsonValue,
          updatedAt: new Date()
        }
      });
      
      return res.status(200).json({
        ...updatedComponent,
        message: 'Version restored successfully'
      });
    } catch (error) {
      console.error('Error restoring component version:', error);
      return res.status(500).json({ 
        message: 'Failed to restore component version',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  } catch (error) {
    console.error('Error handling version restore request:', error);
    return res.status(500).json({
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}