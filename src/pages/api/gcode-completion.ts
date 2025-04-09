// src/pages/api/gcode-completion.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';
import { requireAuth } from 'src/lib/api/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  
  // Only handle POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { context, cursorPosition } = req.body;

    if (!context) {
      return res.status(400).json({ message: 'Context is required' });
    }

    // Build the prompt for Claude
    const prompt = `You are an expert CNC programming assistant specializing in G-code.
    The user is writing G-code and is asking for a suggestion to complete the current line or suggest the next line.
    Consider these rules:
    1. Provide a brief suggestion (at most one line)
    2. Maintain the user's style (capitalization, syntax)
    3. If you notice an error in the current line, suggest a correction
    4. If appropriate, include a brief comment explaining what the code does
    5. Based on Toolpath provide the next line 

    Here is the context (the last lines of G-code written by the user):
    \`\`\`
    ${context}
    \`\`\`

    The cursor is at line ${cursorPosition.lineNumber}, column ${cursorPosition.column}.
    Provide ONLY the completion text and propose the next line code without explanations or other text.`;

    // Call the AI API
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 100,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY || process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
         
        }
      }
    );

    // Extract the text from the response
    const completion = response.data.content[0].text.trim();
    
    return res.status(200).json({ completion });
  } catch (error) {
    console.error('Error calling AI API for completion:', error);
    return res.status(500).json({ message: 'Error generating completion' });
  }
}