// Unified MCP Utilities API
// Consolidates: available-actions.ts + execute-action.ts + process-context.ts
// Routes: ?action=available-actions|execute-action|process-context
import type { NextApiRequest, NextApiResponse } from "next";
import { SessionManager } from "@/src/server/mcp/sessionManager";
import { ContextProcessor } from "@/src/server/mcp/contextProcessor";
import { cadCamAgent } from "@/src/server/mcp/cadcamAgent";
import { validateAction, validateContext } from "@/src/server/mcp/validators";
import { logger } from "@/src/server/mcp/logger";
import { sessionManager, contextProcessor } from "@/src/server/mcp/sharedInstances";
import { AvailableAction, ActionRequest, ActionResponse, RawApplicationContext } from "@/src/server/mcp/types";

/**
 * Unified utilities endpoint for MCP operations
 * Routes based on action query parameter
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({
      success: false,
      error: `Method ${req.method} Not Allowed`
    });
  }

  const { action } = req.query;

  if (!action || typeof action !== "string") {
    return res.status(400).json({
      success: false,
      error: "Action query parameter is required. Supported: available-actions, execute-action, process-context"
    });
  }

  logger.info(`MCP Utilities Request: ${req.method} ${req.url} - Action: ${action}`);
  const start = Date.now();

  try {
    // Route to appropriate utility function
    switch (action) {
      case "available-actions":
        return await handleAvailableActions(req, res, start);
      case "execute-action":
        return await handleExecuteAction(req, res, start);
      case "process-context":
        return await handleProcessContext(req, res, start);
      default:
        return res.status(400).json({
          success: false,
          error: `Unknown action: ${action}. Supported: available-actions, execute-action, process-context`
        });
    }
  } catch (error: any) {
    logger.error("Error in MCP utilities handler:", { error, action, url: req.url });
    const duration = Date.now() - start;
    logger.info(`MCP Utilities Response: 500 - ${duration}ms`);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal error in MCP utilities",
      action
    });
  }
}

/**
 * Handle available actions request (from available-actions.ts)
 */
async function handleAvailableActions(req: NextApiRequest, res: NextApiResponse, start: number) {
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({
      success: false,
      error: "sessionId is required for available-actions"
    });
  }

  const session = sessionManager.getSession(sessionId);
  if (!session) {
    logger.warn(`MCP Session Not Found (available-actions): ${sessionId}`);
    return res.status(404).json({
      success: false,
      error: "Session not found"
    });
  }

  // Get actions from the agent based on context
  const agentActions = await cadCamAgent.getAvailableActions(session);

  // Format agent actions into the standard AvailableAction[] format
  const availableActions: AvailableAction[] = agentActions.map(agentAction => ({
    name: agentAction.name,
    description: agentAction.description,
    parameters: Object.entries(agentAction.parameters).map(([name, exampleValue]) => {
      let type: string = "string";
      let description = `Parameter: ${name}`;
      let required = true;

      if (name === "dimensions" && typeof exampleValue === "object") {
        type = "object";
        description = "Object containing dimension key-value pairs (e.g., { length: 10, width: 5 })";
      } else if (typeof exampleValue === "number") {
        type = "number";
      } else if (typeof exampleValue === "object") {
        type = "object";
        description = "Object containing key-value pairs";
      } else if (typeof exampleValue === "boolean") {
        type = "boolean";
      }

      return {
        name,
        type,
        description,
        required
      };
    }),
    contextualHints: agentAction.contextualHints,
    applicableElementTypes: agentAction.applicableElementTypes
  }));

  const duration = Date.now() - start;
  logger.info(`MCP Utilities Response (available-actions): 200 - ${duration}ms`);
  return res.status(200).json({
    success: true,
    actions: availableActions,
    action: "available-actions"
  });
}

/**
 * Handle execute action request (from execute-action.ts)
 */
async function handleExecuteAction(req: NextApiRequest, res: NextApiResponse, start: number) {
  const actionRequest: ActionRequest = req.body;

  const validationError = validateAction(actionRequest);
  if (validationError) {
    logger.warn(`MCP Validation Error (execute-action): ${validationError}`);
    return res.status(400).json({
      success: false,
      error: validationError
    });
  }

  const session = sessionManager.getSession(actionRequest.sessionId);
  if (!session) {
    logger.warn(`MCP Session Not Found (execute-action): ${actionRequest.sessionId}`);
    return res.status(404).json({
      success: false,
      error: "Session not found"
    });
  }

  // Execute action using the cadCamAgent
  const agentResult = await cadCamAgent.executeAction(
    {
      action: actionRequest.action,
      parameters: actionRequest.parameters
    },
    session
  );

  // Record action in session history
  session.recordAction(actionRequest.action, actionRequest.parameters, {
    success: agentResult.success,
    message: agentResult.message,
    artifacts: agentResult.artifacts
  });

  // Apply context update if available
  if (agentResult.success && agentResult.updatedContext) {
    const currentContext = session.getContext();
    if (currentContext) {
      const newContext = { ...currentContext, ...agentResult.updatedContext };
      session.updateContext(newContext);
      logger.info(`Context updated after action: ${actionRequest.action}`);
    } else {
      logger.warn(`Cannot update context after action ${actionRequest.action}: current context is null.`);
    }
  }

  const duration = Date.now() - start;
  logger.info(`MCP Utilities Response (execute-action): 200 - ${duration}ms`);

  // Map agentResult to ActionResponse format
  const response: ActionResponse = {
    success: agentResult.success,
    result: {
      message: agentResult.message,
      artifacts: agentResult.artifacts
    },
    error: agentResult.success ? undefined : agentResult.message
  };

  return res.status(200).json({
    ...response,
    action: "execute-action"
  });
}

/**
 * Handle process context request (from process-context.ts)
 */
async function handleProcessContext(req: NextApiRequest, res: NextApiResponse, start: number) {
  const rawContext: RawApplicationContext = req.body;

  const validationError = validateContext(rawContext);
  if (validationError) {
    logger.warn(`MCP Validation Error (process-context): ${validationError}`);
    return res.status(400).json({
      success: false,
      error: validationError
    });
  }

  const sessionId = rawContext.sessionId || sessionManager.createSession().getId();
  const session = sessionManager.getOrCreateSession(sessionId);
  const contextWithHistory = {
    ...rawContext,
    sessionHistory: session.getHistory()
  };

  const enrichedContext = await contextProcessor.processContext(contextWithHistory);
  session.updateContext(enrichedContext);

  const duration = Date.now() - start;
  logger.info(`MCP Utilities Response (process-context): 200 - ${duration}ms`);
  return res.status(200).json({
    success: true,
    sessionId,
    context: enrichedContext,
    action: "process-context"
  });
}
