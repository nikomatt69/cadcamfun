import { requireAuth } from '@/src/lib/api/auth';
import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from 'next-auth/react';
import { prisma } from 'src/lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  
  if (req.method === 'GET') {
    try {
      const toolpaths = await prisma.toolpath.findMany({
        where: {
          user: {
            id: userId
          }
        },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          name: true,
          description: true,
          thumbnail: true,
          createdAt: true,
          updatedAt: true,
          projectId: true
        }
      });
      
      return res.status(200).json(toolpaths);
    } catch (error) {
      console.error('Error fetching toolpaths:', error);
      return res.status(500).json({ message: 'Error fetching toolpaths' });
    }
  }
  
  return res.status(405).json({ message: 'Method not allowed' });
} 