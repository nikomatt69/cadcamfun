// src/pages/api/conversation/[id]/messages.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from 'src/lib/prisma';
import { requireAuth } from 'src/lib/api/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  
  const { id: conversationId } = req.query;
  
  if (!conversationId || typeof conversationId !== 'string') {
    return res.status(400).json({ message: 'Conversation ID is required' });
  }
  
  // Verifica che l'utente faccia parte della conversazione
  const participant = await prisma.conversationParticipant.findUnique({
    where: {
      userId_conversationId: {
        userId,
        conversationId
      }
    }
  });
  
  if (!participant) {
    return res.status(403).json({ message: 'You are not a participant in this conversation' });
  }
  
  // GET request per ottenere i messaggi
  if (req.method === 'GET') {
    try {
      const { cursor, limit = 20 } = req.query;
      const parsedLimit = parseInt(limit as string) || 20;
      
      // Query per ottenere i messaggi
      const queryOptions: any = {
        where: {
          conversationId
        },
        orderBy: {
          createdAt: 'desc'
        },
        take: parsedLimit + 1,
        include: {
          sender: {
            select: {
              id: true,
              name: true,
              image: true
            }
          }
        }
      };
      
      if (cursor) {
        queryOptions.cursor = {
          id: cursor as string
        };
        queryOptions.skip = 1;
      }
      
      const messages = await prisma.message.findMany(queryOptions);
      
      const hasMore = messages.length > parsedLimit;
      const resultMessages = hasMore ? messages.slice(0, parsedLimit) : messages;
      
      return res.status(200).json({
        messages: resultMessages.reverse(),
        hasMore,
        nextCursor: hasMore ? resultMessages[0].id : null
      });
    } catch (error) {
      console.error('Failed to fetch messages:', error);
      return res.status(500).json({ message: 'Failed to fetch messages' });
    }
  }
  
  // POST request per inviare un messaggio
  else if (req.method === 'POST') {
    try {
      const { content, fileId, fileUrl } = req.body;
      
      if (!content) {
        return res.status(400).json({ message: 'Message content is required' });
      }
      
      // Crea il messaggio con supporto per file
      const message = await prisma.message.create({
        data: {
          content,
          senderId: userId,
          conversationId,
          fileId: fileId || null,  // Gestisci i campi opzionali
          fileUrl: fileUrl || null
        },
        include: {
          sender: {
            select: {
              id: true,
              name: true,
              image: true
            }
          }
        }
      });
      
      // Aggiorna l'ultimo aggiornamento della conversazione
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() }
      });
      
      return res.status(201).json(message);
    } catch (error) {
      console.error('Failed to create message:', error);
      return res.status(500).json({ message: 'Failed to create message' });
    }
  }
  
  else {
    return res.status(405).json({ message: 'Method not allowed' });
  }
}