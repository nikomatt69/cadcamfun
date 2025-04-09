// src/pages/api/projects/index.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from 'next-auth/react';
import { prisma } from 'src/lib/prisma';
import { requireAuth } from 'src/lib/api/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  
  if (req.method === 'GET') {
    try {
      const projects = await prisma.project.findMany({
        where: {
          OR: [
            // User's own projects
            { ownerId: userId },
            // Projects in organizations where user is a member
            {
              organization: {
                users: {
                  some: {
                    userId
                  }
                }
              }
            },
            // Public projects
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
          },
          _count: {
            select: {
              drawings: true,
              components: true
            }
          }
        },
        orderBy: {
          updatedAt: 'desc'
        }
      });
      
      return res.status(200).json(projects);
    } catch (error) {
      console.error('Failed to fetch projects:', error);
      return res.status(500).json({ message: 'Failed to fetch projects' });
    }
  } else if (req.method === 'POST') {
    try {
      const { name, description, organizationId, isPublic } = req.body;
      
      if (!name) {
        return res.status(400).json({ message: 'Project name is required' });
      }
      
      // If organizationId is provided, verify that the user belongs to the organization
      if (organizationId) {
        const userOrganization = await prisma.userOrganization.findFirst({
          where: {
            userId,
            organizationId
          }
        });
        
        if (!userOrganization) {
          return res.status(403).json({ message: 'User does not belong to the specified organization' });
        }
      }
      
      const project = await prisma.project.create({
        data: {
          name,
          description,
          ownerId: userId,
          organizationId,
          isPublic: isPublic || false
        }
      });
      
      return res.status(201).json(project);
    } catch (error) {
      console.error('Failed to create project:', error);
      return res.status(500).json({ message: 'Failed to create project' });
    }
  } else {
    return res.status(405).json({ message: 'Method not allowed' });
  }
}