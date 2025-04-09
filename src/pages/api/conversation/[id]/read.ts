// src/pages/api/conversation/[id]/read.ts
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
  
  // Only handle POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }
  
  try {
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
    
    // Update the last read timestamp
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
    
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Failed to mark messages as read:', error);
    return res.status(500).json({ message: 'Failed to mark messages as read' });
  }
}