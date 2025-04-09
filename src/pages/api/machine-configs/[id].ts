// src/pages/api/machine-configs/[id].ts
import { requireAuth, sendSuccessResponse, sendErrorResponse } from '@/src/lib/api/auth';
import { handleApiError } from '@/src/lib/api/auth';
import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from 'src/lib/prisma';

interface PermissionResult {
  hasAccess: boolean;
  isOwner: boolean;
  reason?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const userId = await requireAuth(req, res);
    if (!userId) return;
    
    const { id } = req.query;
    
    if (!id || typeof id !== 'string') {
      return sendErrorResponse(res, 'Machine configuration ID is required', 400);
    }
    
    // Get the machine config with owner details
    const machineConfig = await prisma.machineConfig.findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true
          }
        },
        toolpaths: {
          select: {
            id: true,
            Drawing: {
              select: {
                project: {
                  select: {
                    ownerId: true,
                    organization: {
                      select: {
                        users: {
                          where: { userId },
                          select: { id: true }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });
    
    if (!machineConfig) {
      return sendErrorResponse(res, 'Machine configuration not found', 404);
    }
    
    // Check permissions efficiently
    const permission = await checkPermissions(machineConfig, userId);
    
    if (!permission.hasAccess) {
      return sendErrorResponse(res, 
        `You do not have permission to access this machine configuration. ${permission.reason || ''}`, 
        403
      );
    }
    
    // Handle different HTTP methods
    if (req.method === 'GET') {
      // Count usages
      const usageCount = await prisma.toolpath.count({
        where: {
          machineConfigId: id
        }
      });
      
      // Return machine config with computed fields
      return sendSuccessResponse(res, {
        ...machineConfig,
        isOwner: permission.isOwner,
        usageCount
      });
    } 
    else if (req.method === 'PUT') {
      // Only owner can update
      if (!permission.isOwner) {
        return sendErrorResponse(res, 'Only the owner can update this machine configuration', 403);
      }
      
      const { name, description, type, config, isPublic: newIsPublic } = req.body;
      
      if (!name) {
        return sendErrorResponse(res, 'Machine configuration name is required', 400);
      }
      
      // Validate type if provided
      if (type && !['mill', 'lathe', 'printer', 'laser'].includes(type)) {
        return sendErrorResponse(res, 'Valid machine type is required (mill, lathe, printer, or laser)', 400);
      }
      
      // Validate config if provided
      if (config) {
        // Merge the existing config with the updates to ensure we maintain required fields
        const baseConfig = (machineConfig.config && typeof machineConfig.config === 'object')
          ? machineConfig.config
          : {};
        const mergedConfig = {
          ...baseConfig,
          ...config,
          workVolume: {
            ...((baseConfig as any).workVolume || {}),
            ...(config.workVolume || {})
          }
        };
        
        if (!mergedConfig.maxSpindleSpeed) {
          return sendErrorResponse(res, 'Maximum spindle speed is required in the configuration', 400);
        }
        
        if (!mergedConfig.maxFeedRate) {
          return sendErrorResponse(res, 'Maximum feed rate is required in the configuration', 400);
        }
        
        if (!mergedConfig.workVolume || 
            typeof mergedConfig.workVolume.x !== 'number' || 
            typeof mergedConfig.workVolume.y !== 'number' || 
            typeof mergedConfig.workVolume.z !== 'number') {
          return sendErrorResponse(res, 'Work volume dimensions (x, y, z) are required in the configuration', 400);
        }
      }
      
      const updatedConfig = await prisma.machineConfig.update({
        where: { id },
        data: {
          name,
          description: description !== undefined ? description : machineConfig.description,
          config: config
            ? { ...(machineConfig.config && typeof machineConfig.config === 'object' ? machineConfig.config : {}), ...config }
            : machineConfig.config,
          type: type || machineConfig.type,
          isPublic: newIsPublic !== undefined ? newIsPublic : machineConfig.isPublic,
          updatedAt: new Date()
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
      
      // Count usages
      const usageCount = await prisma.toolpath.count({
        where: {
          machineConfigId: id
        }
      });
      
      return sendSuccessResponse(res, 
        {
          ...updatedConfig,
          isOwner: true,
          usageCount
        }, 
        'Machine configuration updated successfully'
      );
    } 
    else if (req.method === 'DELETE') {
      // Only owner can delete
      if (!permission.isOwner) {
        return sendErrorResponse(res, 'Only the owner can delete this machine configuration', 403);
      }
      
      // Check if the machine config is being used by any toolpaths
      const usageCount = await prisma.toolpath.count({
        where: {
          machineConfigId: id
        }
      });
      
      if (usageCount > 0) {
        return sendErrorResponse(res, 
          `Cannot delete machine configuration as it is being used by ${usageCount} toolpath${usageCount > 1 ? 's' : ''}`,
          400
        );
      }
      
      await prisma.machineConfig.delete({
        where: { id }
      });
      
      return sendSuccessResponse(res, null, 'Machine configuration deleted successfully');
    } 
    else {
      res.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
      return sendErrorResponse(res, `Method ${req.method} Not Allowed`, 405);
    }
  } catch (error) {
    return handleApiError(error, res);
  }
}

// Helper function to check permissions
async function checkPermissions(machineConfig: any, userId: string): Promise<PermissionResult> {
  // Check if user has permission to access this config
  const isOwner = machineConfig.ownerId === userId;
  const isPublic = machineConfig.isPublic;
  
  // Fast path for owner and public configs
  if (isOwner) return { hasAccess: true, isOwner: true };
  if (isPublic) return { hasAccess: true, isOwner: false };
  
  // Check for organization access (only if needed)
  if (machineConfig.organizationId) {
    const organizationMember = await prisma.userOrganization.findFirst({
      where: {
        userId,
        organizationId: machineConfig.organizationId
      }
    });
    
    if (organizationMember) {
      return { hasAccess: true, isOwner: false };
    }
  }
  
  // Check for access via toolpaths
  const hasToolpathAccess = machineConfig.toolpaths.some((tp: any) => 
    tp.Drawing?.project?.ownerId === userId || 
    (tp.Drawing?.project?.organization?.users && tp.Drawing?.project?.organization?.users.length > 0)
  );
  
  if (hasToolpathAccess) {
    return { hasAccess: true, isOwner: false };
  }
  
  // Determine reason for access denial
  let reason = "This is a private configuration.";
  if (machineConfig.organizationId) {
    reason = "You are not a member of the organization that owns this configuration.";
  }
  
  return { hasAccess: false, isOwner: false, reason };
}