// pages/api/ai/toolpath-analysis.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import Anthropic from '@anthropic-ai/sdk';
import { getSession } from 'next-auth/react';
import { requireAuth } from '@/src/lib/api/auth';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const session = await getSession({ req });
  if (!session || !session.user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  
  const userId = await requireAuth(req, res);
  if (!userId) return;
  
  



  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { gcode, model = 'claude-3-5-sonnet-20240229', max_tokens = 300 } = req.body;

    if (!gcode) {
      return res.status(400).json({ message: 'G-code is required' });
    }

    const anthropic = new Anthropic({
      apiKey: process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY,
    });

    // Build the prompt for toolpath analysis
    const prompt = `You are a CNC machining expert. Analyze this G-code and provide a concise summary of what you observe.

\`\`\`
${gcode.substring(0, 2000)} ${gcode.length > 2000 ? '...' : ''}
\`\`\`

Focus on:
- Type of operations (cutting, drilling, etc.)
- Movement patterns
- Tool control
- Safety features
- Potential issues or inefficiencies

Provide your insights in 2-3 sentences. Be specific and technical but concise.`;

    const response = await anthropic.messages.create({
      model,
      max_tokens,
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }],
    });

    const insights = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
    return res.status(200).json({ insights });
  } catch (error) {
    console.error('Error calling Claude API:', error);
    return res.status(500).json({ message: 'Error analyzing toolpath' });
  }
}