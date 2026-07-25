// src/lib/api/auth.ts

import { NextApiRequest, NextApiResponse } from "next";
import { auth } from "@/src/lib/auth";

type AuthResult = {
  userId: string | null;
  authenticated: boolean;
};

/**
 * Middleware to check authentication and extract the user ID using temporary session validation
 */
export async function ensureAuthenticated(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<AuthResult> {
  try {
    // For now, use a simpler approach until Better Auth is fixed
    const jwt = require('jsonwebtoken');

    // Try to get JWT token from cookies or Authorization header
    const token = req.cookies["better-auth.session_token"] ||
      req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      return { authenticated: false, userId: null };
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET!) as any;

    if (decoded.userId) {
      return {
        authenticated: true,
        userId: decoded.userId
      };
    }

    return { authenticated: false, userId: null };
  } catch (error) {
    console.error("Authentication error:", error);
    return { authenticated: false, userId: null };
  }
}


/**
 * Fast authentication for AI API routes using JWT validation
 * Optimized for speed with JWT-first approach
 */
export async function requireAuthFast(req: NextApiRequest, res: NextApiResponse): Promise<string | null> {
  try {
    const jwt = require('jsonwebtoken');

    // Try to get JWT token from cookies or Authorization header
    const token = req.cookies["better-auth.session_token"] ||
      req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      res.status(401).json({
        success: false,
        message: "Authentication required"
      });
      return null;
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET!) as any;

    if (decoded.userId) {
      return decoded.userId;
    }

    res.status(401).json({
      success: false,
      message: "Invalid token"
    });
    return null;
  } catch (error) {
    console.error("Fast auth error:", error);
    res.status(401).json({
      success: false,
      message: "Authentication failed"
    });
    return null;
  }
}

/**
 * Middleware to require authentication for API routes
 * Returns userId if authenticated, otherwise sends a 401 response
 * RIPRISTINATO: Questa funzione funzionava bene prima
 */
export async function requireAuth(req: NextApiRequest, res: NextApiResponse): Promise<string | null> {
  try {
    // Prima prova con JWT personalizzato (se disponibile)
    const jwt = require('jsonwebtoken');
    const token = req.cookies['auth-token'] ||
      req.cookies["better-auth.session_token"] ||
      req.headers.authorization?.replace("Bearer ", "");

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET!) as any;
        if (decoded.userId) {
          return decoded.userId;
        }
      } catch (jwtError) {
        // JWT failed, try Better Auth
      }
    }

    // Fallback a Better Auth
    const session = await auth.api.getSession({
      headers: req.headers as any,
    });

    if (session?.user?.id) {
      return session.user.id;
    }

    // Nessuna autenticazione valida
    res.status(401).json({
      success: false,
      message: "Authentication required"
    });
    return null;

  } catch (error) {
    console.error("requireAuth error:", error);
    res.status(401).json({
      success: false,
      message: "Authentication failed"
    });
    return null;
  }
}

/**
 * Helper for API response handling
 */
export function sendSuccessResponse(res: NextApiResponse, data: any, message?: string) {
  return res.status(200).json({
    success: true,
    data,
    message
  });
}

/**
 * Helper for error response handling
 */
export function sendErrorResponse(res: NextApiResponse, message: string, statusCode: number = 400) {
  return res.status(statusCode).json({
    success: false,
    message
  });
}

/**
 * Helper for API error handling
 */
export function handleApiError(error: any, res: NextApiResponse) {
  console.error("API Error:", error);

  if (error.code === "P2025") {
    return sendErrorResponse(res, "Record not found", 404);
  }

  return sendErrorResponse(res, error.message || "An unexpected error occurred", 500);
}
