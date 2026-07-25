// src/pages/api/ai/openai-vision-proxy.ts - Endpoint API per Vision
import type { NextApiRequest, NextApiResponse } from "next";
import { LLMClient } from "@/src/lib/ai/provider";

interface VisionProxyRequest {
  prompt: string;
  imageUrl: string;
  cadContext?: any;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

interface VisionProxyResponse {
  result?: string;
  error?: string;
  confidence?: number;
  metadata?: {
    model: string;
    processingTime: number;
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<VisionProxyResponse>
) {
  // Verifica metodo HTTP
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed. Use POST.",
    });
  }

  // Verifica API Key
  if (!process.env.OPENAI_API_KEY) {
    console.error("❌ [Vision Proxy] OPENAI_API_KEY not configured");
    return res.status(500).json({
      error: "OpenAI API key not configured",
    });
  }

  const startTime = Date.now();

  try {
    // Estrai parametri dalla richiesta
    const {
      prompt = "what's in this image?",
      imageUrl,
      cadContext,
      model = "gpt-4.1-mini",
      maxTokens = 4000,
      temperature = 0.3,
    }: VisionProxyRequest = req.body;

    // Validazione input
    if (!imageUrl) {
      return res.status(400).json({
        error: "Image URL is required",
      });
    }

    if (!prompt || prompt.trim().length === 0) {
      return res.status(400).json({
        error: "Prompt is required",
      });
    }

    console.log(
      `🖼️ [Vision Proxy] Processing vision request with model: ${model}`
    );
    console.log(`📝 [Vision Proxy] Prompt: "${prompt.substring(0, 100)}..."`);
    console.log(`🔗 [Vision Proxy] Image URL: ${imageUrl.substring(0, 50)}...`);

    // Costruisci prompt migliorato per CAD se c'è contesto
    let enhancedPrompt = prompt;
    if (cadContext) {
      enhancedPrompt += `\n\nCAD Context: This image is being analyzed for a CAD/CAM application.`;
      if (cadContext.elements && cadContext.elements.length > 0) {
        enhancedPrompt += ` Current project has ${cadContext.elements.length} existing elements.`;
      }
      if (cadContext.analysisType) {
        enhancedPrompt += ` Focus on ${cadContext.analysisType} aspects.`;
      }
      enhancedPrompt += `\nProvide specific insights for CAD modeling, manufacturing, and design optimization.`;
    }

    // Chiamata al provider unificato (Vercel AI SDK) con input multimodale
    console.log(`🤖 [Vision Proxy] Calling unified provider (vision)...`);

    const response = await LLMClient.generate({
      model,
      maxTokens,
      temperature,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: enhancedPrompt },
            { type: "image", image: imageUrl },
          ],
        },
      ],
    });

    const processingTime = Date.now() - startTime;
    console.log(
      `✅ [Vision Proxy] Vision request successful (${processingTime}ms)`
    );

    // Estrai il risultato dalla risposta
    const result = response.text;

    if (!result) {
      console.warn("⚠️ [Vision Proxy] Empty response from OpenAI");
      return res.status(500).json({
        error: "Empty response from Vision API",
      });
    }

    // Calcola confidence score basato sulla lunghezza e qualità della risposta
    const confidence = calculateConfidenceScore(result);

    console.log(
      `📊 [Vision Proxy] Analysis completed - Confidence: ${confidence.toFixed(2)}`
    );

    // Restituisci risultato di successo
    return res.status(200).json({
      result,
      confidence,
      metadata: {
        model,
        processingTime,
      },
    });
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error(
      `❌ [Vision Proxy] Vision API error (${processingTime}ms):`,
      error
    );

    // Gestisci errori specifici del provider (status code propagato dall'AI SDK)
    const status = (error as any)?.statusCode ?? (error as any)?.status;
    if (status === 400) {
      return res.status(400).json({
        error: "Invalid request to Vision API. Check image format and prompt.",
        metadata: { model: req.body.model || "gpt-4.1-mini", processingTime },
      });
    }
    if (status === 401) {
      return res.status(500).json({ error: "Invalid API key configuration" });
    }
    if (status === 429) {
      return res.status(429).json({
        error: "Rate limit exceeded. Please try again later.",
      });
    }

    // Errore generico
    const errorMessage =
      error instanceof Error ? error.message : "Unknown Vision API error";

    return res.status(500).json({
      error: `Vision analysis failed: ${errorMessage}`,
      metadata: {
        model: req.body.model || "gpt-4.1-mini",
        processingTime,
      },
    });
  }
}

/**
 * Calcola un punteggio di confidenza basato sulla qualità della risposta
 */
function calculateConfidenceScore(responseText: string): number {
  if (!responseText || responseText.length < 10) {
    return 0.1;
  }

  let score = 0.5; // Base score

  // Lunghezza della risposta
  const length = responseText.length;
  if (length > 100) score += 0.1;
  if (length > 300) score += 0.1;
  if (length > 500) score += 0.1;

  // Presenza di parole chiave tecniche
  const technicalKeywords = [
    "dimension",
    "material",
    "manufacturing",
    "design",
    "geometry",
    "tolerance",
    "surface",
    "mechanical",
    "engineering",
    "CAD",
  ];

  const foundKeywords = technicalKeywords.filter((keyword) =>
    responseText.toLowerCase().includes(keyword)
  );
  score += foundKeywords.length * 0.05;

  // Presenza di numeri (misure, valori)
  const hasNumbers = /\d+\.?\d*/.test(responseText);
  if (hasNumbers) score += 0.1;

  // Presenza di unità di misura
  const hasUnits = /(mm|cm|m|inch|in|degrees?|°)\b/i.test(responseText);
  if (hasUnits) score += 0.1;

  // Struttura della risposta (paragrafi, punti)
  const hasStructure =
    responseText.includes("\n") ||
    responseText.includes("•") ||
    responseText.includes("-");
  if (hasStructure) score += 0.05;

  // Assicurati che il punteggio sia tra 0 e 1
  return Math.max(0.1, Math.min(1.0, score));
}

// Configurazione per Next.js
export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb", // Supporta immagini più grandi
    },
    responseLimit: false,
  },
};
