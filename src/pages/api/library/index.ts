// src/pages/api/library/index.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from 'src/lib/prisma';
import { requireAuth } from 'src/lib/api/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  
  // GET - Fetch library items
  if (req.method === 'GET') {
    try {
      const { category, type, search } = req.query;
      
      const whereClause: any = {
        OR: [
          // User's own items
          { ownerId: userId },
          // Organization items
          {
            organization: {
              users: {
                some: {
                  userId
                }
              }
            }
          },
          // Public items
          { isPublic: true }
        ]
      };
      
      // Apply additional filters
      if (category) {
        whereClause.category = category;
      }
      
      if (type) {
        whereClause.type = type;
      }
      
      if (search && typeof search === 'string') {
        whereClause.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } }
        ];
      }
      
      const items = await prisma.libraryItem.findMany({
        where: whereClause,
        orderBy: {
          updatedAt: 'desc'
        }
      });
      
      return res.status(200).json(items);
    } catch (error) {
      console.error('Failed to fetch library items:', error);
      return res.status(500).json({ message: 'Failed to fetch library items' });
    }
  }
  
  // POST - Create new library item
  else if (req.method === 'POST') {
    try {
      const { name, description, category, type, data, properties, tags, organizationId, isPublic } = req.body;
      
      if (!name || !category || !type || !data) {
        return res.status(400).json({ message: 'Missing required fields' });
      }
      
      // If organizationId is provided, verify user belongs to organization
      if (organizationId) {
        const userOrg = await prisma.userOrganization.findUnique({
          where: {
            userId_organizationId: {
              userId,
              organizationId
            }
          }
        });
        
        if (!userOrg) {
          return res.status(403).json({ message: 'User does not belong to the specified organization' });
        }
      }
      
      const item = await prisma.libraryItem.create({
        data: {
          name,
          description,
          category,
          type,
          data,
          properties: properties || {},
          tags: tags || [],
          ownerId: userId,
          organizationId,
          isPublic: isPublic || false
        }
      });
      
      return res.status(201).json(item);
    } catch (error) {
      console.error('Failed to create library item:', error);
      return res.status(500).json({ message: 'Failed to create library item' });
    }
  }
  
  else {
    return res.status(405).json({ message: 'Method not allowed' });
  }
}