import type { NextApiRequest, NextApiResponse } from "next";
import { requireAuth } from "src/lib/api/auth";
import { getMCPIntegratedService, MCPIntegratedRequest } from "@/src/lib/ai/mcp/mcpIntegratedService";
import { aiAnalytics } from "@/src/lib/ai/ai-new/aiAnalytics";

/**
 * API endpoint per richieste MCP integrate con Extended Thinking
 * Conforme alla specifica ufficiale Anthropic MCP
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const secretKey = process.env.ANTHROPIC_API_KEY;

  if (!secretKey) {
    // Throw error only in development/build time, avoid crashing production server if env var is momentarily unavailable.
    // Consider more robust error handling or logging here for production.
    if (process.env.NODE_ENV !== "production") {
      throw new Error("Anthropic API key is not defined. Please set ANTHROPIC_API_KEY in your environment variables.");
    }
    console.error("Anthropic API key is not defined.");
  }

  try {
    const { message, context = {}, options = {}, mode = "general" } = req.body;

    // Verifica i parametri richiesti
    if (!message) {
      return res.status(400).json({
        message: "Message is required",
        success: false
      });
    }

    if (process.env.NODE_ENV === "development") {
      console.log(`🔄 Processing MCP request from user ${userId}: ${message.substring(0, 100)}...`);
    }

    // Prepara la richiesta MCP integrata
    const mcpRequest: MCPIntegratedRequest = {
      message,
      context: {
        conversationId: context.conversationId || `api_session_${userId}_${Date.now()}`,
        cadElements: context.cadElements || [],
        currentProject: context.currentProject,
        userPreferences: context.userPreferences || {}
      },
      options: {
        enableThinking: options.enableThinking ?? true,
        enableMCP: options.enableMCP ?? true,
        mcpServers: options.mcpServers || ["cad-tools", "cam-tools"],
        model: options.model || "claude-sonnet-4-20250514",
        temperature: options.temperature ?? 0.7, // Note: Will be auto-set to 1 when thinking is enabled
        maxTokens: options.maxTokens || 6000
      }
    };

    // Registra analisi per la richiesta
    aiAnalytics.trackEvent({
      eventType: "mcp",
      eventName: "api_request_v2",
      success: true,
      metadata: {
        userId,
        mode,
        enableThinking: mcpRequest.options.enableThinking,
        enableMCP: mcpRequest.options.enableMCP,
        serversRequested: mcpRequest.options.mcpServers?.length || 0
      }
    });

    // Elabora la richiesta tramite MCP Integrated Service
    const mcpService = getMCPIntegratedService();
    const response = await mcpService.processWithMCPAndThinking(mcpRequest);

    console.log(`✅ MCP request completed in ${response.processingTime}ms`);
    console.log(`🔧 Tools called: ${response.mcpToolsCalled.length}`);
    console.log(`💡 Suggestions: ${response.proactiveSuggestions.length}`);

    // Registra completion analytics
    aiAnalytics.trackEvent({
      eventType: "mcp",
      eventName: "api_success",
      success: true,
      metadata: {
        userId,
        processingTime: response.processingTime,
        toolsCalled: response.mcpToolsCalled.length,
        suggestionsGenerated: response.proactiveSuggestions.length,
        hasThinking: !!response.thinkingSession
      }
    });

    return res.status(200).json({
      success: true,
      message: `✅ MCP request completed in ${response.processingTime}ms`,
      data: {
        response: response.response,
        thinkingSession: response.thinkingSession,
        mcpToolsCalled: response.mcpToolsCalled,
        proactiveSuggestions: response.proactiveSuggestions,
        processingTime: response.processingTime,
        usage: response.usage
      },
      metadata: {
        timestamp: new Date().toISOString(),
        model: mcpRequest.options.model,
        serversUsed: mcpRequest.options.mcpServers,
        thinkingEnabled: mcpRequest.options.enableThinking
      }
    });
  } catch (error) {
    console.error("❌ Error processing MCP request:", error);

    // Registra error analytics
    aiAnalytics.trackEvent({
      eventType: "error",
      eventName: "mcp_api_error",
      success: false,
      metadata: {
        userId,
        error: error instanceof Error ? error.message : "Unknown error"
      }
    });

    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Error processing MCP request",
      error: {
        type: error instanceof Error ? error.name : "UnknownError",
        timestamp: new Date().toISOString()
      }
    });
  }
}

/**
 * Configurazione per l'API
 */
export const config = {
  api: {
    responseLimit: "8mb",
    bodyParser: {
      sizeLimit: "8mb"
    }
  }
};
