// src/pages/api/components/[id]/versions/index.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from 'src/lib/prisma';
import { requireAuth } from '@/src/lib/api/auth';
import { validateComponentData, normalizeComponentData } from 'src/types/component';

/**
 * Improved API handler for component versions
 * Fixes issues with ID validation and error handling
 */

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Ensure user is authenticated
    const userId = await requireAuth(req, res);
    if (!userId) return;
    
    // Get component ID from query
    const { id } = req.query;
    
    // Validate component ID
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ 
        message: 'Component ID is required and must be a string' 
      });
    }
    
    // Fetch component to ensure access
    const component = await prisma.component.findFirst({
      where: {
        id,
        OR: [
          { project: { ownerId: userId } },
          { project: { organization: { users: { some: { userId } } } } },
          { isPublic: true }
        ]
      }
    });
    
    if (!component) {
      return res.status(404).json({ 
        message: 'Component not found or access denied' 
      });
    }
    
    // Handle GET request - Get version history
    if (req.method === 'GET') {
      try {
        const versions = await prisma.componentVersion.findMany({
          where: { componentId: id },
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: { name: true, email: true }
            }
          }
        });
        
        return res.status(200).json(versions);
      } catch (error) {
        console.error('Error fetching component versions:', error);
        return res.status(500).json({ 
          message: 'Failed to fetch component versions',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    // Handle POST request - Create new version
    if (req.method === 'POST') {
      const { data, changeMessage } = req.body;
      
      // Validate provided data
      if (!data) {
        return res.status(400).json({ message: 'Component data is required' });
      }
      
      // Validate component data
      const validation = validateComponentData(data);
      if (!validation.valid) {
        return res.status(400).json({ 
          message: `Invalid component data: ${validation.errors?.join(', ')}` 
        });
      }
      
      try {
        // Create new version with normalized data
        const newVersion = await prisma.componentVersion.create({
          data: {
            componentId: id,
            data: normalizeComponentData(data),
            changeMessage: changeMessage || '',
            userId
          }
        });
        
        return res.status(201).json({
          ...newVersion,
          message: 'Version created successfully'
        });
      } catch (error) {
        console.error('Error creating component version:', error);
        return res.status(500).json({ 
          message: 'Failed to create component version',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    // Handle unsupported methods
    return res.status(405).json({ message: 'Method not allowed' });
    
  } catch (error) {
    console.error('Error handling component versions request:', error);
    return res.status(500).json({
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}