// src/pages/api/toolpaths/[id]/versions/restore.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from 'src/lib/prisma';
import { requireAuth } from 'src/lib/api/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Ensure user is authenticated
    const userId = await requireAuth(req, res);
    if (!userId) return;
    
    // Only allow POST requests
    if (req.method !== 'POST') {
      return res.status(405).json({ message: 'Method not allowed' });
    }
    
    // Extract toolpath ID and version ID from request body
    const { id, versionId } = req.body;
    
    // Validate required fields
    if (!id || !versionId) {
      return res.status(400).json({ 
        message: 'Toolpath ID and Version ID are required' 
      });
    }
    
    // Verify write access to the toolpath
    const toolpath = await prisma.toolpath.findFirst({
      where: {
        id,
        OR: [
          { createdBy: userId },
          { project: { organization: { users: { some: { userId, role: { in: ['ADMIN', 'MANAGER'] } } } } } }
        ]
      }
    });
    
    if (!toolpath) {
      return res.status(404).json({ 
        message: 'Toolpath not found or access denied' 
      });
    }
    
    try {
      // Fetch the version to restore
      const versionToRestore = await prisma.toolpathVersion.findUnique({
        where: { id: versionId }
      });
      
      if (!versionToRestore || versionToRestore.toolpathId !== id) {
        return res.status(404).json({ message: 'Version not found' });
      }
      
      // Create a new version to represent the current state before restoring
      await prisma.toolpathVersion.create({
        data: {
          toolpathId: id,
          data: toolpath.data as any,
          gcode: toolpath.gcode || '',
          changeMessage: 'Auto-saved before version restore',
          userId
        }
      });
      
      // Update the toolpath with the restored version
      const updatedToolpath = await prisma.toolpath.update({
        where: { id },
        data: {
          data: versionToRestore.data as any,
          gcode: versionToRestore.gcode || toolpath.gcode,
          updatedAt: new Date()
        }
      });
      
      return res.status(200).json({
        ...updatedToolpath,
        message: 'Version restored successfully'
      });
    } catch (error) {
      console.error('Error restoring toolpath version:', error);
      return res.status(500).json({ 
        message: 'Failed to restore toolpath version',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  } catch (error) {
    console.error('Error handling version restore request:', error);
    return res.status(500).json({
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}