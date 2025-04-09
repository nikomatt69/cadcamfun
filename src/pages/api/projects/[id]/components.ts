// src/pages/api/projects/[id]/components.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from 'src/lib/prisma';
import { requireAuth } from 'src/lib/api/auth';
import { NotificationService } from '@/src/lib/notificationService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  
  const { id: projectId } = req.query;
  
  if (!projectId || typeof projectId !== 'string') {
    return res.status(400).json({ message: 'Project ID is required' });
  }
  
  // Verify the project exists and user has access
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      OR: [
        { ownerId: userId },
        {
          organization: {
            users: {
              some: {
                userId
              }
            }
          }
        }
      ]
    }
  });
  
  if (!project) {
    return res.status(404).json({ message: 'Project not found or access denied' });
  }
  
  // Handle GET request to list components
  if (req.method === 'GET') {
    try {
      const components = await prisma.component.findMany({
        where: {
          projectId: projectId
        },
        orderBy: {
          updatedAt: 'desc'
        }
      });
      
      return res.status(200).json(components);
    } catch (error) {
      console.error('Failed to fetch components:', error);
      return res.status(500).json({ message: 'Failed to fetch components' });
    }
  } 
  // Handle POST request to create a new component
  else if (req.method === 'POST') {
    try {
      const { name, description, data } = req.body;
      
      if (!name) {
        return res.status(400).json({ message: 'Component name is required' });
      }
      
      const component = await prisma.component.create({
        data: {
          name,
          description,
          data: data || {},
          projectId,
        }
      });


      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { organizationId: true }
      });
      // Crea notifiche per tutti i membri dell'organizzazione se il progetto appartiene a un'organizzazione
      if (project?.organizationId && component) {
        try {
          const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { name: true }
          });
          
          await NotificationService.createNewComponentNotifications(
            component.id,
            userId,
            component.name,
            project.organizationId,
            projectId,
            user?.name || 'Utente'
          );
        } catch (error) {
            console.error('Error creating component notifications:', error);
            // Non bloccare la risposta se le notifiche falliscono
        }
      }
      
      return res.status(201).json(component);
    } catch (error) {
      console.error('Failed to create component:', error);
      return res.status(500).json({ message: 'Failed to create component' });
    }
  } else {
    return res.status(405).json({ message: 'Method not allowed' });
  }
}