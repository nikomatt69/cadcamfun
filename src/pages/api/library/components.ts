import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/src/lib/prisma';
import { getSession } from 'next-auth/react';
import { requireAuth } from '@/src/lib/api/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const userId = await requireAuth(req, res);
    if (!userId) return;

  try {
    if (req.method === 'GET') {
      const components = await prisma.libraryItem.findMany({
        where: {
          OR: [
            { owner: { id: userId } },
            { isPublic: true }
          ]
        },
        include: {
          owner: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true
            }
          }
        }
      });

      return res.json({ data: components });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Error in components API:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
} 