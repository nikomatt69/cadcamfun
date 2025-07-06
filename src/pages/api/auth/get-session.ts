// Unified session endpoint for both web and desktop
import { NextApiRequest, NextApiResponse } from "next";
import jwt from "jsonwebtoken";
import { prisma } from "@/src/lib/prisma";

interface SessionResponse {
  user: any;
  session: {
    user: any;
    expires: string;
    sessionId: string;
  } | null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Enhanced platform detection
    const platform = req.headers['x-platform'] || 'web';
    const userAgent = req.headers['user-agent'] || '';

    // Try to get JWT token from cookies or Authorization header
    const token = req.cookies["better-auth.session_token"] ||
      req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      return res.status(200).json({ user: null, session: null });
    }

    // Verify JWT token with enhanced error handling
    let decoded: any;
    try {
      decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET!) as any;
    } catch (jwtError) {
      // Token invalid or expired
      console.error("JWT verification failed:", jwtError);
      return res.status(200).json({ user: null, session: null });
    }

    if (!decoded.userId) {
      return res.status(200).json({ user: null, session: null });
    }

    // Get user from database with enhanced selection
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        name: true,
        email: true,
        emailVerified: true,
        image: true,
        createdAt: true,
        updatedAt: true,
        // Add roles if available in your schema
        // roles: true,
      },
    });

    if (!user) {
      return res.status(200).json({ user: null, session: null });
    }

    // Enhanced session data with platform info
    const sessionData = {
      user: {
        ...user,
        roles: [], // Add user roles here when available
      },
      expires: new Date(decoded.exp * 1000).toISOString(),
      sessionId: decoded.sessionId || `${user.id}-${Date.now()}`,
    };

    // Set security headers based on platform
    if (platform === 'desktop') {
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    } else {
      res.setHeader('X-Frame-Options', 'DENY');
    }

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // Return session data
    return res.status(200).json({
      user: sessionData.user,
      session: sessionData,
    });
  } catch (error) {
    console.error("Session validation error:", error);

    // Enhanced error logging for debugging
    if (process.env.NODE_ENV === 'development') {
      console.error("Session validation details:", {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        headers: req.headers,
        cookies: req.cookies
      });
    }

    return res.status(200).json({ user: null, session: null });
  }
}