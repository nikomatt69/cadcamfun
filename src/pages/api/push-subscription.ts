// src/pages/api/push-subscription.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from 'src/lib/prisma';
import { requireAuth } from 'src/lib/api/auth';


export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  
  // POST - Salva una nuova sottoscrizione push
  if (req.method === 'POST') {
    try {
      const subscription = req.body;
      
      if (!subscription || !subscription.endpoint || !subscription.keys || !subscription.keys.p256dh || !subscription.keys.auth) {
        return res.status(400).json({ message: 'Dati di sottoscrizione non validi' });
      }
      
      // Salva o aggiorna la sottoscrizione nel database
      const result = await prisma.pushSubscription.upsert({
        where: {
          endpoint: subscription.endpoint
        },
        update: {
          userId,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth
        },
        create: {
          userId,
          endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth
        }
      });
      
      return res.status(200).json({ success: true, id: result.id });
    } catch (error) {
      console.error('Error saving push subscription:', error);
      return res.status(500).json({ message: 'Error saving push subscription' });
    }
  }
  
  // DELETE - Elimina una sottoscrizione push
  else if (req.method === 'DELETE') {
    try {
      const { endpoint } = req.body;
      
      if (!endpoint) {
        return res.status(400).json({ message: 'Endpoint richiesto' });
      }
      
      // Trova e elimina la sottoscrizione
      await prisma.pushSubscription.deleteMany({
        where: {
          userId,
          endpoint
        }
      });
      
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error deleting push subscription:', error);
      return res.status(500).json({ message: 'Error deleting push subscription' });
    }
  }
  
  return res.status(405).json({ message: 'Method not allowed' });
}