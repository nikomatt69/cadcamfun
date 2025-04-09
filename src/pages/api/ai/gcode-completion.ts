import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/src/lib/api/auth';
import  {unifiedAIService} from 'src/lib/ai/unifiedAIService';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { context, cursorPosition } = req.body;

    if (!context) {
      return res.status(400).json({ message: 'Context is required' });
    }

    const completion = await unifiedAIService.optimizeGCode(context, cursorPosition);
    return res.status(200).json({ completion });
  } catch (error) {
    console.error('G-code Completion Error:', error);
    return res.status(500).json({ message: 'Error generating completion' });
  }
}