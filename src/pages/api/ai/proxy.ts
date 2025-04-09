// src/pages/api/ai/proxy.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/src/lib/api/auth';

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
    const { endpoint, model, messages, max_tokens, temperature, system } = req.body;

    // Base URL for Anthropic API
    const apiUrl = 'https://api.anthropic.com/v1';
    const finalEndpoint = `${apiUrl}/${endpoint || 'messages'}`;

    const response = await fetch(finalEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY || process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: max_tokens || 4000,
        temperature: temperature || 0.7,
        system,
        messages
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || 'Failed to call Anthropic API');
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error('Error proxying to Anthropic API:', error);
    return res.status(500).json({ 
      message: error instanceof Error ? error.message : 'Error calling Anthropic API'
    });
  }
}