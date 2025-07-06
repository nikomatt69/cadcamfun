// src/pages/api/auth/magic-link/verify.ts
import { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/src/lib/prisma";
import { createHash } from "crypto";
import jwt from "jsonwebtoken";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { token, email } = req.body;

    if (!token || !email) {
      return res.status(400).json({
        success: false,
        error: 'Token and email are required'
      });
    }

    // Hash the token to match stored version
    const hashedToken = createHash('sha256').update(token).digest('hex');

    // Find the token in database
    const storedToken = await prisma.token.findFirst({
      where: {
        token: hashedToken,
        type: 'magic-link',
        expiresAt: {
          gt: new Date()
        }
      }
    });

    if (!storedToken) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired magic link'
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: storedToken.userId }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        error: 'User for token not found.'
      });
    }

    // Verify email matches
    if (user.email?.toLowerCase() !== email.toLowerCase()) {
      return res.status(400).json({
        success: false,
        error: 'Invalid magic link'
      });
    }

    // Delete the used token
    await prisma.token.delete({
      where: { id: storedToken.id }
    });

    // Create JWT session
    const platform = (storedToken.metadata as any)?.platform || 'web';
    const sessionId = `${user.id}-${Date.now()}`;

    const jwtToken = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        sessionId,
        platform,
        iat: Math.floor(Date.now() / 1000),
        iss: 'cadcamfun',
        aud: platform === 'desktop' ? 'desktop-app' : 'web-app'
      },
      process.env.NEXTAUTH_SECRET!,
      { expiresIn: '7d' }
    );

    // Set security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // Platform and environment-specific cookie settings
    const isProduction = process.env.NODE_ENV === 'production';
    const isSecure = isProduction || (req.headers.host && req.headers.host.startsWith('localhost:3001'));

    const cookieOptions = platform === 'desktop'
      ? `HttpOnly; SameSite=Lax; Path=/`
      : `HttpOnly; SameSite=Lax; Path=/${isSecure ? '; Secure' : ''}`;

    const maxAge = 60 * 60 * 24 * 7; // 7 days

    // Set session cookie
    res.setHeader('Set-Cookie', [
      `better-auth.session_token=${jwtToken}; ${cookieOptions}; Max-Age=${maxAge}`,
    ]);

    console.log(`Cookie set with options: ${cookieOptions}`);

    // Log successful magic link login
    console.log(`Magic link login successful for user ${user.id} from ${platform} platform`);

    return res.status(200).json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
      },
      sessionId,
      platform,
      message: 'Successfully signed in with magic link'
    });

  } catch (error) {
    console.error('Magic link verification error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}