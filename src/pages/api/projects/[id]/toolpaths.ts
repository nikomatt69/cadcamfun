import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/src/lib/prisma';
import { requireAuth } from '@/src/lib/api/auth';
import { sendErrorResponse, sendSuccessResponse, handleApiError } from '@/src/lib/api/helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Ensure user is authenticated
    const userId = await requireAuth(req, res);
    if (!userId) return;

    const { projectId } = req.query;

    // Ensure projectId is provided
    if (!projectId || typeof projectId !== 'string') {
      return sendErrorResponse(res, 'Project ID is required', 400);
    }

    // Check if user has access to the project
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        OR: [
          { ownerId: userId },
          {
            organization: {
              users: {
                some: {
                  userId: userId,
                  role: { in: ['ADMIN', 'MEMBER'] }
                }
              }
            }
          }
        ]
      }
    });

    if (!project) {
      return sendErrorResponse(res, 'Project not found or access denied', 404);
    }

    switch (req.method) {
      case 'GET':
        // Get all toolpaths for the project
        const toolpaths = await prisma.toolpath.findMany({
          where: {
            projectId: projectId,
            OR: [
              { createdBy: userId },
              { isPublic: true },
              {
                project: {
                  organization: {
                    users: {
                      some: {
                        userId: userId,
                        role: { in: ['ADMIN', 'MEMBER'] }
                      }
                    }
                  }
                }
              }
            ]
          },
          include: {
            project: {
              select: {
                name: true,
                organization: {
                  select: {
                    name: true
                  }
                }
              }
            }
          },
          orderBy: {
            updatedAt: 'desc'
          }
        });

        return sendSuccessResponse(res, toolpaths);

      case 'POST':
        // Create a new toolpath
        const { name, description, type, operationType, data, gcode, isPublic } = req.body;

        // Validate required fields
        if (!name) {
          return sendErrorResponse(res, 'Name is required', 400);
        }

        // Create the toolpath
        const newToolpath = await prisma.toolpath.create({
          data: {
            name,
            description,
            type,
            operationType,
            data: data || {},
            gcode: gcode || '',
            isPublic: isPublic || false,
            projectId,
            createdBy: userId
          }
        });

        return sendSuccessResponse(res, newToolpath, 'Toolpath created successfully');

      default:
        return sendErrorResponse(res, 'Method not allowed', 405);
    }
  } catch (error) {
    return handleApiError(error, res);
  }
} 