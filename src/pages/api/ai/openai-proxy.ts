// src/pages/api/ai/openai-proxy.ts
import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Solo richieste POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { model, messages, max_tokens, temperature, stream } = req.body;

    // Verifica la presenza della chiave API
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'OpenAI API key is missing' });
    }

    // Endpoint OpenAI
    const endpoint = 'https://api.openai.com/v1/chat/completions';

    // Configura la richiesta
    const headers: { [key: string]: string } = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    };

    // Aggiungi l'ID dell'organizzazione se disponibile
    if (process.env.OPENAI_ORG_ID) {
      headers['OpenAI-Organization'] = process.env.OPENAI_ORG_ID;
    }

    // Costruisci il corpo della richiesta
    const requestBody = {
      model,
      messages,
      max_tokens,
      temperature,
      stream
    };

    // Se streaming, invia la risposta direttamente al client
    if (stream) {
      // Imposta le intestazioni per lo streaming
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const openaiResponse = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });

      // Verifica errori nella risposta
      if (!openaiResponse.ok) {
        const errorData = await openaiResponse.json();
        return res.status(openaiResponse.status).json(errorData);
      }

      // Ottieni il reader per lo streaming
      const reader = openaiResponse.body?.getReader();
      if (!reader) {
        return res.status(500).json({ error: 'Failed to get response reader' });
      }

      // Invia i chunk al client mentre vengono ricevuti
      const decoder = new TextDecoder('utf-8');
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        res.write(chunk);
      }

      res.end();
      return;
    } else {
      // Richiesta standard non-streaming
      const openaiResponse = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });

      // Verifica errori nella risposta
      if (!openaiResponse.ok) {
        const errorData = await openaiResponse.json();
        return res.status(openaiResponse.status).json(errorData);
      }

      // Restituisci la risposta al client
      const data = await openaiResponse.json();
      return res.status(200).json(data);
    }
  } catch (error) {
    console.error('OpenAI proxy error:', error);
    return res.status(500).json({ 
      error: 'An error occurred while processing your request',
      details: error instanceof Error ? error.message : String(error)
    });
  }
}