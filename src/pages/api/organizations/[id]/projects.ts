// src/pages/api/organizations/[id]/projects.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from 'src/lib/prisma';
import { requireAuth } from 'src/lib/api/auth';
import { NotificationService } from '@/src/lib/notificationService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  
  const { id: organizationId } = req.query;
  
  if (!organizationId || typeof organizationId !== 'string') {
    return res.status(400).json({ message: 'Organization ID is required' });
  }
  
  // Verify user has access to this organization
  const userOrganization = await prisma.userOrganization.findUnique({
    where: {
      userId_organizationId: {
        userId,
        organizationId
      }
    }
  });
  
  if (!userOrganization) {
    return res.status(403).json({ message: 'You are not a member of this organization' });
  }
  
  // Handle GET request to list all projects
  if (req.method === 'GET') {
    try {
      const projects = await prisma.project.findMany({
        where: {
          organizationId
        },
        include: {
          owner: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          _count: {
            select: {
              drawings: true,
              components: true
            }
          }
        },
        orderBy: {
          updatedAt: 'desc'
        }
      });
      
      return res.status(200).json(projects);
    } catch (error) {
      console.error('Failed to fetch organization projects:', error);
      return res.status(500).json({ message: 'Failed to fetch organization projects' });
    }
  } 
  // Handle POST request to create a new project
  else if (req.method === 'POST') {
    try {
      const { name, description } = req.body;
      
      if (!name) {
        return res.status(400).json({ message: 'Project name is required' });
      }
      
      // Create the project
      const createdProject = await prisma.project.create({
        data: {
          name,
          description,
          ownerId: userId,
          organizationId
        }
      });
      
      // Crea notifiche per tutti i membri dell'organizzazione
      if (createdProject) {
        try {
          const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { name: true }
          });
          
          await NotificationService.createNewProjectNotifications(
            createdProject.id,
            userId,
            createdProject.name,
            organizationId,
            user?.name || 'Utente'
          );
        } catch (error) {
          console.error('Error creating project notifications:', error);
          // Non bloccare la risposta se le notifiche falliscono
        }
      }
      
      return res.status(201).json(createdProject);
    } catch (error) {
      console.error('Failed to create project:', error);
      return res.status(500).json({ message: 'Failed to create project' });
    }
  }
  else {
    return res.status(405).json({ message: 'Method not allowed' });
  }
}