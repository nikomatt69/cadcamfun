// src/pages/api/notifications/[id].ts
import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from 'src/lib/prisma';
import { requireAuth } from 'src/lib/api/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  
  const { id } = req.query;
  
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ message: 'Notification ID is required' });
  }
  
  // Verifica che la notifica appartenga all'utente
  const notification = await prisma.notification.findFirst({
    where: {
      id,
      userId
    }
  });
  
  if (!notification) {
    return res.status(404).json({ message: 'Notification not found' });
  }
  
  // PUT request per aggiornare lo stato della notifica (segnarla come letta)
  if (req.method === 'PUT') {
    try {
      const { isRead } = req.body;
      
      if (typeof isRead !== 'boolean') {
        return res.status(400).json({ message: 'isRead field is required and must be a boolean' });
      }
      
      const updatedNotification = await prisma.notification.update({
        where: { id },
        data: { isRead }
      });
      
      return res.status(200).json(updatedNotification);
    } catch (error) {
      console.error('Failed to update notification:', error);
      return res.status(500).json({ message: 'Failed to update notification' });
    }
  }
  
  // DELETE request per eliminare una notifica
  else if (req.method === 'DELETE') {
    try {
      await prisma.notification.delete({
        where: { id }
      });
      
      return res.status(200).json({ message: 'Notification deleted successfully' });
    } catch (error) {
      console.error('Failed to delete notification:', error);
      return res.status(500).json({ message: 'Failed to delete notification' });
    }
  }
  
  return res.status(405).json({ message: 'Method not allowed' });
}