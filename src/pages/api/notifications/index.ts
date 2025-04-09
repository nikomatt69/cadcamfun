// src/pages/api/notifications/index.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from 'src/lib/prisma';
import { requireAuth } from 'src/lib/api/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  
  // GET request per ottenere le notifiche dell'utente
  if (req.method === 'GET') {
    try {
      const { limit = '20', offset = '0', onlyUnread = 'false' } = req.query;
      const limitNum = parseInt(limit as string, 10);
      const offsetNum = parseInt(offset as string, 10);
      const showOnlyUnread = onlyUnread === 'true';
      
      // Query per le notifiche con filtri e paginazione
      const notifications = await prisma.notification.findMany({
        where: {
          userId,
          ...(showOnlyUnread ? { isRead: false } : {})
        },
        orderBy: {
          createdAt: 'desc'
        },
        take: limitNum,
        skip: offsetNum
      });
      
      // Conteggio totale delle notifiche non lette
      const unreadCount = await prisma.notification.count({
        where: {
          userId,
          isRead: false
        }
      });
      
      return res.status(200).json({
        notifications,
        unreadCount
      });
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
      return res.status(500).json({ message: 'Failed to fetch notifications' });
    }
  }
  
  return res.status(405).json({ message: 'Method not allowed' });
}