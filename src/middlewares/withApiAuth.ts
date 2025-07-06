import { NextApiRequest, NextApiResponse } from "next";
import { auth } from "@/src/lib/auth";

/**
 * Middleware to protect API routes that require authentication with Better Auth
 */
export function withApiAuth(handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    try {
      // Get session from Better Auth
      const session = await auth.api.getSession({
        headers: req.headers as any,
      });

      // If no session exists, user is not authenticated
      if (!session) {
        return res.status(401).json({
          success: false,
          message: "Authentication required"
        });
      }

      // Add user ID to the request for downstream handlers
      (req as any).userId = (session.user as any)?.id;

      // Call the original handler
      return handler(req, res);
    } catch (error) {
      console.error("Authentication error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error during authentication"
      });
    }
  };
}

// Extend the NextApiRequest interface to include userId
declare module "next" {
  interface NextApiRequest {
    userId?: string;
  }
}
