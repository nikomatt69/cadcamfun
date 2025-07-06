// src/lib/api/helpers.ts
import { NextApiRequest, NextApiResponse } from "next";
import { auth } from "@/src/lib/auth";

/**
 * Send a success response
 */
export function sendSuccessResponse(res: NextApiResponse, data: any = null, message = "Success", statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    message,
    data
  });
}

/**
 * Send an error response
 */
export function sendErrorResponse(res: NextApiResponse, message: string, statusCode = 400, errors: any = null) {
  return res.status(statusCode).json({
    success: false,
    message,
    errors
  });
}

export function handlePrismaError(error: any, res: NextApiResponse) {
  console.error("Database error:", error);

  if (error.code === "P2002") {
    return res.status(409).json({
      message: "Un record con questi dati esiste già."
    });
  }

  if (error.code === "P2025") {
    return res.status(404).json({
      message: "Record non trovato."
    });
  }

  if (error.code === "P2003") {
    return res.status(400).json({
      message: "Violazione di integrità referenziale."
    });
  }

  return res.status(500).json({
    message: "Errore del database",
    error: process.env.NODE_ENV === "development" ? error.message : undefined
  });
}

/**
 * Handle API errors consistently
 */
export function handleApiError(error: any, res: NextApiResponse) {
  console.error("API Error:", error);

  if (error.name === "PrismaClientKnownRequestError") {
    // Handle Prisma-specific errors
    switch (error.code) {
      case "P2002":
        return sendErrorResponse(res, "Duplicate entry exists", 409);
      case "P2025":
        return sendErrorResponse(res, "Record not found", 404);
      default:
        return sendErrorResponse(res, "Database error", 500);
    }
  }

  // Generic error handling
  return sendErrorResponse(res, error.message || "An unexpected error occurred", error.statusCode || 500);
}

/**
 * Ensure user is authenticated using Better Auth
 */
export async function ensureAuthenticated(req: NextApiRequest, res: NextApiResponse) {
  try {
    const session = await auth.api.getSession({
      headers: req.headers as any,
    });

    if (!session || !session.user) {
      sendErrorResponse(res, "Unauthorized", 401);
      return { authenticated: false, userId: null };
    }

    return {
      authenticated: true,
      userId: (session.user as any)?.id
    };
  } catch (error) {
    console.error("Authentication error:", error);
    sendErrorResponse(res, "Authentication failed", 401);
    return { authenticated: false, userId: null };
  }
}
