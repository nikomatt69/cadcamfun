// src/pages/api/conversation/[id]/index.ts
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
  
  // Verify user is a participant in the conversation
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
  
  if (req.method === 'GET') {
    try {
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  image: true
                }
              }
            }
          },
          organization: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });
      
      if (!conversation) {
        return res.status(404).json({ message: 'Conversation not found' });
      }
      
      // Format the response
      const formattedConversation = {
        id: conversation.id,
        name: conversation.name,
        isGroupChat: conversation.isGroupChat,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        organizationId: conversation.organization.id,
        organizationName: conversation.organization.name,
        participants: conversation.participants.map(p => ({
          id: p.user.id,
          name: p.user.name,
          email: p.user.email,
          image: p.user.image,
          lastReadAt: p.lastReadAt
        }))
      };
      
      return res.status(200).json(formattedConversation);
    } catch (error) {
      console.error('Failed to fetch conversation:', error);
      return res.status(500).json({ message: 'Failed to fetch conversation' });
    }
  } else {
    return res.status(405).json({ message: 'Method not allowed' });
  }
}