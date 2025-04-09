// src/pages/api/conversations/[id].ts
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
    },
    include: {
      conversation: {
        select: {
          organizationId: true
        }
      }
    }
  });
  
  if (!participant) {
    return res.status(403).json({ message: 'You are not a participant in this conversation' });
  }
  
  // GET request to get conversation details
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
          }
        }
      });
      
      if (!conversation) {
        return res.status(404).json({ message: 'Conversation not found' });
      }
      
      // Update last read timestamp for the user
      await prisma.conversationParticipant.update({
        where: {
          userId_conversationId: {
            userId,
            conversationId
          }
        },
        data: {
          lastReadAt: new Date()
        }
      });
      
      // Format the conversation data
      const formattedConversation = {
        id: conversation.id,
        name: conversation.name,
        isGroupChat: conversation.isGroupChat,
        organizationId: conversation.organizationId,
        participants: conversation.participants.map(p => ({
          id: p.user.id,
          name: p.user.name,
          email: p.user.email,
          image: p.user.image,
          joinedAt: p.joinedAt,
          lastReadAt: p.lastReadAt
        })),
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt
      };
      
      return res.status(200).json(formattedConversation);
    } catch (error) {
      console.error('Failed to fetch conversation:', error);
      return res.status(500).json({ message: 'Failed to fetch conversation' });
    }
  }
  
  // PATCH request to update conversation details (like name for group chats)
  else if (req.method === 'PATCH') {
    try {
      const { name } = req.body;
      
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId }
      });
      
      if (!conversation) {
        return res.status(404).json({ message: 'Conversation not found' });
      }
      
      // Only allow updating group chat details
      if (!conversation.isGroupChat) {
        return res.status(400).json({ message: 'Can only update group chat details' });
      }
      
      const updatedConversation = await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          name,
          updatedAt: new Date()
        },
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
          }
        }
      });
      
      return res.status(200).json(updatedConversation);
    } catch (error) {
      console.error('Failed to update conversation:', error);
      return res.status(500).json({ message: 'Failed to update conversation' });
    }
  }
  
  else {
    return res.status(405).json({ message: 'Method not allowed' });
  }
}