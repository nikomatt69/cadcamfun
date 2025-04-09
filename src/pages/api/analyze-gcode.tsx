// src/pages/api/analyze/gcode.ts
import { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';
import { prisma } from 'src/lib/prisma';
import { requireAuth } from 'src/lib/api/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  
  // Only handle POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }
  
  try {
    const { gcode, toolPathId } = req.body;
    
    if (!gcode) {
      return res.status(400).json({ message: 'G-code is required' });
    }
    
    // Build the prompt for the AI model
    const prompt = `Analyze the following G-code CNC program and provide 3-5 specific suggestions for improving it. 
    For each suggestion, identify:
    1. A concise title
    2. A brief description of the problem or area for improvement
    3. The exact snippet of original code to modify
    4. The improved code suggestion
    5. The type of suggestion (optimization, error, or improvement)
    
    Respond in JSON format like this:
    {"suggestions": [
      {
        "id": "unique-id",
        "title": "Suggestion title",
        "description": "Detailed description",
        "originalCode": "Original G-code",
        "suggestedCode": "Improved G-code",
        "type": "suggestion-type"
      }
    ]}
    
    Here is the G-code to analyze:
    
    ${gcode}`;
    
    // Call an AI model API (replace with your actual implementation)
    const aiResponse = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-3-sonnet-20240229',
        max_tokens: 2000,
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
          'x-api-key': process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        }
      }
    );
    
    // Extract the JSON response from the AI
    const content = aiResponse.data.content[0].text;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      return res.status(500).json({ message: 'Failed to extract JSON response from AI model' });
    }
    
    const analysis = JSON.parse(jsonMatch[0]);
    
    // Log the analysis in the database
    if (toolPathId) {
      await prisma.aIAnalysisLog.create({
        data: {
          userId,
          objectId: toolPathId,
          objectType: 'ToolPath',
          analysisType: 'gcode',
          result: analysis
        }
      });
    }
    
    return res.status(200).json(analysis);
  } catch (error) {
    console.error('Error analyzing G-code:', error);
    return res.status(500).json({ message: 'Error analyzing G-code' });
  }
}