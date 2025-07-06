import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Test basic imports
    const { generateAuthenticationOptions } = await import('@simplewebauthn/server');

    // Test configuration
    const rpID = process.env.NODE_ENV === 'development' ? 'localhost' : 'cadcamfun.xyz';
    const origin = process.env.NODE_ENV === 'development' ? 'https://localhost:3000' : 'https://cadcamfun.xyz';

    // Test basic option generation
    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: 'preferred',
    });

    return res.status(200).json({
      success: true,
      message: 'WebAuthn setup is working',
      config: {
        rpID,
        origin,
        challengeLength: options.challenge.length,
        hasTimeout: !!options.timeout
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('WebAuthn test error:', error);
    return res.status(500).json({
      success: false,
      error: 'WebAuthn setup failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: process.env.NODE_ENV === 'development' && error instanceof Error ? error.stack : undefined
    });
  }
} 