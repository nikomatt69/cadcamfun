// src/pages/api/drawings/[id].ts
import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from 'src/lib/prisma';
import { requireAuth } from 'src/lib/api/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  
  const { id } = req.query;
  
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ message: 'Drawing ID is required' });
  }
  
  // Get the drawing with related data
  const drawing = await prisma.drawing.findUnique({
    where: { id },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          ownerId: true,
          organization: {
            select: {
              id: true,
              users: {
                where: { userId },
                select: { role: true }
              }
            }
          }
        }
      }
    }
  });
  
  if (!drawing) {
    return res.status(404).json({ message: 'Drawing not found' });
  }
  
  // Check if user has access to this drawing
  const hasAccess = 
    drawing.project.ownerId === userId || 
    (drawing.project.organization && drawing.project.organization.users.length > 0);
  
  if (!hasAccess) {
    return res.status(403).json({ message: 'You do not have permission to access this drawing' });
  }
  
  // GET request - fetch drawing details
  if (req.method === 'GET') {
    return res.status(200).json(drawing);
  }
  
  // PUT request - update drawing
  else if (req.method === 'PUT') {
    try {
      const { name, description, data, thumbnail } = req.body;
      
      const updatedDrawing = await prisma.drawing.update({
        where: { id },
        data: {
          ...(name && { name }),
          ...(description !== undefined && { description }),
          ...(data && { data }),
          ...(thumbnail && { thumbnail }),
          updatedAt: new Date()
        }
      });
      
      return res.status(200).json(updatedDrawing);
    } catch (error) {
      console.error('Failed to update drawing:', error);
      return res.status(500).json({ message: 'Failed to update drawing' });
    }
  }
  
  // DELETE request - delete drawing
  else if (req.method === 'DELETE') {
    // Check if user can delete
    const canDelete = 
      drawing.project.ownerId === userId || 
      (drawing.project.organization?.users.some(u => u.role === 'ADMIN'));
    
    if (!canDelete) {
      return res.status(403).json({ message: 'You do not have permission to delete this drawing' });
    }
    
    try {
      await prisma.drawing.delete({
        where: { id }
      });
      
      return res.status(200).json({ message: 'Drawing deleted successfully' });
    } catch (error) {
      console.error('Failed to delete drawing:', error);
      return res.status(500).json({ message: 'Failed to delete drawing' });
    }
  }
  
  else {
    return res.status(405).json({ message: 'Method not allowed' });
  }
}