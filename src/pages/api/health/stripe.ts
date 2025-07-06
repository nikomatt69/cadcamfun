import { NextApiRequest, NextApiResponse } from 'next';
import { checkStripeHealth } from '@/src/lib/stripe-server';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const healthCheck = await checkStripeHealth();
    
    if (healthCheck.healthy) {
      return res.status(200).json({
        status: 'healthy',
        message: healthCheck.message,
        timestamp: new Date().toISOString(),
        service: 'stripe',
      });
    } else {
      return res.status(503).json({
        status: 'unhealthy',
        message: healthCheck.message,
        timestamp: new Date().toISOString(),
        service: 'stripe',
      });
    }
  } catch (error: any) {
    return res.status(500).json({
      status: 'error',
      message: `Health check failed: ${error.message}`,
      timestamp: new Date().toISOString(),
      service: 'stripe',
    });
  }
}