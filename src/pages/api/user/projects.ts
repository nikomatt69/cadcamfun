// src/pages/api/user/projects.ts
import { requireAuth } from '@/src/lib/api/auth';
import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from 'next-auth/react';
import { prisma } from 'src/lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  

  
  
  if (req.method === 'GET') {
    try {
      const projects = await prisma.project.findMany({
        where: { ownerId: userId },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          name: true,
          description: true,
          createdAt: true,
          updatedAt: true,
        }
      });
      
      return res.status(200).json(projects);
    } catch (error) {
      console.error('Error fetching projects:', error);
      return res.status(500).json({ message: 'Error fetching projects' });
    }
  }
  
  return res.status(405).json({ message: 'Method not allowed' });
}