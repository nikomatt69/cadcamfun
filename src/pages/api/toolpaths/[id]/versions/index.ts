// src/pages/api/toolpaths/[id]/versions/index.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from 'src/lib/prisma';
import { requireAuth } from 'src/lib/api/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Ensure user is authenticated
    const userId = await requireAuth(req, res);
    if (!userId) return;
    
    // Get toolpath ID from query
    const { id } = req.query;
    
    // Validate toolpath ID
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ 
        message: 'Toolpath ID is required and must be a string' 
      });
    }
    
    // Fetch toolpath to ensure access
    const toolpath = await prisma.toolpath.findFirst({
      where: {
        id,
        OR: [
          { createdBy: userId },
          { project: { organization: { users: { some: { userId } } } } },
          { isPublic: true }
        ]
      }
    });
    
    if (!toolpath) {
      return res.status(404).json({ 
        message: 'Toolpath not found or access denied' 
      });
    }
    
    // Handle GET request - Get version history
    if (req.method === 'GET') {
      try {
        const versions = await prisma.toolpathVersion.findMany({
          where: { toolpathId: id },
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: { name: true, email: true }
            }
          }
        });
        
        return res.status(200).json(versions);
      } catch (error) {
        console.error('Error fetching toolpath versions:', error);
        return res.status(500).json({ 
          message: 'Failed to fetch toolpath versions',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    // Handle POST request - Create new version
    if (req.method === 'POST') {
      const { data, gcode, changeMessage } = req.body;
      
      // Validate provided data
      if (!data && !gcode) {
        return res.status(400).json({ message: 'Either data or gcode must be provided' });
      }
      
      try {
        // Create new version
        const newVersion = await prisma.toolpathVersion.create({
          data: {
            toolpathId: id,
            data: data || null,
            gcode: gcode || null,
            changeMessage: changeMessage || '',
            userId
          }
        });
        
        return res.status(201).json({
          ...newVersion,
          message: 'Version created successfully'
        });
      } catch (error) {
        console.error('Error creating toolpath version:', error);
        return res.status(500).json({ 
          message: 'Failed to create toolpath version',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    // Handle unsupported methods
    return res.status(405).json({ message: 'Method not allowed' });
    
  } catch (error) {
    console.error('Error handling toolpath versions request:', error);
    return res.status(500).json({
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}