// src/pages/api/machine-configs/index.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from 'src/lib/prisma';
import { 
  sendSuccessResponse, 
  sendErrorResponse, 
  handleApiError, 
  requireAuth 
} from 'src/lib/api/auth';
import { Prisma } from '@prisma/client';
import { 
  MachineConfig, 
  MachineType, 
  CreateMachineConfigDto, 
  MachineConfigFilters,
  MachineConfigDetails
} from 'src/types/machineConfig';
import { z } from 'zod';

// Validation schemas
const workVolumeSchema = z.object({
  x: z.number().positive(),
  y: z.number().positive(),
  z: z.number().positive(),
});

const configSchema = z.object({
  workVolume: workVolumeSchema,
  maxSpindleSpeed: z.number().positive(),
  maxFeedRate: z.number().positive(),
  controller: z.string().optional(),
  additionalSettings: z.record(z.any()).optional(),
});

const createMachineConfigSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).nullable().optional(),
  type: z.enum(['mill', 'lathe', 'printer', 'laser']),
  config: configSchema,
  isPublic: z.boolean().optional(),
});

// Default pagination values
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const userId = await requireAuth(req, res);
    if (!userId) return;
    
    if (req.method === 'GET') {
      // Extract and validate query parameters
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(
        MAX_PAGE_SIZE,
        Math.max(1, Number(req.query.limit) || DEFAULT_PAGE_SIZE)
      );
      const offset = (page - 1) * limit;
      
      const filters: MachineConfigFilters = {
        type: req.query.type as MachineType,
        search: req.query.search as string,
        public: req.query.public === 'true'
      };
      
      // Build where clause
      let whereConditions: Prisma.MachineConfigWhereInput = {
        OR: [
          { ownerId: userId },
          ...(filters.public ? [{ isPublic: true }] : [])
        ]
      };
      
      if (filters.type) {
        whereConditions = {
          AND: [
            whereConditions,
            { type: filters.type }
          ]
        };
      }
      
      if (filters.search) {
        whereConditions = {
          AND: [
            whereConditions,
            {
              OR: [
                { name: { contains: filters.search, mode: 'insensitive' } },
                { description: { contains: filters.search, mode: 'insensitive' } }
              ]
            }
          ]
        };
      }
      
      // Get total count for pagination
      const total = await prisma.machineConfig.count({ where: whereConditions });
      
      // Execute main query with pagination
      const machineConfigs = await prisma.machineConfig.findMany({
        where: whereConditions,
        orderBy: { updatedAt: 'desc' },
        include: {
          owner: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true
            }
          },
          _count: {
            select: { toolpaths: true }
          }
        },
        skip: offset,
        take: limit,
      });
      
      // Transform results
      const enrichedConfigs = machineConfigs.map(config => ({
        ...config,
        isOwner: config.ownerId === userId,
        usageCount: config._count.toolpaths,
        _count: undefined
      }));
      
      return sendSuccessResponse(res, {
        data: enrichedConfigs,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      });
    } 
    else if (req.method === 'POST') {
      // Validate request body
      const validationResult = createMachineConfigSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        const errorMessage = 'Invalid request data: ' + validationResult.error.message;
        return sendErrorResponse(res, errorMessage, 400);
      }
      
      const data = validationResult.data;
      
      // Create new machine config
      const machineConfig = await prisma.machineConfig.create({
        data: {
          name: data.name,
          description: data.description,
          type: data.type,
          config: data.config as Prisma.JsonObject,
          ownerId: userId,
          isPublic: data.isPublic ?? false
        },
        include: {
          owner: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true
            }
          }
        }
      });

      return sendSuccessResponse(res, 
        {
          ...machineConfig,
          isOwner: true,
          usageCount: 0
        }, 
        'Machine configuration created successfully'
      );
    } else {
      res.setHeader('Allow', ['GET', 'POST']);
      return sendErrorResponse(res, `Method ${req.method} Not Allowed`, 405);
    }
  } catch (error) {
    return handleApiError(error, res);
  }
}