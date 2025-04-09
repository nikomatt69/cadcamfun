// src/pages/api/materials/index.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from 'src/lib/prisma';
import { requireAuth } from 'src/lib/api/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  
  // Handle GET request - List materials
  if (req.method === 'GET') {
    try {
      // Extract query parameters
      const { search, public: isPublic } = req.query;
      
      // Build the query
      const query: any = {
        where: {
          OR: [
            // User's own materials
            { ownerId: userId },
            // Materials in user's organizations
            {
              organization: {
                users: {
                  some: {
                    userId
                  }
                }
              }
            },
            // Public materials if requested
            ...(isPublic === 'true' ? [{ isPublic: true }] : [])
          ]
        },
        orderBy: {
          name: 'asc'
        }
      };
      
      // Apply additional filters
      if (search) {
        query.where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } }
        ];
      }
      
      const materials = await prisma.material.findMany(query);
      
      return res.status(200).json(materials);
    } catch (error) {
      console.error('Failed to fetch materials:', error);
      return res.status(500).json({ message: 'Failed to fetch materials' });
    }
  }
  
  // Handle POST request - Create material
  if (req.method === 'POST') {
    try {
      const { name, description, properties, organizationId, isPublic } = req.body;
      
      // Validate required fields
      if (!name || !properties) {
        return res.status(400).json({ message: 'Name and properties are required' });
      }
      
      // If organizationId is provided, verify membership
      if (organizationId) {
        const organizationMember = await prisma.userOrganization.findFirst({
          where: {
            
            organizationId
          }
        });
        
        if (!organizationMember) {
          return res.status(403).json({ message: 'You are not a member of the specified organization' });
        }
      }
      
      // Create new material
      const material = await prisma.material.create({
        data: {
          name,
          description,
          properties,
          ownerId: userId,
          organizationId: organizationId || null,
          isPublic: isPublic || false
        }
      });
      
      return res.status(201).json(material);
    } catch (error) {
      console.error('Failed to create material:', error);
      return res.status(500).json({ message: 'Failed to create material' });
    }
  }
  
  // Handle unsupported methods
  return res.status(405).json({ message: 'Method not allowed' });
}