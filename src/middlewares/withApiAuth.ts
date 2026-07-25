import { NextApiRequest, NextApiResponse } from "next";
import { auth } from "@/src/lib/auth";
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET || 'your-fallback-secret-key';

/**
 * Funzione helper per verificare JWT dal cookie
 */
async function verifyJWTFromCookie(req: NextApiRequest): Promise<any | null> {
  try {
    const token = req.cookies['auth-token'];
    if (!token) return null;

    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded;
  } catch (error) {
    console.error('JWT verification error:', error);
    return null;
  }
}

/**
 * Middleware unificato per proteggere API routes 
 * Supporta sia Better Auth che JWT personalizzati (priorità ai JWT)
 */
export function withApiAuth(
  handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    try {
      // Prima prova con JWT personalizzato (più affidabile)
      const jwtData = await verifyJWTFromCookie(req);
      if (jwtData) {
        (req as any).user = {
          id: jwtData.userId,
          email: jwtData.email,
          name: jwtData.name
        };
        (req as any).userId = jwtData.userId;
        return await handler(req, res);
      }

      // Fallback a Better Auth se JWT non disponibile
      const session = await auth.api.getSession({
        headers: new Headers(req.headers as Record<string, string>),
      });

      if (session?.user) {
        (req as any).user = session.user;
        (req as any).session = session;
        (req as any).userId = (session.user as any)?.id;
        return await handler(req, res);
      }

      // Nessuna autenticazione valida trovata
      return res.status(401).json({
        success: false,
        message: "Authentication required"
      });

    } catch (error) {
      console.error("Auth middleware error:", error);
      return res.status(401).json({
        success: false,
        message: "Authentication failed"
      });
    }
  };
}

/**
 * Funzione helper per ottenere userId da una request autenticata
 * Supporta sia JWT che Better Auth
 */
export async function getAuthenticatedUserId(req: NextApiRequest, res: NextApiResponse): Promise<string | null> {
  try {
    // Prima prova con JWT personalizzato
    const jwtData = await verifyJWTFromCookie(req);
    if (jwtData) {
      return jwtData.userId;
    }

    // Fallback a Better Auth
    const session = await auth.api.getSession({
      headers: new Headers(req.headers as Record<string, string>),
    });

    if (session?.user) {
      return (session.user as any)?.id || null;
    }

    // Nessuna autenticazione valida
    res.status(401).json({
      success: false,
      message: "Authentication required"
    });
    return null;

  } catch (error) {
    console.error("Authentication error:", error);
    res.status(401).json({
      success: false,
      message: "Authentication failed"
    });
    return null;
  }
}

/**
 * Versione veloce per API AI che richiede solo validazione sessione
 * Priorità a JWT, fallback a Better Auth
 */
export async function getAuthenticatedUserIdFast(req: NextApiRequest, res: NextApiResponse): Promise<string | null> {
  try {
    // Prima prova con JWT (più veloce)
    const jwtData = await verifyJWTFromCookie(req);
    if (jwtData) {
      return jwtData.userId;
    }

    // Fallback a Better Auth
    const session = await auth.api.getSession({
      headers: new Headers(req.headers as Record<string, string>),
    });

    if (session?.user) {
      return (session.user as any)?.id || null;
    }

    res.status(401).json({
      success: false,
      message: "Authentication required"
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
