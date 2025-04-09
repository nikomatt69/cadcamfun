import { requireAuth } from '@/src/lib/api/auth';
import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from 'next-auth/react';
import { prisma } from 'src/lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  const session = await getSession({ req });
  // GET - Ottieni il profilo dell'utente
  if (req.method === 'GET') {
    try {
      // Cerca l'utente nel database con le informazioni sulle organizzazioni
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          organizations: {
            include: {
              organization: {
                select: {
                  id: true,
                  name: true,
                }
              }
            }
          }
        }
      });
      
      if (!user) {
        return res.status(404).json({ message: 'Utente non trovato' });
      }
      
      // Formatta i dati per la risposta
      const formattedOrganizations = user.organizations.map(org => ({
        id: org.organization.id,
        name: org.organization.name,
        role: org.role
      }));
      
      return res.status(200).json({
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        organizations: formattedOrganizations
      });
    } catch (error) {
      console.error('Error retrieving profile:', error);
      return res.status(500).json({ message: 'Error retrieving profile' });
    }
  }
  
  // PUT - Aggiorna il profilo dell'utente
  if (req.method === 'PUT') {
    try {
      const { name, email } = req.body;
      
      // Verifica che l'email non sia già utilizzata da un altro utente
      if (email !== session?.user?.email) {
        const existingUser = await prisma.user.findUnique({
          where: { email }
        });
        
        if (existingUser && existingUser.id !== userId) {
          return res.status(400).json({ message: 'Email già in uso da un altro utente' });
        }
      }
      
      // Aggiorna il profilo utente
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          name,
          email,
          updatedAt: new Date(),
        },
        include: {
          organizations: {
            include: {
              organization: {
                select: {
                  id: true,
                  name: true,
                }
              }
            }
          }
        }
      });
      
      // Formatta i dati per la risposta
      const formattedOrganizations = updatedUser.organizations.map(org => ({
        id: org.organization.id,
        name: org.organization.name,
        role: org.role
      }));
      
      return res.status(200).json({
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        image: updatedUser.image,
        createdAt: updatedUser.createdAt,
        updatedAt: updatedUser.updatedAt,
        organizations: formattedOrganizations
      });
    } catch (error) {
      console.error('Errore nell\'aggiornamento del profilo:', error);
      return res.status(500).json({ message: 'Errore nell\'aggiornamento del profilo' });
    }
  }
  
  // Metodo non supportato
  return res.status(405).json({ message: 'Metodo non consentito' });
}