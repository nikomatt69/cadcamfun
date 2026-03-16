// src/pages/api/projects/index.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from 'next-auth/react';
import { prisma } from 'src/lib/prisma';
import { requireAuth } from 'src/lib/api/auth';

// Enterprise imports
import { withErrorHandling } from '@/src/lib/api/apiHandler';
import { validateRequest, createProjectSchema } from '@/src/lib/api/validation';
import { logger } from '@/src/lib/error/logger';

const handler = withErrorHandling(async (req: NextApiRequest, res: NextApiResponse) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  
  if (req.method === 'GET') {
    try {
      const projects = await prisma.project.findMany({
        where: {
          OR: [
            { ownerId: userId },
            {
              organization: {
                users: {
                  some: { userId }
                }
              }
            },
            { isPublic: true }
          ]
        },
        include: {
          owner: { select: { id: true, name: true, email: true } },
          organization: { select: { id: true, name: true } },
          _count: { select: { drawings: true, components: true } }
        },
        orderBy: { updatedAt: 'desc' }
      });
      
      logger.info('Projects fetched', { userId, count: projects.length });
      return res.status(200).json(projects);
    } catch (error) {
      logger.error('Failed to fetch projects', { error: String(error), userId });
      throw error;
    }
  } else if (req.method === 'POST') {
    // Validate request with Zod
    const validation = validateRequest(createProjectSchema, req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        success: false, 
        error: { code: 'VALIDATION_ERROR', message: validation.error } 
      });
    }
    
    const { name, description, organizationId, isPublic } = validation.data;
    
    if (organizationId) {
      const userOrganization = await prisma.userOrganization.findFirst({
        where: { userId, organizationId }
      });
      
      if (!userOrganization) {
        return res.status(403).json({ 
          success: false, 
          error: { code: 'FORBIDDEN', message: 'User does not belong to the specified organization' } 
        });
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
    
    logger.info('Project created', { userId, projectId: project.id });
    return res.status(201).json(project);
  } else {
    return res.status(405).json({ 
      success: false, 
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } 
    });
  }
});

export default handler;
