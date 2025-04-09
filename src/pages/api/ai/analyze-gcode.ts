// src/pages/api/ai/analyze-gcode.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/src/lib/api/auth';
import { unifiedAIService } from '@/src/lib/ai/ai-new/unifiedAIService';

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
    const { gcode, model = 'claude-3-5-sonnet-20240229' } = req.body;

    if (!gcode) {
      return res.status(400).json({ message: 'G-code is required' });
    }

    const response = await unifiedAIService.optimizeGCode(gcode, 'generic', 'aluminum');

    return res.status(200).json(response);
  } catch (error) {
    console.error('Error analyzing G-code:', error);
    return res.status(500).json({ message: 'Error analyzing G-code' });
  }
}