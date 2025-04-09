import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from 'next-auth/react';
import { prisma } from 'src/lib/prisma';
import { compare, hash } from 'bcrypt';
import { requireAuth } from '@/src/lib/api/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  
  
  
  
  // Supportiamo solo le richieste PUT per l'aggiornamento della password
  if (req.method !== 'PUT') {
    return res.status(405).json({ message: 'Metodo non consentito' });
  }
  
  try {
    const { currentPassword, newPassword } = req.body;
    
    // Verifica che tutti i campi necessari siano presenti
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current password e new password sono richiesti' });
    }
    
    // Verifica che la nuova password abbia almeno 8 caratteri
    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'La nuova password deve essere di almeno 8 caratteri' });
    }
    
    // Recupera l'utente dal database
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });
    
    if (!user || !user.password) {
      return res.status(404).json({ message: 'Utente non trovato o password non impostata' });
    }
    
    // Verifica che la password corrente sia corretta
    const passwordValid = await compare(currentPassword, user.password);
    
    if (!passwordValid) {
      return res.status(400).json({ message: 'Password corrente non valida' });
    }
    
    // Hash della nuova password
    const hashedNewPassword = await hash(newPassword, 12);
    
    // Aggiorna la password dell'utente
    await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedNewPassword,
        updatedAt: new Date()
      }
    });
    
    return res.status(200).json({ message: 'Password aggiornata con successo' });
  } catch (error) {
    console.error('Errore nell\'aggiornamento della password:', error);
    return res.status(500).json({ message: 'Errore nell\'aggiornamento della password' });
  }
}