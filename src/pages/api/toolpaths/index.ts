// src/pages/api/toolpaths/index.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from 'src/lib/prisma';
import { requireAuth } from 'src/lib/api/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  
  // Handle GET request - List toolpaths
  if (req.method === 'GET') {
    try {
      // Extract query parameters
      const { projectId, type, operationType, search, public: isPublic } = req.query;
      
      // Build the query
      const query: any = {
        where: {
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
            ...(isPublic === 'true' ? [{ isPublic: true }] : [])
          ]
        },
        orderBy: {
          updatedAt: 'desc'
        }
      };
      
      // Apply additional filters
      if (projectId) {
        query.where.projectId = projectId;
      }
      
      if (type) {
        query.where.type = type;
      }
      
      if (operationType) {
        query.where.operationType = operationType;
      }
      
      if (search) {
        query.where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } }
        ];
      }
      
      const toolpaths = await prisma.toolpath.findMany(query);
      
      return res.status(200).json(toolpaths);
    } catch (error) {
      console.error('Failed to fetch toolpaths:', error);
      return res.status(500).json({ message: 'Failed to fetch toolpaths' });
    }
  }
  
  // Handle POST request - Create toolpath
  if (req.method === 'POST') {
    try {
      const { name, description, data, gcode, projectId, type, operationType, isPublic, thumbnail } = req.body;
      
      // Validate required fields
      if (!name || !projectId) {
        return res.status(400).json({ message: 'Name and projectId are required' });
      }
      
      // Verify project access
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
      
      // Create new toolpath
      const toolpath = await prisma.toolpath.create({
        data: {
          name,
          description,
          data: data || {},
          gcode: gcode || '',
          projectId,
          type: type || 'mill',
          operationType: operationType || 'contour',
          isPublic: isPublic || false,
          thumbnail,
          createdBy: userId
        }
      });
      
      return res.status(201).json(toolpath);
    } catch (error) {
      console.error('Failed to create toolpath:', error);
      return res.status(500).json({ message: 'Failed to create toolpath' });
    }
  }
  
  // Handle unsupported methods
  return res.status(405).json({ message: 'Method not allowed' });
}