// src/pages/api/projects/tracked/[id].ts
import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from 'next-auth/react';
import { prisma } from '@/src/lib/prisma';
import { withActivityTracking } from '@/src/lib/api/withActivityTracking';
import { requireAuth } from '@/src/lib/api/auth';

// Original handler function
async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  
  const { id } = req.query;
  
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ message: 'Project ID is required' });
  }
  
  // Get the project with related data
  const project = await prisma.project.findFirst({
    where: {
      id,
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
          name: true,
          users: {
            where: { userId },
            select: { role: true }
          }
        }
      },
      _count: {
        select: {
          drawings: true,
          components: true
        }
      }
    }
  });
  
  if (!project) {
    return res.status(404).json({ message: 'Project not found or access denied' });
  }
  
  // Handle different HTTP methods
  if (req.method === 'GET') {
    return res.status(200).json(project);
  } else if (req.method === 'PUT') {
    // Check if user can update the project
    const canUpdate = 
      project.ownerId === userId || 
      project.organization?.users.some(u => ['ADMIN', 'MANAGER'].includes(u.role));
    
    if (!canUpdate) {
      return res.status(403).json({ message: 'You do not have permission to update this project' });
    }
    
    try {
      const { name, description, organizationId } = req.body;
      
      if (!name) {
        return res.status(400).json({ message: 'Project name is required' });
      }
      
      // If changing organization, verify access
      if (organizationId && organizationId !== project.organization?.id) {
        const hasOrgAccess = await verifyOrganizationAccess(userId, organizationId);
        if (!hasOrgAccess) {
          return res.status(403).json({ message: 'You do not have access to the specified organization' });
        }
      }
      
      const updatedProject = await prisma.project.update({
        where: { id },
        data: {
          name,
          description,
          organizationId: organizationId ?? project.organizationId,
          updatedAt: new Date()
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
        }
      });
      
      return res.status(200).json(updatedProject);
    } catch (error) {
      console.error('Failed to update project:', error);
      return res.status(500).json({ message: 'Failed to update project' });
    }
  } else if (req.method === 'DELETE') {
    // Check if user can delete
    const canDelete = 
      project.ownerId === userId || 
      project.organization?.users.some(u => u.role === 'ADMIN');
    
    if (!canDelete) {
      return res.status(403).json({ message: 'You do not have permission to delete this project' });
    }
    
    try {
      // Delete the project and all related entities through cascading
      await prisma.project.delete({
        where: { id }
      });
      
      return res.status(200).json({ message: 'Project deleted successfully' });
    } catch (error) {
      console.error('Failed to delete project:', error);
      return res.status(500).json({ message: 'Failed to delete project' });
    }
  } else {
    return res.status(405).json({ message: 'Method not allowed' });
  }
}

// Helper to verify organization access
async function verifyOrganizationAccess(userId: string, organizationId: string): Promise<boolean> {
  const userOrg = await prisma.userOrganization.findUnique({
    where: {
      userId_organizationId: {
        userId,
        organizationId
      }
    }
  });
  
  return !!userOrg;
}

// Export the handler wrapped with activity tracking
export default withActivityTracking(handler, {
  itemType: 'project',
  actions: {
    GET: 'viewed',
    PUT: 'updated',
    DELETE: 'deleted'
  },
  itemIdExtractor: (req) => req.query.id as string,
  detailsExtractor: (req) => {
    // Only include relevant details based on the request method
    if (req.method === 'PUT') {
      const { name, description, organizationId } = req.body;
      return { name, description, organizationId };
    }
    return {};
  }
});