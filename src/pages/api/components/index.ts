// src/pages/api/components/index.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from 'src/lib/prisma';
import { requireAuth } from 'src/lib/api/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  
  // Handle GET request - List components
  if (req.method === 'GET') {
    try {
      // Extract query parameters
      const { projectId, type, search, public: isPublic } = req.query;
      
      // Build the query
      const query: any = {
        where: {
          OR: [
            // User's own components
            { project: { ownerId: userId } },
            // Components in organization projects
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
            // Public components if requested
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
      
      if (search) {
        query.where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } }
        ];
      }
      
      const components = await prisma.component.findMany(query);
      
      return res.status(200).json(components);
    } catch (error) {
      console.error('Failed to fetch components:', error);
      return res.status(500).json({ message: 'Failed to fetch components' });
    }
  }
  
  // Handle POST request - Create component
  if (req.method === 'POST') {
    try {
      const { name, description, data, projectId, type, isPublic } = req.body;
      
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
      
      // Create new component
      const component = await prisma.component.create({
        data: {
          name,
          description,
          data: data || {},
          projectId,
          type: type || 'custom',
          isPublic: isPublic || false
        }
      });
      
      return res.status(201).json(component);
    } catch (error) {
      console.error('Failed to create component:', error);
      return res.status(500).json({ message: 'Failed to create component' });
    }
  }
  
  // Handle unsupported methods
  return res.status(405).json({ message: 'Method not allowed' });
}