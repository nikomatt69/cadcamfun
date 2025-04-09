import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/src/lib/api/auth';
import { v4 as uuidv4 } from 'uuid';
import { unifiedAIService } from '@/src/lib/ai/ai-new/unifiedAIService';
import { aiAnalytics } from '@/src/lib/ai/ai-new/aiAnalytics';

// Storage simulato per le sessioni (in produzione usare un database)
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

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { 
      description, 
      sessionId: existingSessionId,
      constraints,
      model
    } = req.body;

    // Verifica i parametri richiesti
    if (!description) {
      return res.status(400).json({ message: 'Description is required' });
    }

    // Utilizza una sessione esistente o ne crea una nuova
    const sessionId = existingSessionId || uuidv4();
    let sessionContext = {};

    // Se è una sessione esistente, recupera il contesto
    if (existingSessionId && sessions[existingSessionId]) {
      sessionContext = sessions[existingSessionId].context || {};
    }

    // Unisci i vincoli con il contesto di sessione
    const combinedContext = {
      ...sessionContext,
      constraints: constraints || {}
    };

    // Registra evento analitico per la richiesta
    aiAnalytics.trackEvent({
      eventType: 'mcp',
      eventName: 'generate_assembly',
      success: true,
      metadata: {
        userId,
        sessionId,
        isNewSession: !existingSessionId || !sessions[existingSessionId]
      }
    });

    // Prepara il prompt per generare l'assembly CAD
    const prompt = `Generate a detailed CAD assembly based on the following description: "${description}".
    
    ${constraints?.maxElements ? `The assembly should have at most ${constraints.maxElements} elements.` : ''}
    ${constraints?.preferredMaterials ? `Preferred materials: ${constraints.preferredMaterials.join(', ')}.` : ''}
    ${constraints?.dimensions ? `Dimensions: ${JSON.stringify(constraints.dimensions)}.` : ''}
    
    Please provide a complete JSON output with all elements, their properties, relationships, and positions.`;

    // Usa il protocollo MCP per elaborare la richiesta
    const response = await unifiedAIService.processRequest({
      prompt,
      model: model || 'claude-3-5-sonnet-20240229',
      systemPrompt: "You are an expert CAD engineer. Convert text descriptions into detailed 3D assembly specifications in JSON format that can be directly imported into CAD software. Include all necessary parameters for each component.",
      temperature: 0.3,
      maxTokens: 4000,
      useMCP: true,
      mcpParams: {
        cacheStrategy: 'semantic',
        minSimilarity: 0.75,
        cacheTTL: 86400000, // 24 ore
        priority: 'quality',
        storeResult: true
      },
      parseResponse: async (text) => {
        try {
          // Estrai JSON dalla risposta
          const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || 
                            text.match(/\{[\s\S]*\}/);
          
          if (!jsonMatch) {
            throw new Error('Invalid response format');
          }
          
          const jsonStr = jsonMatch[1] || jsonMatch[0];
          return JSON.parse(jsonStr);
        } catch (error) {
          console.error('Failed to parse CAD assembly response:', error);
          throw error;
        }
      },
      metadata: {
        type: 'cad_assembly',
        userId,
        sessionId
      }
    });

    // Se la risposta è valida, salva la sessione
    if (response.success && response.data) {
      const assemblyData = response.data as {
        elements?: any[];
        components?: any[];
        [key: string]: any;
      };
      const elements = assemblyData.elements || assemblyData.components || [];
      
      // Aggiorna o crea la sessione
      sessions[sessionId] = {
        sessionId,
        elements,
        context: {
          ...combinedContext,
          elementsCount: elements.length,
          description
        },
        lastActivity: new Date()
      };
      
      return res.status(200).json({
        success: true,
        data: {
          assembly: assemblyData,
          allElements: elements,
          sessionId
        }
      });
    } else {
      return res.status(422).json({
        success: false,
        message: response.error || 'Failed to generate assembly',
        data: null
      });
    }
  } catch (error) {
    console.error('Error generating assembly:', error);
    return res.status(500).json({ 
      success: false,
      message: error instanceof Error ? error.message : 'Error generating assembly'
    });
  }
} 