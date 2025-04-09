// src/pages/api/toolpaths/[id].ts
import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from 'src/lib/prisma';
import { requireAuth } from 'src/lib/api/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Ensure user is authenticated
    const userId = await requireAuth(req, res);
    if (!userId) return;
    
    // Get toolpath ID from query
    const { id } = req.query;
    
    // Validate toolpath ID
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ 
        message: 'Toolpath ID is required and must be a string'
      });
    }
    
    // Fetch the toolpath with access check
    const toolpath = await prisma.toolpath.findFirst({
      where: {
        id,
        OR: [
          // User's own toolpaths
          { createdBy: userId },
          // Toolpaths in organization projects
          {
            project: {
              organization: {
                users: {
                  some: {
                    userId
                  }
                }
              }
            }
          },
          // Public toolpaths if requested
          { isPublic: true }
        ]
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            ownerId: true
          }
        }
      }
    });
    
    // Handle toolpath not found
    if (!toolpath) {
      return res.status(404).json({ 
        message: 'Toolpath not found or access denied' 
      });
    }
    
    // Handle GET request - fetch toolpath details
    if (req.method === 'GET') {
      return res.status(200).json(toolpath);
    }
    
    // For modification operations, verify write access
    const hasWriteAccess = toolpath.createdBy === userId || 
      await prisma.project.findFirst({
        where: {
          id: toolpath.projectId,
          organization: {
            users: {
              some: {
                userId,
                role: { in: ['ADMIN', 'MANAGER'] }
              }
            }
          }
        }
      });
    
    if (!hasWriteAccess) {
      return res.status(403).json({ message: 'You do not have permission to modify this toolpath' });
    }
    
    // Handle PUT request - Update toolpath
    if (req.method === 'PUT') {
      const { name, description, data, gcode, type, operationType, isPublic, thumbnail } = req.body;
      
      // Create update object with only defined fields
      const updateData: Record<string, any> = {};
      
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (type !== undefined) updateData.type = type;
      if (operationType !== undefined) updateData.operationType = operationType;
      if (isPublic !== undefined) updateData.isPublic = isPublic;
      if (thumbnail !== undefined) updateData.thumbnail = thumbnail;
      if (data !== undefined) updateData.data = data;
      if (gcode !== undefined) updateData.gcode = gcode;
      
      // Ensure we have something to update
      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ 
          message: 'No fields provided for update' 
        });
      }
      
      // Add update timestamp
      updateData.updatedAt = new Date();
      
      try {
        // Update the toolpath
        const updatedToolpath = await prisma.toolpath.update({
          where: { id },
          data: updateData,
        });
        
        return res.status(200).json({
          ...updatedToolpath,
          message: 'Toolpath updated successfully'
        });
      } catch (error) {
        console.error('Error updating toolpath:', error);
        return res.status(500).json({ 
          message: 'Failed to update toolpath',
          error: error instanceof Error ? error.message : 'Unknown error'  
        });
      }
    }
    
    // Handle DELETE request - Delete toolpath
    if (req.method === 'DELETE') {
      try {
        await prisma.toolpath.delete({
          where: { id }
        });
        
        return res.status(200).json({ 
          message: 'Toolpath deleted successfully' 
        });
      } catch (error) {
        console.error('Error deleting toolpath:', error);
        return res.status(500).json({ 
          message: 'Failed to delete toolpath',
          error: error instanceof Error ? error.message : 'Unknown error'  
        });
      }
    }
    
    // Handle unsupported methods
    return res.status(405).json({ message: 'Method not allowed' });
    
  } catch (error) {
    console.error('Error handling toolpath request:', error);
    return res.status(500).json({
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}