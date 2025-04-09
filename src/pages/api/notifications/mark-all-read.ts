// src/pages/api/notifications/mark-all-read.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from 'src/lib/prisma';
import { requireAuth } from 'src/lib/api/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  
  // Solo richieste POST
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }
  
  try {
    // Aggiorna tutte le notifiche non lette dell'utente
    const result = await prisma.notification.updateMany({
      where: {
        userId,
        isRead: false
      },
      data: {
        isRead: true
      }
    });
    
    return res.status(200).json({ 
      message: 'All notifications marked as read',
      count: result.count
    });
  } catch (error) {
    console.error('Failed to mark all notifications as read:', error);
    return res.status(500).json({ message: 'Failed to mark all notifications as read' });
  }
}