// src/pages/api/components/[id]/detail.ts - New implementation

import { requireAuth } from '@/src/lib/api/auth';
import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from 'next-auth/react';
import { prisma } from 'src/lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  
  const { id } = req.query;
  
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ message: 'Drawing ID is required' });
  }
  
  
  // Only handle GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }
  
  try {
    // Get the component with its related data
    const component = await prisma.component.findUnique({
      where: { id },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            description: true,
            ownerId: true,
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
            }
          }
        }
      }
    });
    
    if (!component) {
      return res.status(404).json({ message: 'Component not found' });
    }
    
    // Check if user has access to this component
    const hasAccess = 
      component.project.ownerId === userId || 
      (component.project.organization && component.project.organization.users.length > 0);
    
    if (!hasAccess) {
      return res.status(403).json({ message: 'You do not have permission to access this component' });
    }
    
    // Get usage statistics
    // This would show where the component is used
    const usageStats = {
      usedInDrawings: await prisma.drawing.count({
        where: {
          data: {
            path: ['components'],
            array_contains: component.id
          }
        }
      }),
      // Add other usage stats as needed
    };
    
    // Format the response with additional data
    const response = {
      ...component,
      usageStats,
      canEdit: 
        component.project.ownerId === userId || 
        (component.project.organization && 
          component.project.organization.users.some(u => ['ADMIN', 'MANAGER'].includes(u.role))),
      canDelete: 
        component.project.ownerId === userId || 
        (component.project.organization && 
          component.project.organization.users.some(u => u.role === 'ADMIN'))
    };
    
    return res.status(200).json(response);
  } catch (error) {
    console.error('Failed to fetch component details:', error);
    return res.status(500).json({ message: 'Failed to fetch component details', error: error});
  }
}