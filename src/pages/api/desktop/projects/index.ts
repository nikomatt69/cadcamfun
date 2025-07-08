import { NextApiRequest, NextApiResponse } from 'next';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ratelimit } from '@/lib/ratelimit';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

interface ProjectData {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  organization_id: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

interface CreateProjectRequest {
  name: string;
  description?: string;
  organization_id?: string;
  is_public?: boolean;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<ProjectData | ProjectData[]>>
) {
  try {
    // Rate limiting per IP
    const identifier = req.ip || 'anonymous';
    const { success: rateLimitSuccess } = await ratelimit.limit(identifier);
    
    if (!rateLimitSuccess) {
      return res.status(429).json({
        success: false,
        error: 'Too many requests. Please try again later.'
      });
    }

    // Authentication check
    let currentUserId: string | null = null;
    
    // Try Bearer token first (for desktop clients)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      
      // For production, implement proper JWT validation here
      // For now, we'll extract user ID from a simple token structure
      try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        currentUserId = payload.userId || payload.sub;
      } catch (error) {
        console.log('Invalid Bearer token format');
      }
    }
    
    // Fallback to Better Auth session
    if (!currentUserId) {
      try {
        const session = await auth.api.getSession({
          headers: req.headers as any,
        });
        currentUserId = session?.user?.id || null;
      } catch (error) {
        console.log('No valid session found');
      }
    }

    if (!currentUserId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    // Handle different HTTP methods
    switch (req.method) {
      case 'GET':
        return handleGetProjects(req, res, currentUserId);
      case 'POST':
        return handleCreateProject(req, res, currentUserId);
      default:
        return res.status(405).json({
          success: false,
          error: 'Method not allowed'
        });
    }

  } catch (error) {
    console.error('Desktop projects API error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

// Handle GET /api/desktop/projects - List user's projects
async function handleGetProjects(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<ProjectData[]>>,
  userId: string
) {
  try {
    const projects = await prisma.project.findMany({
      where: {
        ownerId: userId,
      },
      select: {
        id: true,
        name: true,
        description: true,
        ownerId: true,
        organizationId: true,
        isPublic: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });

    const projectsData: ProjectData[] = projects.map(project => ({
      id: project.id,
      name: project.name,
      description: project.description,
      owner_id: project.ownerId,
      organization_id: project.organizationId,
      is_public: project.isPublic,
      created_at: project.createdAt.toISOString(),
      updated_at: project.updatedAt.toISOString(),
    }));

    return res.status(200).json({
      success: true,
      data: projectsData,
      message: `Retrieved ${projectsData.length} projects`
    });

  } catch (error) {
    console.error('Get projects error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve projects'
    });
  }
}

// Handle POST /api/desktop/projects - Create new project
async function handleCreateProject(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<ProjectData>>,
  userId: string
) {
  try {
    const { name, description, organization_id, is_public }: CreateProjectRequest = req.body;

    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Project name is required'
      });
    }

    // Validate name length
    if (name.length > 255) {
      return res.status(400).json({
        success: false,
        error: 'Project name must be less than 255 characters'
      });
    }

    // Check if organization exists (if specified)
    if (organization_id) {
      const orgExists = await prisma.organization.findFirst({
        where: {
          id: organization_id,
          users: {
            some: {
              userId: userId
            }
          }
        }
      });

      if (!orgExists) {
        return res.status(400).json({
          success: false,
          error: 'Invalid organization or user not a member'
        });
      }
    }

    // Create project
    const newProject = await prisma.project.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        ownerId: userId,
        organizationId: organization_id || null,
        isPublic: is_public || false,
      },
      select: {
        id: true,
        name: true,
        description: true,
        ownerId: true,
        organizationId: true,
        isPublic: true,
        createdAt: true,
        updatedAt: true,
      }
    });

    // Log project creation
    await prisma.activityLog.create({
      data: {
        userId: userId,
        itemId: newProject.id,
        itemType: 'project',
        action: 'created',
        details: {
          name: newProject.name,
          description: newProject.description,
          isPublic: newProject.isPublic,
          platform: 'desktop'
        }
      }
    }).catch(console.error); // Don't fail if logging fails

    const projectData: ProjectData = {
      id: newProject.id,
      name: newProject.name,
      description: newProject.description,
      owner_id: newProject.ownerId,
      organization_id: newProject.organizationId,
      is_public: newProject.isPublic,
      created_at: newProject.createdAt.toISOString(),
      updated_at: newProject.updatedAt.toISOString(),
    };

    return res.status(201).json({
      success: true,
      data: projectData,
      message: 'Project created successfully'
    });

  } catch (error) {
    console.error('Create project error:', error);
    
    // Handle unique constraint violations
    if (error.code === 'P2002') {
      return res.status(409).json({
        success: false,
        error: 'A project with this name already exists'
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Failed to create project'
    });
  }
}