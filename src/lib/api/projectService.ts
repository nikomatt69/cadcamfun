// src/lib/api/projectService.ts
import { prisma } from 'src/lib/prisma';
import { 
  fetchProjects, 
  createProject,
  updateProject,
  fetchProjectById,
  deleteProject
} from 'src/lib/api/projects';

/**
 * Enhanced service to handle project operations with proper error handling
 */
export class ProjectService {
  /**
   * Fetch all projects for a user with pagination and filtering
   */
  static async getProjects(userId: string, options?: {
    page?: number;
    limit?: number;
    search?: string;
    organizationId?: string;
  }) {
    try {
      const { page = 1, limit = 10, search, organizationId } = options || {};
      const skip = (page - 1) * limit;
      
      // Build where clause
      const where: any = {
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
      };
      
      // Add search filter
      if (search) {
        where.OR = where.OR.map((clause: any) => ({
          ...clause,
          AND: [
            {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } }
              ]
            }
          ]
        }));
      }
      
      // Add organization filter
      if (organizationId) {
        where.organizationId = organizationId;
      }
      
      // Count total projects
      const total = await prisma.project.count({ where });
      
      // Fetch projects with pagination
      const projects = await prisma.project.findMany({
        where,
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
        },
        skip,
        take: limit
      });
      
      return {
        projects,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('Error fetching projects:', error);
      throw error;
    }
  }
  
  /**
   * Fetch a single project by ID with detailed information
   */
  static async getProjectById(id: string, userId: string) {
    try {
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
            },
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
              name: true,
              users: {
                where: { userId },
                select: { role: true }
              }
            }
          },
          drawings: {
            orderBy: {
              updatedAt: 'desc'
            },
            take: 5
          },
          components: {
            orderBy: {
              updatedAt: 'desc'
            },
            take: 5
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
        throw new Error('Project not found or access denied');
      }
      
      // Determine user permissions
      const canEdit = 
        project.ownerId === userId || 
        (project.organization?.users.some(u => ['ADMIN', 'MANAGER'].includes(u.role)) ?? false);
      
      const canDelete = 
        project.ownerId === userId || 
        (project.organization?.users.some(u => u.role === 'ADMIN') ?? false);
      
      return {
        ...project,
        permissions: {
          canEdit,
          canDelete
        }
      };
    } catch (error) {
      console.error(`Error fetching project ${id}:`, error);
      throw error;
    }
  }
  
  /**
   * Create a new project with validation
   */
  static async createProject(data: {
    name: string;
    description?: string;
    organizationId?: string;
    isPublic?: boolean;
  }, userId: string) {
    try {
      // Validate name
      if (!data.name || data.name.trim() === '') {
        throw new Error('Project name is required');
      }
      
      // Verify organization access if provided
      if (data.organizationId) {
        const userOrg = await prisma.userOrganization.findFirst({
          where: {
            userId,
            organizationId: data.organizationId
          }
        });
        
        if (!userOrg) {
          throw new Error('You do not have access to this organization');
        }
      }
      
      // Create project
      const project = await prisma.project.create({
        data: {
          name: data.name,
          description: data.description,
          ownerId: userId,
          organizationId: data.organizationId,
          isPublic: data.isPublic || false
        },
        include: {
          owner: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          organization: data.organizationId ? {
            select: {
              id: true,
              name: true
            }
          } : undefined
        }
      });
      
      // Log activity
      await prisma.activityLog.create({
        data: {
          userId,
          itemId: project.id,
          itemType: 'project',
          action: 'created',
          details: { projectName: project.name }
        }
      });
      
      return project;
    } catch (error) {
      console.error('Error creating project:', error);
      throw error;
    }
  }
  
  /**
   * Update an existing project with validation
   */
  static async updateProject(id: string, data: {
    name?: string;
    description?: string;
    organizationId?: string | null;
    isPublic?: boolean;
  }, userId: string) {
    try {
      // Check if project exists and user has access
      const project = await prisma.project.findFirst({
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
        },
        include: {
          organization: {
            select: {
              id: true
            }
          }
        }
      });
      
      if (!project) {
        throw new Error('Project not found or you do not have permission to update it');
      }
      
      // Validate name if provided
      if (data.name !== undefined && (data.name === null || data.name.trim() === '')) {
        throw new Error('Project name cannot be empty');
      }
      
      // Verify organization access if changing organization
      if (data.organizationId !== undefined && data.organizationId !== project.organizationId) {
        if (data.organizationId) {
          const userOrg = await prisma.userOrganization.findFirst({
            where: {
              userId,
              organizationId: data.organizationId
            }
          });
          
          if (!userOrg) {
            throw new Error('You do not have access to the specified organization');
          }
        }
      }
      
      // Update project
      const updatedProject = await prisma.project.update({
        where: { id },
        data: {
          name: data.name,
          description: data.description,
          organizationId: data.organizationId,
          isPublic: data.isPublic,
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
          organization: data.organizationId ? {
            select: {
              id: true,
              name: true
            }
          } : undefined,
          _count: {
            select: {
              drawings: true,
              components: true
            }
          }
        }
      });
      
      // Log activity
      await prisma.activityLog.create({
        data: {
          userId,
          itemId: id,
          itemType: 'project',
          action: 'updated',
          details: { projectName: updatedProject.name }
        }
      });
      
      return updatedProject;
    } catch (error) {
      console.error(`Error updating project ${id}:`, error);
      throw error;
    }
  }
  
  /**
   * Delete a project with proper validation and cleanup
   */
  static async deleteProject(id: string, userId: string) {
    try {
      // Check if project exists and user has access
      const project = await prisma.project.findFirst({
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
      
      if (!project) {
        throw new Error('Project not found or you do not have permission to delete it');
      }
      
      // Delete project (will cascade to drawings and components)
      await prisma.project.delete({
        where: { id }
      });
      
      // Log activity
      await prisma.activityLog.create({
        data: {
          userId,
          itemId: id,
          itemType: 'project',
          action: 'deleted',
          details: { projectName: project.name }
        }
      });
      
      return { success: true, message: 'Project deleted successfully' };
    } catch (error) {
      console.error(`Error deleting project ${id}:`, error);
      throw error;
    }
  }
  
  /**
   * Save CAD drawing to a project
   */
  static async saveCADtoProject(
    projectId: string, 
    data: {
      name: string;
      description?: string;
      elements: any[];
      thumbnail?: string;
    },
    userId: string
  ) {
    try {
      // Check if project exists and user has access
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
        throw new Error('Project not found or access denied');
      }
      
      // Create the drawing
      const drawing = await prisma.drawing.create({
        data: {
          name: data.name,
          description: data.description,
          thumbnail: data.thumbnail,
          data: {
            elements: data.elements,
            version: '1.0',
            createdAt: new Date().toISOString(),
            author: userId
          },
          projectId
        }
      });
      
      // Create a version for this drawing
      await prisma.drawingVersion.create({
        data: {
          version: 1,
          data: {
            elements: data.elements,
            version: '1.0',
            createdAt: new Date().toISOString(),
            author: userId
          },
          drawingId: drawing.id
        }
      });
      
      // Log activity
      await prisma.activityLog.create({
        data: {
          userId,
          itemId: drawing.id,
          itemType: 'drawing',
          action: 'created',
          details: { drawingName: drawing.name, projectId, projectName: project.name }
        }
      });
      
      return drawing;
    } catch (error) {
      console.error('Error saving CAD to project:', error);
      throw error;
    }
  }
}