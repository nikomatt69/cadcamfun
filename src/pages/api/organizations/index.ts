// src/pages/api/organizations/index.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from 'next-auth/react';
import { prisma } from 'src/lib/prisma';
import { requireAuth } from 'src/lib/api/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Use the requireAuth helper to ensure user is authenticated
  const userId = await requireAuth(req, res);
  if (!userId) return; // requireAuth will send the 401 response if needed
  
  if (req.method === 'GET') {
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
      console.error('Failed to fetch organizations:', error);
      return res.status(500).json({ message: 'Failed to fetch organizations' });
    }
  } else if (req.method === 'POST') {
    try {
      const { name, description } = req.body;
      
      if (!name) {
        return res.status(400).json({ message: 'Organization name is required' });
      }
      
      // Create the organization and add the creator as an admin
      const organization = await prisma.organization.create({
        data: {
          name,
          description,
          users: {
            create: {
              userId,
              role: 'ADMIN'
            }
          }
        }
      });
      
      return res.status(201).json(organization);
    } catch (error) {
      console.error('Failed to create organization:', error);
      return res.status(500).json({ message: 'Failed to create organization' });
    }
  } else {
    return res.status(405).json({ message: 'Method not allowed' });
  }
}