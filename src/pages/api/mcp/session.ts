import type { NextApiRequest, NextApiResponse } from "next";
import { SessionManager } from "@/src/server/mcp/sessionManager";
import { logger } from "@/src/server/mcp/logger";
import { sessionManager } from "@/src/server/mcp/sharedInstances";

/**
 * Unified Session Management API
 * Consolidates: session.ts + sessionMcp.ts
 * Supports: GET (get session info), POST (create/manage sessions), DELETE (cleanup)
 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  logger.info(`MCP Session Request: ${req.method} ${req.url}`);
  const start = Date.now();

  try {
    switch (req.method) {
      case "GET":
        return handleGetSession(req, res, start);
      case "POST":
        return handleCreateOrManageSession(req, res, start);
      case "DELETE":
        return handleDeleteSession(req, res, start);
      default:
        res.setHeader("Allow", ["GET", "POST", "DELETE"]);
        return res.status(405).json({
          success: false,
          error: `Method ${req.method} Not Allowed`
        });
    }
  } catch (error) {
    logger.error("Error in session handler:", { error, method: req.method, url: req.url });
    const duration = Date.now() - start;
    logger.info(`MCP Session Response: 500 - ${duration}ms`);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error in session management"
    });
  }
}

/**
 * GET: Retrieve session information
 */
function handleGetSession(req: NextApiRequest, res: NextApiResponse, start: number) {
  const { sessionId } = req.query;

  if (!sessionId || typeof sessionId !== "string") {
    return res.status(400).json({
      success: false,
      error: "Session ID is required for GET requests"
    });
  }

  const session = sessionManager.getSession(sessionId);
  const duration = Date.now() - start;

  if (!session) {
    logger.info(`MCP Session Response (GET): 404 - ${duration}ms`);
    return res.status(404).json({
      success: false,
      error: "Session not found"
    });
  }

  logger.info(`MCP Session Response (GET): 200 - ${duration}ms`);
  return res.status(200).json({
    success: true,
    sessionId: session.getId(),
    historyCount: session.getHistory().length
  });
}

/**
 * POST: Create or manage session (unified from session.ts + sessionMcp.ts)
 */
function handleCreateOrManageSession(req: NextApiRequest, res: NextApiResponse, start: number) {
  const { sessionId, action = "create" } = req.body;

  let session;
  let created = false;

  switch (action) {
    case "create":
      session = sessionId ? sessionManager.getOrCreateSession(sessionId) : sessionManager.createSession();
      created = !sessionId || sessionId !== session.getId();
      break;

    case "getOrCreate":
      session = sessionManager.getOrCreateSession(sessionId || "default");
      created = !sessionId;
      break;

    case "refresh":
      if (!sessionId) {
        return res.status(400).json({
          success: false,
          error: "Session ID required for refresh action"
        });
      }
      session = sessionManager.getSession(sessionId);
      if (!session) {
        return res.status(404).json({
          success: false,
          error: "Session not found for refresh"
        });
      }
      // Session activity is automatically updated in SessionImpl
      break;

    default:
      return res.status(400).json({
        success: false,
        error: `Unknown action: ${action}. Supported actions: create, getOrCreate, refresh`
      });
  }

  const duration = Date.now() - start;
  logger.info(`MCP Session Response (POST:${action}): 200 - ${duration}ms`);

  return res.status(200).json({
    success: true,
    sessionId: session.getId(),
    created,
    action
  });
}

/**
 * DELETE: Clean up session
 */
function handleDeleteSession(req: NextApiRequest, res: NextApiResponse, start: number) {
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({
      success: false,
      error: "Session ID is required for DELETE requests"
    });
  }

  const deleted = sessionManager.deleteSession(sessionId);
  const duration = Date.now() - start;

  if (!deleted) {
    logger.info(`MCP Session Response (DELETE): 404 - ${duration}ms`);
    return res.status(404).json({
      success: false,
      error: "Session not found or could not be deleted"
    });
  }

  logger.info(`MCP Session Response (DELETE): 200 - ${duration}ms`);
  return res.status(200).json({
    success: true,
    message: `Session ${sessionId} deleted successfully`,
    sessionId
  });
}
