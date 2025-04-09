import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/src/lib/api/auth';
import { AIRequest, MCPRequestParams, MCPResponse } from '@/src/types/AITypes';
import { unifiedAIService } from '@/src/lib/ai/ai-new/unifiedAIService';
import { aiAnalytics } from '@/src/lib/ai/ai-new/aiAnalytics';

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
    const { 
      prompt, 
      model, 
      systemPrompt, 
      temperature, 
      maxTokens, 
      mcpParams,
      context,
      mode
    } = req.body;

    // Verifica i parametri richiesti
    if (!prompt) {
      return res.status(400).json({ message: 'Prompt is required' });
    }

    // Prepara la richiesta per il servizio MCP
    const request: AIRequest = {
      prompt,
      model,
      systemPrompt,
      temperature,
      maxTokens,
      useMCP: true,
      mcpParams: mcpParams as MCPRequestParams,
      metadata: {
        userId,
        type: 'mcp_api_request',
        context,
        mode
      }
    };

    // Registra analisi per la richiesta
    aiAnalytics.trackEvent({
      eventType: 'mcp',
      eventName: 'api_request',
      success: true,
      metadata: {
        userId,
        mode: mode || 'general'
      }
    });

    // Elabora la richiesta tramite UnifiedAIService
    const response = await unifiedAIService.processRequest(request);

    return res.status(200).json(response);
  } catch (error) {
    console.error('Error processing MCP request:', error);
    return res.status(500).json({ 
      message: error instanceof Error ? error.message : 'Error processing MCP request',
      success: false
    });
  }
} 