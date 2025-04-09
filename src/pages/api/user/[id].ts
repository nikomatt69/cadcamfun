// src/pages/api/users/[id].ts
import { requireAuth } from '@/src/lib/api/auth';
import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from 'src/lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  
  const { id } = req.query;
  
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ message: 'Drawing ID is required' });
  }
  
  
  
  if (req.method === 'GET') {
    try {
      const user = await prisma.user.findUnique({
        where: { id: id as string },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
         
         
          
        
          createdAt: true,
          organizations: {
            include: {
              organization: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        }
      });
      
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      // Format organizations
      const formattedOrganizations = user.organizations.map(org => ({
        id: org.organization.id,
        name: org.organization.name,
        role: org.role
      }));
      
      return res.status(200).json({
        ...user,
        organizations: formattedOrganizations
      });
    } catch (error) {
      console.error('Error fetching user:', error);
      return res.status(500).json({ message: 'Error fetching user' });
    }
  }
  
  return res.status(405).json({ message: 'Method not allowed' });
}