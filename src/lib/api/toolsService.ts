// src/lib/api/toolsService.ts
import { prisma } from 'src/lib/prisma';
import { Tool } from '@prisma/client';

/**
 * Enhanced service for handling tool operations with proper caching and error handling
 */
export class ToolsService {
  // Simple in-memory cache for tools
  private static toolsCache: Map<string, {
    data: any;
    timestamp: number;
  }> = new Map();
  
  // Cache expiration (5 minutes)
  private static CACHE_TTL = 5 * 60 * 1000;
  
  /**
   * Get tools with filtering and caching
   */
  static async getTools(userId: string, options?: {
    type?: string;
    material?: string;
    search?: string;
    diameter?: number;
    includePublic?: boolean;
    includeOrganization?: boolean;
  }) {
    try {
      const {
        type,
        material,
        search,
        diameter,
        includePublic = true,
        includeOrganization = true
      } = options || {};
      
      // Create cache key based on parameters
      const cacheKey = `tools:${userId}:${type || ''}:${material || ''}:${search || ''}:${diameter || ''}:${includePublic}:${includeOrganization}`;
      
      // Check cache
      const cached = this.toolsCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp < this.CACHE_TTL)) {
        return cached.data;
      }
      
      // Build where clause
      const where: any = {
        OR: [
          // User's own tools
          { ownerId: userId }
        ]
      };
      
      // Include public tools if requested
      if (includePublic) {
        where.OR.push({ isPublic: true });
      }
      
      // Include organization tools if requested
      if (includeOrganization) {
        where.OR.push({
          organization: {
            users: {
              some: {
                userId
              }
            }
          }
        });
      }
      
      // Add filters
      if (type) {
        where.type = type;
      }
      
      if (material) {
        where.material = material;
      }
      
      if (diameter) {
        where.diameter = parseFloat(diameter.toString());
      }
      
