// src/pages/api/tools/index.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from 'src/lib/prisma';
import { requireAuth } from 'src/lib/api/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  
  // Handle GET request - List tools
  if (req.method === 'GET') {
    try {
      // Extract query parameters
      const { type, material, diameter, search, public: isPublic } = req.query;
      
      // Build the query
      const query: any = {
        where: {
          OR: [
            // User's own tools
            { ownerId: userId },
            // Tools in user's organizations
            {
              organization: {
                users: {
                  some: {
                    userId
                  }
                }
              }
            },
            // Public tools if requested
            ...(isPublic === 'true' ? [{ isPublic: true }] : [])
          ]
        },
        orderBy: {
          name: 'asc'
        }
      };
      
      // Apply additional filters
      if (type) {
        query.where.type = type;
      }
      
      if (material) {
        query.where.material = material;
      }
      
      if (diameter) {
        const diameterValue = parseFloat(diameter as string);
        if (!isNaN(diameterValue)) {
          query.where.diameter = diameterValue;
        }
      }
      
      if (search) {
        query.where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { notes: { contains: search, mode: 'insensitive' } }
        ];
      }
      
      const tools = await prisma.tool.findMany(query);
      
      return res.status(200).json(tools);
    } catch (error) {
      console.error('Failed to fetch tools:', error);
      return res.status(500).json({ message: 'Failed to fetch tools' });
    }
  }
  
  // Handle POST request - Create tool
  if (req.method === 'POST') {
    try {
      const { 
        name, type, diameter, material, numberOfFlutes, maxRPM, 
        coolantType, cuttingLength, totalLength, shankDiameter, 
        notes, organizationId, isPublic 
      } = req.body;
      
      // Validate required fields
      if (!name || !type || !diameter || !material) {
        return res.status(400).json({ message: 'Name, type, diameter, and material are required' });
      }
      
      // If organizationId is provided, verify membership
      if (organizationId) {
        const organizationMember = await prisma.userOrganization.findFirst({
          where: {
            userId,
            organizationId
          }
        });
        
        if (!organizationMember) {
          return res.status(403).json({ message: 'You are not a member of the specified organization' });
        }
      }
      
      // Create new tool
      const tool = await prisma.tool.create({
        data: {
          name,
          type,
          diameter,
          material,
          numberOfFlutes,
          maxRPM,
          coolantType,
          cuttingLength,
          totalLength,
          shankDiameter,
          notes,
          ownerId: userId,
          organizationId: organizationId || null,
          isPublic: isPublic || false
        }
      });
      
      return res.status(201).json(tool);
    } catch (error) {
      console.error('Failed to create tool:', error);
      return res.status(500).json({ message: 'Failed to create tool' });
    }
  }
  
  // Handle unsupported methods
  return res.status(405).json({ message: 'Method not allowed' });
}