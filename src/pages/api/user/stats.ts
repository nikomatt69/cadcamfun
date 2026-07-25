import { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/src/lib/api/auth';
import { prisma } from '@/src/lib/prisma';
import { getAuthenticatedUserId } from '@/src/middlewares/withApiAuth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const userId = await requireAuth(req, res);

    if (!userId) {
      return; // requireAuth already sent the response
    }

    // Get user's creation date for "Member since"
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { createdAt: true }
    });

    // Count projects owned by the user
    const projectsCount = await prisma.project.count({
      where: { ownerId: userId }
    });

    // Count drawings in user's projects
    const drawingsCount = await prisma.drawing.count({
      where: {
        project: {
          ownerId: userId
        }
      }
    });

    // Count toolpaths in user's projects
    const toolpathsCount = await prisma.toolpath.count({
      where: {
        project: {
          ownerId: userId
        }
      }
    });

    // Count components in user's projects
    const componentsCount = await prisma.component.count({
      where: {
        project: {
          ownerId: userId
        }
      }
    });

    // Calculate total designs (drawings + components)
    const totalDesigns = drawingsCount + componentsCount;

    // Optional: Count additional items if needed
    // const libraryItemsCount = await prisma.libraryItem.count({
    //   where: { /* your conditions for user's library items */ }
    // });

    const stats = {
      projectsCount,
      drawingsCount,
      toolpathsCount,
      componentsCount,
      totalDesigns,
      memberSince: user?.createdAt?.toISOString() || new Date().toISOString()
    };

    return res.status(200).json(stats);

  } catch (error) {
    console.error('Error fetching user stats:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ?
        (error instanceof Error ? error.message : 'Unknown error') :
        'Failed to fetch stats'
    });
  }
} 