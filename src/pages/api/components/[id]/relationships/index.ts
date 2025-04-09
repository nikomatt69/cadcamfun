// src/pages/api/components/[id]/relationships/index.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from 'next-auth/react';
import { prisma } from 'src/lib/prisma';
import { sendErrorResponse, sendSuccessResponse, handleApiError } from 'src/lib/api/helpers';
import { requireAuth } from '@/src/lib/api/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Ensure user is authenticated
    const userId = await requireAuth(req, res);
    if (!userId) return;
    
    const { id } = req.query;
    
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ message: 'Component ID is required' });
    }
    
    // Fetch component to ensure access
    const component = await prisma.component.findFirst({
      where: {
        id,
        OR: [
          { project: { ownerId: userId } },
          { project: { organization: { users: { some: { userId } } } } },
          { isPublic: true }
        ]
      }
    });
    
    if (!component) {
      return sendErrorResponse(res, 'Component not found or access denied', 404);
    }
    
    // Handle GET request - Get relationships
    if (req.method === 'GET') {
      // Find components that reference this component
      const referencingComponents = await prisma.component.findMany({
        where: {
          data: {
            path: ['references'],
            array_contains: id
          }
        },
        select: {
          id: true,
          name: true,
          description: true,
          type: true,
          projectId: true,
          isPublic: true
        }
      });
      
      // Find components referenced by this component
      let referencedComponents: any[] = [];
      
      // Parse the data to find references
      if (component.data && typeof component.data === 'object') {
        const data = component.data as any;
        const references = data.references || [];
        
        if (references.length > 0) {
          referencedComponents = await prisma.component.findMany({
            where: {
              id: { in: references }
            },
            select: {
              id: true,
              name: true,
              description: true,
              type: true,
              projectId: true,
              isPublic: true
            }
          });
        }
      }
      
      // Combine all related components
      const relatedComponents = [
        ...referencingComponents,
        ...referencedComponents
      ];
      
      // Create relationship edges
      const relationships = [
        // Components referencing this component
        ...referencingComponents.map(comp => ({
          sourceId: comp.id,
          targetId: id,
          type: 'references'
        })),
        // Components referenced by this component
        ...referencedComponents.map(comp => ({
          sourceId: id,
          targetId: comp.id,
          type: 'references'
        }))
      ];
      
      return sendSuccessResponse(res, {
        relatedComponents,
        relationships
      });
    }
    
    // Handle unsupported methods
    return sendErrorResponse(res, 'Method not allowed', 405);
  } catch (error) {
    return handleApiError(error, res);
  }
}