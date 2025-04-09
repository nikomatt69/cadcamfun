// src/pages/api/organizations/[id]/members.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from 'src/lib/prisma';
import { requireAuth } from 'src/lib/api/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  
  const { id: organizationId } = req.query;
  
  if (!organizationId || typeof organizationId !== 'string') {
    return res.status(400).json({ message: 'Organization ID is required' });
  }
  
  // Verify the user is a member of the organization
  const userOrganization = await prisma.userOrganization.findUnique({
    where: {
      userId_organizationId: {
        userId,
        organizationId
      }
    }
  });
  
  if (!userOrganization) {
    return res.status(403).json({ message: 'You are not a member of this organization' });
  }
  
  // GET request to list all members
  if (req.method === 'GET') {
    try {
      const { search } = req.query; // Get search parameter
      
      // Build the Prisma query with search
      const whereCondition: any = {
        organizationId
      };
      
      // If there's a search term, add filter condition
      if (search && typeof search === 'string') {
        whereCondition.user = {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } }
          ]
        };
      }
      
      const members = await prisma.userOrganization.findMany({
        where: whereCondition,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true
            }
          }
        },
        orderBy: {
          user: {
            name: 'asc'
          }
        }
      });
      
      return res.status(200).json(members);
    } catch (error) {
      console.error('Failed to fetch organization members:', error);
      return res.status(500).json({ message: 'Failed to fetch organization members' });
    }
  } 
  // PUT request to update a member's role
  else if (req.method === 'PUT') {
    // Only admins and managers can update roles
    if (!['ADMIN', 'MANAGER'].includes(userOrganization.role)) {
      return res.status(403).json({ message: 'You do not have permission to update member roles' });
    }
    
    try {
      const { memberId, role } = req.body;
      
      if (!memberId || !role) {
        return res.status(400).json({ message: 'Member ID and role are required' });
      }
      
      // Admins can update anyone, managers can only update members
      if (userOrganization.role === 'MANAGER' && role === 'ADMIN') {
        return res.status(403).json({ message: 'Managers cannot promote members to Admin' });
      }
      
      // Get the member being updated
      const memberToUpdate = await prisma.userOrganization.findUnique({
        where: {
          userId_organizationId: {
            userId: memberId,
            organizationId
          }
        }
      });
      
      if (!memberToUpdate) {
        return res.status(404).json({ message: 'Member not found' });
      }
      
      // Managers cannot update admins
      if (userOrganization.role === 'MANAGER' && memberToUpdate.role === 'ADMIN') {
        return res.status(403).json({ message: 'Managers cannot update Admin roles' });
      }
      
      const updatedMember = await prisma.userOrganization.update({
        where: {
          userId_organizationId: {
            userId: memberId,
            organizationId
          }
        },
        data: {
          role: role as 'ADMIN' | 'MANAGER' | 'MEMBER'
        },
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
      });
      
      return res.status(200).json(updatedMember);
    } catch (error) {
      console.error('Failed to update member role:', error);
      return res.status(500).json({ message: 'Failed to update member role' });
    }
  } 
  // DELETE request to remove a member
  else if (req.method === 'DELETE') {
    // Only admins and managers can remove members
    if (!['ADMIN', 'MANAGER'].includes(userOrganization.role)) {
      return res.status(403).json({ message: 'You do not have permission to remove members' });
    }
    
    try {
      const { memberId } = req.body;
      
      if (!memberId) {
        return res.status(400).json({ message: 'Member ID is required' });
      }
      
      // Get the member being removed
      const memberToRemove = await prisma.userOrganization.findUnique({
        where: {
          userId_organizationId: {
            userId: memberId,
            organizationId
          }
        }
      });
      
      if (!memberToRemove) {
        return res.status(404).json({ message: 'Member not found' });
      }
      
      // Managers cannot remove admins
      if (userOrganization.role === 'MANAGER' && memberToRemove.role === 'ADMIN') {
        return res.status(403).json({ message: 'Managers cannot remove Admins' });
      }
      
      // Prevent removing yourself if you're the last admin
      if (memberId === userId && userOrganization.role === 'ADMIN') {
        const adminCount = await prisma.userOrganization.count({
          where: {
            organizationId,
            role: 'ADMIN'
          }
        });
        
        if (adminCount <= 1) {
          return res.status(400).json({ 
            message: 'Cannot remove the last Admin. Promote another member to Admin first.'
          });
        }
      }
      
      await prisma.userOrganization.delete({
        where: {
          userId_organizationId: {
            userId: memberId,
            organizationId
          }
        }
      });
      
      return res.status(200).json({ message: 'Member removed successfully' });
    } catch (error) {
      console.error('Failed to remove member:', error);
      return res.status(500).json({ message: 'Failed to remove member' });
    }
  } else {
    return res.status(405).json({ message: 'Method not allowed' });
  }
}