// src/pages/api/organizations/[id].ts
import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from 'src/lib/prisma';
import { requireAuth } from 'src/lib/api/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  
  const { id } = req.query;
  
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ message: 'Organization ID is required' });
  }
  
  // Verify the user is a member of the organization
  const userOrganization = await prisma.userOrganization.findUnique({
    where: {
      userId_organizationId: {
        userId,
        organizationId: id
      }
    }
  });
  
  if (!userOrganization) {
    return res.status(403).json({ message: 'You are not a member of this organization' });
  }
  
  // Handle different HTTP methods
  if (req.method === 'GET') {
    try {
      const organization = await prisma.organization.findUnique({
        where: { id },
        include: {
          users: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  image: true
                }
              }
            }
          },
          _count: {
            select: {
              projects: true
            }
          }
        }
      });
      
      if (!organization) {
        return res.status(404).json({ message: 'Organization not found' });
      }
      
      // Format the organization data
      const organizationData = {
        id: organization.id,
        name: organization.name,
        description: organization.description,
        members: organization.users.map(userOrg => ({
          id: userOrg.user.id,
          name: userOrg.user.name,
          email: userOrg.user.email,
          image: userOrg.user.image,
          role: userOrg.role,
          joinedAt: userOrg.joinedAt
        })),
        projectCount: organization._count.projects,
        createdAt: organization.createdAt,
        updatedAt: organization.updatedAt,
        userRole: userOrganization.role
      };
      
      return res.status(200).json(organizationData);
    } catch (error) {
      console.error('Failed to fetch organization:', error);
      return res.status(500).json({ message: 'Failed to fetch organization' });
    }
  } else if (req.method === 'PUT') {
    // Check if user is an admin or manager
    if (!['ADMIN', 'MANAGER'].includes(userOrganization.role)) {
      return res.status(403).json({ message: 'You do not have permission to update this organization' });
    }
    
    try {
      const { name, description } = req.body;
      
      if (!name) {
        return res.status(400).json({ message: 'Organization name is required' });
      }
      
      const updatedOrganization = await prisma.organization.update({
        where: { id },
        data: {
          name,
          description,
          updatedAt: new Date()
        }
      });
      
      return res.status(200).json(updatedOrganization);
    } catch (error) {
      console.error('Failed to update organization:', error);
      return res.status(500).json({ message: 'Failed to update organization' });
    }
  } else if (req.method === 'DELETE') {
    // Only admins can delete an organization
    if (userOrganization.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Only admins can delete an organization' });
    }
    
    try {
      // Delete the organization (this will cascade delete all related data if set up in the schema)
      await prisma.organization.delete({
        where: { id }
      });
      
      return res.status(200).json({ message: 'Organization deleted successfully' });
    } catch (error) {
      console.error('Failed to delete organization:', error);
      return res.status(500).json({ message: 'Failed to delete organization' });
    }
  } else {
    return res.status(405).json({ message: 'Method not allowed' });
  }
}