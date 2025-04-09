// src/pages/api/user/organizations.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from 'src/lib/prisma';
import { requireAuth } from 'src/lib/api/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  
  // Only handle GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }
  
  try {
    // Get all organizations where the user is a member
    const userOrganizations = await prisma.userOrganization.findMany({
      where: {
        userId
      },
      include: {
        organization: {
          include: {
            _count: {
              select: {
                users: true,
                projects: true
              }
            }
          }
        }
      }
    });
    
    // Format the response
    const organizations = userOrganizations.map(userOrg => ({
      id: userOrg.organization.id,
      name: userOrg.organization.name,
      description: userOrg.organization.description,
      role: userOrg.role,
      userCount: userOrg.organization._count.users,
      projectCount: userOrg.organization._count.projects,
      createdAt: userOrg.organization.createdAt,
      updatedAt: userOrg.organization.updatedAt
    }));
    
    return res.status(200).json(organizations);
  } catch (error) {
    console.error('Failed to fetch user organizations:', error);
    return res.status(500).json({ message: 'Failed to fetch user organizations' });
  }
}