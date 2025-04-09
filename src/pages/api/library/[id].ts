// src/pages/api/library/[id].ts
import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from 'src/lib/prisma';
import { requireAuth } from 'src/lib/api/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  
  const { id } = req.query;
  
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ message: 'Library item ID is required' });
  }
  
  // Verify the library item exists and user has access
  const item = await prisma.libraryItem.findFirst({
    where: {
      id,
      OR: [
        { ownerId: userId },
        { isPublic: true },
        {
          organization: {
            users: {
              some: {
                userId
              }
            }
          }
        }
      ]
    }
  });
  
  if (!item) {
    return res.status(404).json({ message: 'Library item not found or access denied' });
  }
  
  // GET - Fetch library item details
  if (req.method === 'GET') {
    return res.status(200).json(item);
  }
  
  // PUT - Update library item
  else if (req.method === 'PUT') {
    try {
      // Check if user can update the item
      const canUpdate = 
        item.ownerId === userId || 
        (item.organizationId && await checkOrganizationPermission(userId, item.organizationId));
      
      if (!canUpdate) {
        return res.status(403).json({ message: 'You do not have permission to update this item' });
      }
      
      const { name, description, category, type, data, properties, tags, isPublic } = req.body;
      
      const updatedItem = await prisma.libraryItem.update({
        where: { id },
        data: {
          name: name || item.name,
          description: description !== undefined ? description : item.description,
          category: category || item.category,
          type: type || item.type,
          data: data || item.data,
          properties: properties || item.properties,
          tags: tags || item.tags,
          isPublic: isPublic !== undefined ? isPublic : item.isPublic,
          updatedAt: new Date()
        }
      });
      
      return res.status(200).json(updatedItem);
    } catch (error) {
      console.error('Failed to update library item:', error);
      return res.status(500).json({ message: 'Failed to update library item' });
    }
  }
  
  // DELETE - Remove library item
  else if (req.method === 'DELETE') {
    try {
      // Check if user can delete the item
      const canDelete = 
        item.ownerId === userId || 
        (item.organizationId && await checkOrganizationPermission(userId, item.organizationId, true));
      
      if (!canDelete) {
        return res.status(403).json({ message: 'You do not have permission to delete this item' });
      }
      
      await prisma.libraryItem.delete({
        where: { id }
      });
      
      return res.status(200).json({ message: 'Library item deleted successfully' });
    } catch (error) {
      console.error('Failed to delete library item:', error);
      return res.status(500).json({ message: 'Failed to delete library item' });
    }
  }
  
  else {
    return res.status(405).json({ message: 'Method not allowed' });
  }
}

// Helper function to check organization permissions
async function checkOrganizationPermission(
  userId: string,
  organizationId: string,
  requireAdmin: boolean = false
): Promise<boolean> {
  const userOrg = await prisma.userOrganization.findUnique({
    where: {
      userId_organizationId: {
        userId,
        organizationId
      }
    }
  });
  
  if (!userOrg) {
    return false;
  }
  
  if (requireAdmin) {
    return userOrg.role === 'ADMIN';
  }
  
  return ['ADMIN', 'MANAGER'].includes(userOrg.role);
}