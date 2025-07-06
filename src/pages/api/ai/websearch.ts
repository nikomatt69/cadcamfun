// API Endpoint per WebSearch
import type { NextApiRequest, NextApiResponse } from "next";
// import { aiCore } from '@/src/lib/ai/aiCore'; // aiCore is used by webSearchService
import { webSearchService, WebSearchOptions, CADContextForSearch } from "@/src/lib/ai/websearch/websearchService";
import { requireAuth } from "@/src/lib/api/auth";

interface WebSearchApiRequest extends NextApiRequest {
  body: {
    query: string;
    options?: WebSearchOptions;
    cadContext?: CADContextForSearch;
    useSemanticAnalysis?: boolean;
    // conversationId?: string; // conversationId is handled by the service if needed
  };
}

interface BatchWebSearchApiRequest extends NextApiRequest {
  body: {
    queries: string[];
    options?: WebSearchOptions;
    // coordinateResults?: boolean; // This logic might be internal to batchSearch or deprecated
  };
}

export default async function handler(
  req: NextApiRequest, // Use general NextApiRequest here
  res: NextApiResponse
) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
      message: "Only POST requests are accepted"
    });
  }

  try {
    // Check if body.queries exists and is an array for type assertion
    const isBatchRequest = Array.isArray(req.body.queries);

    if (isBatchRequest) {
      const batchReq = req as BatchWebSearchApiRequest;
      const { queries, options } = batchReq.body;

      if (!queries || queries.length === 0) {
        return res.status(400).json({
          error: "Bad request",
          message: "Queries array is required for batch search"
        });
      }
      if (queries.length > 10) {
        return res.status(400).json({
          error: "Bad request",
          message: "Maximum 10 queries allowed per batch request"
        });
      }

      // Use the refactored webSearchService.batchSearch
      const result = await webSearchService.batchSearch(queries, options);

      return res.status(result.success ? 200 : 500).json({
        success: result.success,
        batchData: result.data, // result.data is WebSearchResponse[]
        error: result.error,
        // metadata: result.metadata, // metadata not standard in AIResponse
        processingTime: result.processingTime
      });
    } else {
      const singleReq = req as WebSearchApiRequest;
      const {
        query,
        options,
        cadContext,
        useSemanticAnalysis
        // conversationId // Handled by service
      } = singleReq.body;

      if (!query || typeof query !== "string" || query.trim().length === 0) {
        return res.status(400).json({
          error: "Bad request",
          message: "Query is required and must be a non-empty string"
        });
      }

      // Validation for options can remain similar if they are still relevant for how Claude is prompted
      // or for any pre/post processing, but direct tool control options are now inside anthropicToolOptions.

      let result;
      if (useSemanticAnalysis && cadContext) {
        // Assuming cadContext is needed for semantic analysis
        result = await webSearchService.searchWithSemanticAnalysis(query, cadContext.cadElements || [], cadContext);
      } else {
        result = await webSearchService.search(query, options, cadContext);
      }

      if (result.success && result.data) {
        console.log(`WebSearch API - Success: "${query}" - ${result.data.results.length} citations`);
        return res.status(200).json({
          success: true,
          query: query, // Keep original query for context in response
          assistant_content: result.data.assistant_content,
          results: result.data.results, // Cited results
          semanticInsights: (result.data as any).semanticInsights, // If present
          // thinkingSession: result.thinkingSession, // if aiCore provides this
          processingTime: result.processingTime
        });
      } else {
        console.error(`WebSearch API - Error: "${query}" - ${result.error}`);
        return res.status(500).json({
          success: false,
          query: query,
          error: result.error || "Failed to process web search",
          processingTime: result.processingTime
        });
      }
    }
  } catch (error) {
    console.error("WebSearch API critical error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown critical error occurred"
    });
  }
}

// Configurazione per gestire body di grandi dimensioni (can remain)
export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb"
    }
  }
};
