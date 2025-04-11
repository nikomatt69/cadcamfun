// src/pages/api/plugins/serve.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import { PassThrough } from 'stream'; // Per pipe dello stream
// Importa la funzione per scaricare lo stream dal bucket
import { downloadStreamFromBucket } from '@/src/lib/storageService'; 

// Rimuovi dipendenze fs e crypto se non più usate

// Rimuovi PLUGINS_REGISTRY_DIR

// Mappa MIME types rimane utile
const MIME_TYPES: Record<string, string> = {
  '.js': 'application/javascript',
  '.ts': 'application/typescript', // Considera se servire TS direttamente o solo JS compilato
  '.json': 'application/json',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.html': 'text/html',
  '.txt': 'text/plain',
  // Aggiungi altri tipi se necessario
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  
  const { id, file } = req.query;
  
  if (!id || Array.isArray(id) || !file || Array.isArray(file)) {
    return res.status(400).json({ error: 'Invalid request parameters: id and file path are required.' });
  }
  
  try {
    // Sanitize - importante mantenere la sanificazione per prevenire path traversal nel bucket key
    // Assumiamo che l'ID sia sicuro (validato all'installazione)
    // Sanifichiamo solo il percorso del file relativo
    const sanitizedRelativePath = path.normalize(file).replace(/^(\.\.(\/|\\|\$))+/, ''); // Rimuovi ../ all'inizio
    if (sanitizedRelativePath.includes('..')) {
       return res.status(400).json({ error: 'Invalid file path.' });
    }

    // Costruisci la chiave per il bucket
    const bucketKey = `plugins/${id}/${sanitizedRelativePath}`;
    
    console.log(`[Serve API] Attempting to serve file from bucket key: ${bucketKey}`);

    // Ottieni lo stream dal bucket
    const fileStream = await downloadStreamFromBucket(bucketKey);

    // Se lo stream non esiste (file non trovato nel bucket)
    if (!fileStream) {
      console.warn(`[Serve API] File not found in bucket: ${bucketKey}`);
      return res.status(404).json({ error: 'File not found' });
    }

    // Determina il MIME type dall'estensione
    const ext = path.extname(sanitizedRelativePath).toLowerCase();
    const mimeType = MIME_TYPES[ext] || 'application/octet-stream'; // Default sicuro

    // Imposta gli header della risposta
    res.setHeader('Content-Type', mimeType);
    // Aggiungi altri header utili come Cache-Control se appropriato
    // res.setHeader('Cache-Control', 'public, max-age=3600'); // Esempio: cache per 1 ora

    // Esegui il pipe dello stream dal bucket alla risposta HTTP
    // Usa PassThrough per gestire errori nel pipe
    const passThrough = new PassThrough();
    
    passThrough.on('error', (err) => {
        console.error(`[Serve API] Error piping stream for ${bucketKey}:`, err);
        // Cerca di terminare la risposta se non è già stata inviata
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to stream file' });
        } else {
            res.end(); // Termina la connessione se possibile
        }
    });

    // Gestione stream (adattata per Node.js Readable)
    if (typeof (fileStream as any).pipe === 'function') { 
       (fileStream as any).pipe(passThrough).pipe(res);
    } else {
         // Qui si potrebbe gestire ReadableStream per ambienti web/Deno, se necessario
         console.error("[Serve API] Stream type from storage is not a Node.js Readable stream.");
         return res.status(500).json({ error: 'Server error handling stream type.' });
    }

    // --- RIMOZIONE WRAPPER JS --- (Confermato rimosso)
    
  } catch (error) {
    console.error(`[Serve API] Failed processing request for ${id}/${file}:`, error);
    // Evita di inviare dettagli dell'errore interno al client
    return res.status(500).json({ error: 'Internal server error' });
  }
}