// src/pages/api/tools/[id].ts
import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from 'src/lib/prisma';
import { requireAuth } from 'src/lib/api/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  
  const { id } = req.query;
  
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ message: 'Tool ID is required' });
  }
  
  // Fetch the tool with access check
  const tool = await prisma.tool.findFirst({
    where: {
      id,
      OR: [
        // User's own tools
        { ownerId: userId },
        // Tools in user's organizations
        {
          organization: {
            users: {
              some: {
                userId
              }
            }
          }
        },
        // Public tools
        { isPublic: true }
      ]
    },
    include: {
      owner: {
        select: {
          id: true,
          name: true,
          email: true
        }
      },
      organization: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });
  
  if (!tool) {
    return res.status(404).json({ message: 'Tool not found or access denied' });
  }
  
  // Handle GET request - Get tool details
  if (req.method === 'GET') {
    return res.status(200).json(tool);
  }
  
  // For modification operations, need to verify write access
  const hasWriteAccess = 
    tool.ownerId === userId || 
    (tool.organizationId && await hasOrganizationWriteAccess(userId, tool.organizationId));
  
  if (!hasWriteAccess) {
    return res.status(403).json({ message: 'You do not have permission to modify this tool' });
  }
  
  // Handle PUT request - Update tool
  if (req.method === 'PUT') {
    try {
      const { 
        name, type, diameter, material, numberOfFlutes, maxRPM, 
        coolantType, cuttingLength, totalLength, shankDiameter, 
        notes, isPublic 
      } = req.body;
      
      const updatedTool = await prisma.tool.update({
        where: { id },
        data: {
          ...(name && { name }),
          ...(type && { type }),
          ...(diameter && { diameter }),
          ...(material && { material }),
          ...(numberOfFlutes !== undefined && { numberOfFlutes }),
          ...(maxRPM !== undefined && { maxRPM }),
          ...(coolantType !== undefined && { coolantType }),
          ...(cuttingLength !== undefined && { cuttingLength }),
          ...(totalLength !== undefined && { totalLength }),
          ...(shankDiameter !== undefined && { shankDiameter }),
          ...(notes !== undefined && { notes }),
          ...(isPublic !== undefined && { isPublic }),
          updatedAt: new Date()
        }
      });
      
      return res.status(200).json(updatedTool);
    } catch (error) {
      console.error('Failed to update tool:', error);
      return res.status(500).json({ message: 'Failed to update tool' });
    }
  }
  
  // Handle DELETE request - Delete tool
  if (req.method === 'DELETE') {
    try {
      await prisma.tool.delete({
        where: { id }
      });
      
      return res.status(200).json({ message: 'Tool deleted successfully' });
    } catch (error) {
      console.error('Failed to delete tool:', error);
      return res.status(500).json({ message: 'Failed to delete tool' });
    }
  }
  
  // Handle unsupported methods
  return res.status(405).json({ message: 'Method not allowed' });
}

// Helper function to check organization write access
async function hasOrganizationWriteAccess(userId: string, organizationId: string): Promise<boolean> {
  const userOrg = await prisma.userOrganization.findFirst({
    where: {
      userId,
      organizationId,
      role: {
        in: ['ADMIN', 'MANAGER']
      }
    }
  });
  
  return !!userOrg;
}