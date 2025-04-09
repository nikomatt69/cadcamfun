// src/pages/api/projects/[id]/drawings.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from 'src/lib/prisma';
import { requireAuth } from 'src/lib/api/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  
  const { id: projectId } = req.query;
  
  if (!projectId || typeof projectId !== 'string') {
    return res.status(400).json({ message: 'Project ID is required' });
  }
  
  // Verify the project exists and user has access
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      OR: [
        { ownerId: userId },
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
  
  if (!project) {
    return res.status(404).json({ message: 'Project not found or access denied' });
  }
  
  // Handle GET request to list drawings
  if (req.method === 'GET') {
    try {
      const drawings = await prisma.drawing.findMany({
        where: {
          projectId: projectId
        },
        orderBy: {
          updatedAt: 'desc'
        }
      });
      
      return res.status(200).json(drawings);
    } catch (error) {
      console.error('Failed to fetch drawings:', error);
      return res.status(500).json({ message: 'Failed to fetch drawings' });
    }
  } 
  // Handle POST request to create a new drawing
  else if (req.method === 'POST') {
    try {
      const { name, description, data } = req.body;
      
      if (!name) {
        return res.status(400).json({ message: 'Drawing name is required' });
      }
      
      const drawing = await prisma.drawing.create({
        data: {
          name,
          description,
          data: data || {},
          projectId,
        }
      });
      
      return res.status(201).json(drawing);
    } catch (error) {
      console.error('Failed to create drawing:', error);
      return res.status(500).json({ message: 'Failed to create drawing' });
    }
  } else {
    return res.status(405).json({ message: 'Method not allowed' });
  }
}