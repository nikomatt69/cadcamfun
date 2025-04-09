// src/lib/api/rateLimiter.ts
import { NextApiRequest, NextApiResponse } from 'next';

const WINDOW_SIZE_MS = 60 * 1000; // 1 minuto
const MAX_REQUESTS_PER_WINDOW = 10;

// Semplice rate limiter in-memory (per produzione usare Redis)
const ipRequests: Record<string, { count: number, resetTime: number }> = {};

export function rateLimiter(req: NextApiRequest, res: NextApiResponse, next: () => Promise<void>) {
  const ip = req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  
  if (!ipRequests[ip] || now > ipRequests[ip].resetTime) {
    ipRequests[ip] = {
      count: 1,
      resetTime: now + WINDOW_SIZE_MS
    };
    return next();
  }
  
  if (ipRequests[ip].count < MAX_REQUESTS_PER_WINDOW) {
    ipRequests[ip].count += 1;
    return next();
  }
  
  // Troppe richieste
  return res.status(429).json({ 
    message: 'Troppe richieste. Riprova più tardi.',
    retryAfter: Math.ceil((ipRequests[ip].resetTime - now) / 1000)
  });
}