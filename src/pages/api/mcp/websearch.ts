// Unified WebSearch API for MCP
// Renamed from: websearch-proxy.ts
// Provides: web_search, search_with_context, semantic_search tools
import type { NextApiRequest, NextApiResponse } from "next";
import { webSearchMCPTool } from "../../../lib/ai/mcp/websearchTool";
import { webSearchService } from "../../../lib/ai/websearch/websearchService";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({
      success: false,
      error: `Method ${req.method} not allowed`
    });
  }

  try {
    const { tool, parameters } = req.body;

    if (!tool) {
      return res.status(400).json({
        success: false,
        error: "Tool name is required"
      });
    }

    console.log(`🔍 WebSearch MCP Tool: ${tool}`);

    let result;

    switch (tool) {
      case "web_search":
        // Execute websearch directly
        result = await webSearchMCPTool.execute(parameters);
        break;

      case "search_with_context":
        // Websearch with CAD/CAM context
        const { query, cadContext, options } = parameters;
        const searchResult = await webSearchService.search(query, options, cadContext);
        result = {
          success: searchResult.success,
          results: searchResult.data?.results || [],
          totalResults: searchResult.data?.results?.length || 0,
          searchTime: searchResult.processingTime || 0,
          error: searchResult.error
        };
        break;

      case "semantic_search":
        // Websearch with semantic analysis
        const { query: semQuery, cadElements, projectContext } = parameters;
        const semanticResult = await webSearchService.searchWithSemanticAnalysis(
          semQuery,
          cadElements || [],
          projectContext || {}
        );
        result = {
          success: semanticResult.success,
          results: semanticResult.data?.results || [],
          semanticInsights: semanticResult.data?.semanticInsights,
          error: semanticResult.error
        };
        break;

      default:
        return res.status(400).json({
          success: false,
          error: `Unknown websearch tool: ${tool}`
        });
    }

    return res.status(200).json({
      success: true,
      tool,
      result,
      executedAt: new Date().toISOString()
    });
  } catch (error: any) {
    console.error("❌ WebSearch error:", error);

    return res.status(500).json({
      success: false,
      error: error.message || "Failed to execute websearch tool",
      tool: req.body?.tool || "unknown",
      executedAt: new Date().toISOString(),
      ...(process.env.NODE_ENV === "development" && {
        stack: error.stack,
        parameters: req.body?.parameters
      })
    });
  }
}
