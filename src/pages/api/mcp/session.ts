import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/src/lib/api/auth';

// Storage simulato per le sessioni (in produzione usare un database)
// Questa è la stessa struttura usata in generate-assembly.ts
// In un'implementazione reale, questo sarebbe un database condiviso
const sessions: Record<string, {
  sessionId: string;
  elements: any[];
  context: any;
  lastActivity: Date;
}> = {};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    // Recupera l'ID sessione dal percorso dell'URL
    const { sessionId } = req.query;
    
    if (!sessionId || Array.isArray(sessionId)) {
      return res.status(400).json({ 
        success: false,
        message: 'Session ID is required and must be a string' 
      });
    }

    // Verifica se la sessione esiste
    if (!sessions[sessionId]) {
      return res.status(404).json({ 
        success: false,
        message: 'Session not found' 
      });
    }

    // Recupera i dati della sessione
    const session = sessions[sessionId];

    // Restituisci le informazioni sulla sessione
    return res.status(200).json({
      success: true,
      data: {
        sessionId: session.sessionId,
        elementsCount: session.elements.length,
        lastActivity: session.lastActivity,
        context: session.context
      }
    });
  } catch (error) {
    console.error('Error retrieving session:', error);
    return res.status(500).json({ 
      success: false,
      message: error instanceof Error ? error.message : 'Error retrieving session'
    });
  }
} 