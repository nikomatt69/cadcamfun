import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';

interface HealthResponse {
  status: 'ok' | 'error';
  timestamp: string;
  version: string;
  services: {
    database: 'ok' | 'error';
    auth: 'ok' | 'error';
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<HealthResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      version: '1.1.0',
      services: {
        database: 'error',
        auth: 'error'
      }
    });
  }

  const healthCheck: HealthResponse = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.1.0',
    services: {
      database: 'ok',
      auth: 'ok'
    }
  };

  try {
    // Test database connectivity
    await prisma.$queryRaw`SELECT 1`;
    healthCheck.services.database = 'ok';
  } catch (error) {
    console.error('Database health check failed:', error);
    healthCheck.services.database = 'error';
    healthCheck.status = 'error';
  }

  // Auth service is assumed OK if we get here
  // Better Auth doesn't need a specific health check

  // Return appropriate status code
  const statusCode = healthCheck.status === 'ok' ? 200 : 503;
  
  return res.status(statusCode).json(healthCheck);
}