      if (search) {
        where.OR = where.OR.map((clause: any) => ({
          ...clause,
          AND: [
            {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { notes: { contains: search, mode: 'insensitive' } }
              ]
            }
          ]
        }));
      }
      
      // Fetch tools
      const tools = await prisma.tool.findMany({
        where,
        include: {
          owner: {
            select: {
              id: true,
              name: true
            }
          },
          organization: {
            select: {
              id: true,
              name: true
            }
          }
        },
        orderBy: [
          { type: 'asc' },
          { diameter: 'asc' }
        ]
      });
      
      // Store in cache
      this.toolsCache.set(cacheKey, {
        data: tools,
        timestamp: Date.now()
      });
      
      return tools;
    } catch (error) {
      console.error('Error fetching tools:', error);
      throw error;
    }
  }
  
  /**
   * Get available tool types
   */
  static async getToolTypes() {
    try {
      // Get distinct tool types
      const result = await prisma.tool.groupBy({
        by: ['type'],
        _count: true,
        orderBy: {
          _count: {
            type: 'desc'
          }
        }
      });
      
      return result.map(item => ({
        type: item.type,
        count: item._count
      }));
    } catch (error) {
      console.error('Error fetching tool types:', error);
      throw error;
    }
  }
  
  /**
   * Get available tool materials
   */
  static async getToolMaterials() {
    try {
      // Get distinct tool materials
      const result = await prisma.tool.groupBy({
        by: ['material'],
        _count: true,
        orderBy: {
          _count: {
            material: 'desc'
          }
        }
      });
      
      return result.map(item => ({
        material: item.material,
        count: item._count
      }));
    } catch (error) {
      console.error('Error fetching tool materials:', error);
      throw error;
    }
  }
  
  /**
   * Get a tool by ID
   */
  static async getToolById(id: string, userId: string) {
    try {
      // Fetch tool with validation
      const tool = await prisma.tool.findFirst({
        where: {
          id,
          OR: [
            { ownerId: userId },
            { isPublic: true },
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
              name: true
            }
          },
          organization: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });
      
      if (!tool) {
        throw new Error('Tool not found or access denied');
      }
      
      // Determine user permissions
      const canEdit = tool.ownerId === userId || (tool.organization && await this.checkOrganizationPermission(userId, tool.organizationId as string));
      const canDelete = tool.ownerId === userId || (tool.organization && await this.checkOrganizationPermission(userId, tool.organizationId as string, true));
      
      // Get usage info
      const usage = await prisma.toolpath.count({
        where: {
          toolId: id
        }
      });
      
      return {
        ...tool,
        usage,
        permissions: {
          canEdit,
          canDelete
        }
      };
    } catch (error) {
      console.error(`Error fetching tool ${id}:`, error);
      throw error;
    }
  }
  
  /**
   * Create a new tool
   */
  static async createTool(data: Omit<Tool, 'id' | 'createdAt' | 'updatedAt'>, userId: string) {
    try {
      // Validate required fields
      if (!data.name || !data.type || !data.diameter || !data.material) {
        throw new Error('Name, type, diameter, and material are required');
      }
      
      // Check organization access if provided
      if (data.organizationId) {
        const hasAccess = await this.checkOrganizationPermission(userId, data.organizationId);
        if (!hasAccess) {
          throw new Error('You do not have access to this organization');
        }
      }
      
      // Create the tool
      const tool = await prisma.tool.create({
        data: {
          ...data,
          ownerId: userId
        }
      });
      
      // Clear related cache entries
      this.clearToolsCache(userId);
      
      // Log activity
      await prisma.activityLog.create({
        data: {
          userId,
          itemId: tool.id,
          itemType: 'tool',
          action: 'created',
          details: { toolName: tool.name, toolType: tool.type }
        }
      });
      
      return tool;
    } catch (error) {
      console.error('Error creating tool:', error);
      throw error;
    }
  }
  
  /**
   * Update an existing tool
   */
  static async updateTool(id: string, data: Partial<Tool>, userId: string) {
    try {
      // Check if tool exists and user has permission to edit
      const tool = await prisma.tool.findFirst({
        where: {
          id,
          OR: [
            { ownerId: userId },
            {
              organization: {
                users: {
                  some: {
                    userId,
                    role: { in: ['ADMIN', 'MANAGER'] }
                  }
                }
              }
            }
          ]
        }
      });
      
      if (!tool) {
        throw new Error('Tool not found or you do not have permission to update it');
      }
      
      // Perform update
      const updatedTool = await prisma.tool.update({
        where: { id },
        data: {
          ...data,
          updatedAt: new Date()
        }
      });
      
      // Clear related cache
      this.clearToolsCache(userId);
      if (tool.organizationId) {
        this.clearOrganizationToolsCache(tool.organizationId);
      }
      
      // Log activity
      await prisma.activityLog.create({
        data: {
          userId,
          itemId: id,
          itemType: 'tool',
          action: 'updated',
          details: { toolName: updatedTool.name, toolType: updatedTool.type }
        }
      });
      
      return updatedTool;
    } catch (error) {
      console.error(`Error updating tool ${id}:`, error);
      throw error;
    }
  }
  
  /**
   * Delete a tool with validation
   */
  static async deleteTool(id: string, userId: string) {
    try {
      // Check if tool exists and user has permission to delete
      const tool = await prisma.tool.findFirst({
        where: {
          id,
          OR: [
            { ownerId: userId },
            {
              organization: {
                users: {
                  some: {
                    userId,
                    role: 'ADMIN'
                  }
                }
              }
            }
          ]
        }
      });
      
      if (!tool) {
        throw new Error('Tool not found or you do not have permission to delete it');
      }
      
      // Check if tool is in use
      const toolpathsUsingTool = await prisma.toolpath.count({
        where: {
          toolId: id
        }
      });
      
      if (toolpathsUsingTool > 0) {
        throw new Error(`This tool is used in ${toolpathsUsingTool} toolpaths and cannot be deleted`);
      }
      
      // Delete the tool
      await prisma.tool.delete({
        where: { id }
      });
      
      // Clear related cache
      this.clearToolsCache(userId);
      if (tool.organizationId) {
        this.clearOrganizationToolsCache(tool.organizationId);
      }
      
      // Log activity
      await prisma.activityLog.create({
        data: {
          userId,
          itemId: id,
          itemType: 'tool',
          action: 'deleted',
          details: { toolName: tool.name, toolType: tool.type }
        }
      });
      
      return { success: true, message: 'Tool deleted successfully' };
    } catch (error) {
      console.error(`Error deleting tool ${id}:`, error);
      throw error;
    }
  }
  
  /**
   * Import tools from various formats
   */
  static async importTools(
    data: any[],
    options: {
      organizationId?: string;
      makePublic?: boolean;
      skipExisting?: boolean;
    },
    userId: string
  ) {
    try {
      const { organizationId, makePublic = false, skipExisting = true } = options;
      
      // Check organization access if provided
      if (organizationId) {
        const hasAccess = await this.checkOrganizationPermission(userId, organizationId);
        if (!hasAccess) {
          throw new Error('You do not have access to this organization');
        }
      }
      
      const results = {
        imported: 0,
        skipped: 0,
        failed: 0,
        errors: [] as string[]
      };
      
      // Process each tool
      for (const toolData of data) {
        try {
          // Check if tool with same name and type already exists
          if (skipExisting) {
            const existingTool = await prisma.tool.findFirst({
              where: {
                name: toolData.name,
                type: toolData.type,
                OR: [
                  { ownerId: userId },
                  { organizationId }
                ]
              }
            });
            
            if (existingTool) {
              results.skipped++;
              continue;
            }
          }
          
          // Create the tool
          await prisma.tool.create({
            data: {
              name: toolData.name,
              type: toolData.type || 'unknown',
              diameter: parseFloat(toolData.diameter) || 0,
              material: toolData.material || 'Unknown',
              numberOfFlutes: toolData.numberOfFlutes ? parseInt(toolData.numberOfFlutes) : null,
              maxRPM: toolData.maxRPM ? parseInt(toolData.maxRPM) : null,
              coolantType: toolData.coolantType || null,
              cuttingLength: toolData.cuttingLength ? parseFloat(toolData.cuttingLength) : null,
              totalLength: toolData.totalLength ? parseFloat(toolData.totalLength) : null,
              shankDiameter: toolData.shankDiameter ? parseFloat(toolData.shankDiameter) : null,
              notes: toolData.notes || null,
              isPublic: makePublic,
              ownerId: userId,
              organizationId
            }
          });
          
          results.imported++;
        } catch (error) {
          results.failed++;
          results.errors.push(`Failed to import tool "${toolData.name}": ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
      
      // Clear related cache
      this.clearToolsCache(userId);
      if (organizationId) {
        this.clearOrganizationToolsCache(organizationId);
      }
      
      // Log activity
      await prisma.activityLog.create({
        data: {
          userId,
          itemId: 'batch-import',
          itemType: 'tool',
          action: 'imported',
          details: { 
            imported: results.imported,
            skipped: results.skipped,
            failed: results.failed
          }
        }
      });
      
      return results;
    } catch (error) {
      console.error('Error importing tools:', error);
      throw error;
    }
  }
  
  /**
   * Helper method to check organization permissions
   */
  private static async checkOrganizationPermission(
    userId: string,
    organizationId: string,
    requireAdmin: boolean = false
  ): Promise<boolean> {
    const userOrg = await prisma.userOrganization.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId
        }
      }
    });
    
    if (!userOrg) {
      return false;
    }
    
    if (requireAdmin) {
      return userOrg.role === 'ADMIN';
    }
    
    return ['ADMIN', 'MANAGER'].includes(userOrg.role);
  }
  
  /**
   * Helper methods for cache management
   */
  private static clearToolsCache(userId: string) {
    // Rimuove tutte le voci della cache relative a questo utente
    const keyPrefix = `tools:${userId}:`;
    this.toolsCache.forEach((value, key) => {
      if (key.startsWith(keyPrefix)) {
        this.toolsCache.delete(key);
      }
    });
  }
  
  private static clearOrganizationToolsCache(organizationId: string) {
    // Rimuove tutte le voci della cache relative a questo ID organizzazione
    const keyPrefix = `tools:${organizationId}:`;
    this.toolsCache.forEach((value, key) => {
      if (key.startsWith(keyPrefix)) {
        this.toolsCache.delete(key);
      }
    });
    }
}
