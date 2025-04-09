// src/pages/api/drawings/[id]/toolpaths.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from 'src/lib/prisma';
import { requireAuth } from 'src/lib/api/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  
  const { id: drawingId } = req.query;
  
  if (!drawingId || typeof drawingId !== 'string') {
    return res.status(400).json({ message: 'Drawing ID is required' });
  }
  
  // Verify user has access to this drawing
  const drawing = await prisma.drawing.findFirst({
    where: {
      id: drawingId,
      project: {
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
    }
  });
  
  if (!drawing) {
    return res.status(404).json({ message: 'Drawing not found or access denied' });
  }
  
  // Handle GET request to list all toolpaths for a drawing
  if (req.method === 'GET') {
    try {
      const toolpaths = await prisma.toolpath.findMany({
        where: {
          drawingId
        },
        include: {
          Material: {
            select: {
              id: true,
              name: true
            }
          },
          MachineConfig: {
            select: {
              id: true,
              name: true,
              type: true
            }
          },
          Tool: {
            select: {
              id: true,
              name: true,
              type: true,
              diameter: true
            }
          }
        },
        orderBy: {
          updatedAt: 'desc'
        }
      });
      
      
      
      return res.status(200).json(toolpaths);
    } catch (error) {
      console.error('Failed to fetch toolpaths:', error);
      return res.status(500).json({ message: 'Failed to fetch toolpaths' });
    }
  } 
  // Handle POST request to create a new toolpath
  else if (req.method === 'POST') {
    try {
      const { 
        name, 
        description, 
        data, 
        gcode, 
        materialId, 
        machineConfigId, 
        toolId,
        simulation 
      } = req.body;
      
      if (!name) {
        return res.status(400).json({ message: 'Toolpath name is required' });
      }
      
      if (!data) {
        return res.status(400).json({ message: 'Toolpath data is required' });
      }
      
      const toolpath = await prisma.toolpath.create({
        data: {
          name,
          description,
          data,
          gcode,
          drawingId,
          materialId,
          machineConfigId,
          toolId,
          projectId: drawing.projectId,
          createdBy: userId
        }
      });
      
      return res.status(201).json(toolpath);
    } catch (error) {
      console.error('Failed to create toolpath:', error);
      return res.status(500).json({ message: 'Failed to create toolpath' });
    }
  } else {
    return res.status(405).json({ message: 'Method not allowed' });
  }
}