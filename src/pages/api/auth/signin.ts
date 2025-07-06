// Unified signin endpoint for both web and desktop
import { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/src/lib/prisma";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, password } = req.body;
    const platform = req.headers['x-platform'] || 'web';

    // Input validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        accounts: true,
      },
    });

    if (!user) {
      // Use consistent delay to prevent timing attacks
      await new Promise(resolve => setTimeout(resolve, 100));
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Check if user has a password (for email/password auth)
    const account = user.accounts.find(acc => acc.providerId === 'credential');
    if (!account || !account.password) {
      await new Promise(resolve => setTimeout(resolve, 100));
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, account.password);
    if (!passwordMatch) {
      await new Promise(resolve => setTimeout(resolve, 100));
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Create JWT token with enhanced claims
    const sessionId = `${user.id}-${Date.now()}`;
    const token = jwt.sign(
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

    // Platform-specific cookie settings
    const cookieOptions = platform === 'desktop'
      ? 'HttpOnly; SameSite=Lax; Secure; Path=/'
      : 'HttpOnly; SameSite=Lax; Secure; Path=/';

    const maxAge = 60 * 60 * 24 * 7; // 7 days

    // Set session cookie
    res.setHeader('Set-Cookie', [
      `better-auth.session_token=${token}; ${cookieOptions}; Max-Age=${maxAge}`,
    ]);

    // Log successful login (without sensitive data)
    console.log(`Successful login for user ${user.id} from ${platform} platform`);

    return res.status(200).json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        roles: [], // Add user roles when available
      },
      sessionId,
      platform
    });
  } catch (error) {
    console.error('Sign in error:', error);

    // Enhanced error logging for debugging
    if (process.env.NODE_ENV === 'development') {
      console.error('Sign in error details:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        body: req.body,
        headers: req.headers
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}