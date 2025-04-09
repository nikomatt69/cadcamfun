// src/pages/api/materials/[id].ts
import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from 'src/lib/prisma';
import { requireAuth } from 'src/lib/api/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  
  const { id } = req.query;
  
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ message: 'Material ID is required' });
  }
  
  // Fetch the material with access check
  const material = await prisma.material.findFirst({
    where: {
      id,
      OR: [
        // User's own materials
        { ownerId: userId },
        // Materials in user's organizations
        {
          organization: {
            users: {
              some: {
                userId
              }
            }
          }
        },
        // Public materials
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
  
  if (!material) {
    return res.status(404).json({ message: 'Material not found or access denied' });
  }
  
  // Handle GET request - Get material details
  if (req.method === 'GET') {
    return res.status(200).json(material);
  }
  
  // For modification operations, need to verify write access
  const hasWriteAccess = 
    material.ownerId === userId || 
    (material.organizationId && await hasOrganizationWriteAccess(userId, material.organizationId));
  
  if (!hasWriteAccess) {
    return res.status(403).json({ message: 'You do not have permission to modify this material' });
  }
  
  // Handle PUT request - Update material
  if (req.method === 'PUT') {
    try {
      const { name, description, properties, isPublic } = req.body;
      
      const updatedMaterial = await prisma.material.update({
        where: { id },
        data: {
          ...(name && { name }),
          ...(description !== undefined && { description }),
          ...(properties && { properties }),
          ...(isPublic !== undefined && { isPublic }),
          updatedAt: new Date()
        }
      });
      
      return res.status(200).json(updatedMaterial);
    } catch (error) {
      console.error('Failed to update material:', error);
      return res.status(500).json({ message: 'Failed to update material' });
    }
  }
  
  // Handle DELETE request - Delete material
  if (req.method === 'DELETE') {
    try {
      await prisma.material.delete({
        where: { id }
      });
      
      return res.status(200).json({ message: 'Material deleted successfully' });
    } catch (error) {
      console.error('Failed to delete material:', error);
      return res.status(500).json({ message: 'Failed to delete material' });
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