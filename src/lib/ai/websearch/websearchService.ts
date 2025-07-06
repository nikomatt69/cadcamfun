// WebSearch Service - Integrazione Claude AI Web Search
import { z } from "zod";
import { aiCore } from "../aiCore";
import { aiCache } from "../aiCache";
import { aiAnalytics } from "../aiAnalytics";
import { AIResponse, AIModelType } from "../../../types/ai";

// Schema for individual search result/citation, aligning with Anthropic tool
const WebSearchResultSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  // snippet: z.string(), // Original, will be replaced by cited_text or similar
  cited_text: z.string().optional(), // Text snippet used for citation by Claude
  page_age: z.string().optional(), // From Anthropic's web_search_result
  encrypted_content: z.string().optional(), // For multi-turn citation
  encrypted_index: z.string().optional() // For multi-turn citation
  // relevanceScore: z.number().min(0).max(1), // Removed, not standard from Anthropic tool
  // source: z.string().optional(), // Removed or to be derived if needed
  // publishedDate: z.string().optional(), // page_age serves a similar purpose
  // imageUrl: z.string().optional() // Removed, not standard from Anthropic tool
});

// Schema for Claude's response that includes web search results (citations)
const WebSearchResponseSchema = z.object({
  // query: z.string(), // Removed, query is an input to the tool
  assistant_content: z.string(), // Claude's textual response
  results: z.array(WebSearchResultSchema) // Array of cited search results
  // totalResults: z.number(), // Removed, Claude integrates results into its content
  // searchTime: z.number(), // Removed, processingTime of AIResponse is more relevant
  // suggestions: z.array(z.string()).optional(), // Removed, Claude may generate these
  // relatedQueries: z.array(z.string()).optional() // Removed, Claude may generate these
});

export type WebSearchResult = z.infer<typeof WebSearchResultSchema>;
export type WebSearchResponse = z.infer<typeof WebSearchResponseSchema>;

export interface WebSearchOptions {
  maxResults?: number;
  searchDepth?: "shallow" | "deep" | "comprehensive";
  includeImages?: boolean;
  dateRange?: {
    from?: Date;
    to?: Date;
  };
  domains?: string[]; // Limita la ricerca a domini specifici
  excludeDomains?: string[]; // Escludi domini specifici
  language?: string;
  region?: string;
  safeSearch?: boolean;
  contextAware?: boolean; // Usa il contesto del progetto CAD/CAM
}

export interface CADContextForSearch {
  projectType?: string;
  materials?: string[];
  machineType?: string;
  toolTypes?: string[];
  currentOperation?: string;
  technicalTerms?: string[];
  cadElements?: any[];
}

export class WebSearchService {
  private static instance: WebSearchService;
  private searchHistory: Map<string, WebSearchResponse> = new Map();
  private readonly DEFAULT_MAX_RESULTS = 10;
  private readonly CACHE_TTL = 3600000; // 1 ora in millisecondi

  private constructor() {}

  static getInstance(): WebSearchService {
    if (!WebSearchService.instance) {
      WebSearchService.instance = new WebSearchService();
    }
    return WebSearchService.instance;
  }

  /**
   * Esegue una ricerca web utilizzando Claude AI con tool di ricerca
   */
  async search(
    query: string,
    options: WebSearchOptions = {},
    cadContext?: CADContextForSearch
  ): Promise<AIResponse<WebSearchResponse>> {
    const startTime = Date.now();
    const requestId = `websearch_${Date.now()}`;

    const cacheKey = this.generateCacheKey(query, options, cadContext);
    const cachedResult = aiCache.get<WebSearchResponse>(cacheKey);
    if (cachedResult && options.searchDepth !== "comprehensive") {
      // searchDepth might be deprecated if not used by Anthropic tool config
      aiAnalytics.trackEvent({
        eventType: "response",
        eventName: "cache_hit",
        success: true,
        metadata: { query, cacheKey }
      });
      return {
        rawResponse: JSON.stringify(cachedResult), // This rawResponse might need to be structured if it was an Anthropic response
        data: cachedResult,
        success: true,
        processingTime: Date.now() - startTime,
        fromCache: true
      };
    }

    try {
      aiAnalytics.trackRequestStart("websearch", "claude-sonnet-4-20250514", {
        // Model name may vary
        query,
        options: JSON.stringify(options),
        hasContext: !!cadContext
      });

      let userPrompt = query;
      if (cadContext) {
        userPrompt +=
          "\n\nRelevant CAD/CAM Context for your information (use this to inform your search queries if you perform a web search):\n";
        if (cadContext.projectType) userPrompt += `- Project Type: ${cadContext.projectType}\n`;
        if (cadContext.materials && cadContext.materials.length > 0)
          userPrompt += `- Materials: ${cadContext.materials.join(", ")}\n`;
        if (cadContext.machineType) userPrompt += `- Machine Type: ${cadContext.machineType}\n`;
        if (cadContext.currentOperation) userPrompt += `- Current Operation: ${cadContext.currentOperation}\n`;
        if (cadContext.technicalTerms && cadContext.technicalTerms.length > 0)
          userPrompt += `- Key Technical Terms: ${cadContext.technicalTerms.join(", ")}\n`;
        // We might not want to send full cadElements to avoid large prompts
        // if (cadContext.cadElements && cadContext.cadElements.length > 0) userPrompt += `- Number of CAD Elements: ${cadContext.cadElements.length}\n`;
      }

      // System prompt can guide Claude's general behavior with the tool
      const systemPrompt = `You are an expert web search assistant. When a user asks a question that requires up-to-date information or knowledge beyond your training, use the web search tool to find relevant information. Synthesize the information from search results and answer the user's query, citing your sources clearly.`;

      const response = await aiCore.processWithMCPThinking({
        prompt: userPrompt, // User query + CAD context
        systemPrompt: systemPrompt, // General guidance for using the tool
        model: "claude-sonnet-4-20250514",
        temperature: 0.3,
        maxTokens: 4000,
        parseResponse: this.parseSearchResponse,
        context: {
          conversationId: requestId,
          userPreferences: {
            // searchDepth and contextAware are now for internal logic or passed to Claude via prompt
            anthropicToolOptions: {
              // Options for the Anthropic web_search tool
              type: "web_search_20250305",
              name: "web_search",
              max_uses: options.maxResults || 5,
              allowed_domains: options.domains,
              blocked_domains: options.excludeDomains,
              user_location:
                options.region && options.language
                  ? {
                      type: "approximate",
                      country: options.region // Assuming options.region is a country code like 'US'
                      // city: undefined, // Need more info for city/region/timezone if available
                      // timezone: undefined,
                    }
                  : undefined
            }
          }
        },
        enableMCP: true,
        enableThinking: true,
        mcpServers: ["web-search-tools", "web-search"]
      } as any);

      if (response.success && response.data) {
        const validatedResponse = await this.validateAndEnrichResults(response.data as WebSearchResponse, cadContext);
        aiCache.set(cacheKey, validatedResponse);

        const processingTime = Date.now() - startTime;
        aiAnalytics.trackRequestComplete(requestId, processingTime, true, 0, 0);
        return {
          ...response,
          data: validatedResponse,
          processingTime
        };
      }
      throw new Error(response.error || "Failed to get valid search results from aiCore");
    } catch (error) {
      // Traccia errore
      aiAnalytics.trackEvent({
        eventType: "error",
        eventName: "websearch_error",
        errorType: error instanceof Error ? error.name : "unknown",
        success: false,
        metadata: {
          query,
          message: error instanceof Error ? error.message : "Unknown error"
        }
      });

      return {
        rawResponse: null,
        data: null,
        error: error instanceof Error ? error.message : "Unknown error",
        success: false,
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Ricerca avanzata con analisi semantica per CAD/CAM
   */
  async searchWithSemanticAnalysis(
    query: string,
    cadElements: any[],
    projectContext: Record<string, any>
  ): Promise<AIResponse<WebSearchResponse & { semanticInsights?: any }>> {
    const semanticContext = await this.extractSemanticContext(cadElements, projectContext);

    const searchResult = await this.search(
      query,
      {
        contextAware: true
      },
      semanticContext
    );

    if (!searchResult.success || !searchResult.data) {
      return {
        ...searchResult,
        data: searchResult.data ? { ...searchResult.data, semanticInsights: undefined } : null
      } as AIResponse<WebSearchResponse & { semanticInsights?: any }>;
    }

    const semanticInsights = await this.analyzeSearchResults(searchResult.data.results, semanticContext);

    return {
      ...searchResult,
      data: {
        ...searchResult.data,
        semanticInsights
      }
    };
  }

  /**
   * Ricerca batch per multiple query correlate
   */
  async batchSearch(queries: string[], options: WebSearchOptions = {}): Promise<AIResponse<WebSearchResponse[]>> {
    const startTime = Date.now();
    const individualResults: WebSearchResponse[] = [];
    const errors: string[] = [];

    const batchSize = 3;
    for (let i = 0; i < queries.length; i += batchSize) {
      const batchQueries = queries.slice(i, i + batchSize);
      const batchPromises = batchQueries.map(q => this.search(q, options));
      const settledResults = await Promise.allSettled(batchPromises);

      settledResults.forEach((resultPromise, index) => {
        if (resultPromise.status === "fulfilled") {
          const searchOperationResult = resultPromise.value;
          if (searchOperationResult.success && searchOperationResult.data) {
            individualResults.push(searchOperationResult.data);
          } else {
            errors.push(
              `Query "${batchQueries[index]}": ${searchOperationResult.error || "Unknown error during search operation"}`
            );
          }
        } else {
          errors.push(
            `Query "${batchQueries[index]}": ${resultPromise.reason?.message || "Unknown error (promise rejected)"}`
          );
        }
      });
    }

    return {
      rawResponse: null,
      data: individualResults,
      success: errors.length === 0,
      error: errors.length > 0 ? errors.join("; ") : undefined,
      processingTime: Date.now() - startTime
    };
  }

  /**
   * Parser per la risposta di ricerca
   */
  private parseSearchResponse = async (anthropicResponse: any): Promise<WebSearchResponse> => {
    // Assuming anthropicResponse is the parsed JSON from Anthropic's API call
    // that used the web_search tool.
    let assistantContent = "";
    const citedResults: WebSearchResult[] = [];

    if (Array.isArray(anthropicResponse.content)) {
      for (const block of anthropicResponse.content) {
        if (block.type === "text") {
          assistantContent += block.text + " ";
        }
        // The actual search results are not directly in the assistant's final content block this way.
        // They are part of the tool_use and tool_result exchange that happens *before* this final content.
        // Claude synthesizes the response *using* those results, and provides citations.
        // We need to capture the citations from the text blocks.
        if (block.type === "text" && block.citations) {
          for (const citation of block.citations) {
            if (citation.type === "web_search_result_location") {
              citedResults.push({
                title: citation.title,
                url: citation.url,
                cited_text: citation.cited_text
                // page_age might be available if we captured the web_search_tool_result block earlier
                // For now, we'll make it optional or try to find it if aiCore provides the full exchange.
                // Assuming for now `page_age`, `encrypted_content`, `encrypted_index` are handled by aiCore or not directly stored here.
              });
            }
          }
        }
      }
    }

    // This parsing strategy needs to be robust. If aiCore provides a more direct
    // list of used search results (from the `web_search_tool_result` blocks),
    // that would be a better source for `page_age`, `encrypted_content`, etc.
    // For now, we focus on what Claude *cites* in its final response.

    const responseData = {
      assistant_content: assistantContent.trim(),
      results: citedResults
    };

    try {
      return WebSearchResponseSchema.parse(responseData);
    } catch (error) {
      console.error("Failed to parse search response into WebSearchResponseSchema:", error);
      console.error("Offending data for WebSearchResponseSchema:", responseData);
      // Fallback or rethrow, depending on desired error handling
      // For now, let's return a minimal valid response to avoid breaking flows too much,
      // but this indicates a parsing or data structure issue.
      return {
        assistant_content: "Error parsing search results.",
        results: []
      };
    }
  };

  /**
   * Valida e arricchisce i risultati di ricerca
   */
  private async validateAndEnrichResults(
    response: WebSearchResponse, // Already parsed to new schema
    cadContext?: CADContextForSearch
  ): Promise<WebSearchResponse> {
    // Validation for the new structure (if any specific needed beyond Zod)
    // Enrichment for the new structure (if any)

    // Relevance scoring and adjustment based on technical terms is removed
    // as relevance is now determined by Claude when it selects what to cite.

    // Example: Ensure all cited URLs are absolute
    response.results = response.results.map(result => {
      try {
        const parsedUrl = new URL(result.url);
        return { ...result, url: parsedUrl.href };
      } catch (e) {
        // If URL is invalid, keep original or mark as problematic
        return { ...result, url: result.url + " (invalid_url)" };
      }
    });

    return response;
  }

  /**
   * Estrae contesto semantico dagli elementi CAD
   */
  private async extractSemanticContext(
    cadElements: any[],
    projectContext: Record<string, any>
  ): Promise<CADContextForSearch> {
    const context: CADContextForSearch = {
      projectType: projectContext.projectType || "general",
      materials: [],
      toolTypes: [],
      technicalTerms: [],
      cadElements: []
    };

    // Analizza elementi CAD per estrarre informazioni
    cadElements.forEach(element => {
      if (element.material && !context.materials?.includes(element.material)) {
        context.materials?.push(element.material);
      }
      if (element.toolType && !context.toolTypes?.includes(element.toolType)) {
        context.toolTypes?.push(element.toolType);
      }
      context.cadElements?.push(element);
    });

    // Estrai termini tecnici dal contesto
    if (projectContext.description) {
      const technicalTerms = this.extractTechnicalTerms(projectContext.description);
      context.technicalTerms = technicalTerms;
    }

    return context;
  }

  /**
   * Estrae termini tecnici da un testo
   */
  private extractTechnicalTerms(text: string): string[] {
    // Lista di termini tecnici comuni in CAD/CAM
    const technicalKeywords = [
      "tolerance",
      "roughness",
      "feed rate",
      "spindle speed",
      "toolpath",
      "g-code",
      "surface finish",
      "chip load",
      "cutting speed",
      "depth of cut",
      "step over",
      "plunge rate",
      "coolant",
      "fixture",
      "workholding",
      "datum",
      "coordinate system"
    ];

    const found: string[] = [];
    const lowerText = text.toLowerCase();

    technicalKeywords.forEach(keyword => {
      if (lowerText.includes(keyword)) {
        found.push(keyword);
      }
    });

    return found;
  }

  /**
   * Analizza semanticamente i risultati di ricerca
   */
  private async analyzeSearchResults(results: WebSearchResult[], context: CADContextForSearch): Promise<any> {
    // Analisi semantica dei risultati
    const analysis = {
      topCategories: this.categorizeResults(results),
      relevanceDistribution: this.calculateRelevanceDistribution(results),
      contextAlignment: this.assessContextAlignment(results, context),
      recommendations: [] as string[]
    };

    // Genera raccomandazioni basate sull'analisi
    if (analysis.contextAlignment < 0.5) {
      analysis.recommendations.push("Consider refining search terms with more specific technical vocabulary");
    }

    return analysis;
  }

  /**
   * Categorizza i risultati di ricerca
   */
  private categorizeResults(results: WebSearchResult[]): Record<string, number> {
    const categories: Record<string, number> = {
      tutorial: 0,
      documentation: 0,
      forum: 0,
      research: 0,
      commercial: 0,
      other: 0
    };

    results.forEach(result => {
      const url = result.url.toLowerCase();
      const title = result.title.toLowerCase();

      if (url.includes("tutorial") || title.includes("how to")) {
        categories.tutorial++;
      } else if (url.includes("docs") || url.includes("documentation")) {
        categories.documentation++;
      } else if (url.includes("forum") || url.includes("community")) {
        categories.forum++;
      } else if (url.includes(".edu") || url.includes("research")) {
        categories.research++;
      } else if (url.includes("shop") || url.includes("buy")) {
        categories.commercial++;
      } else {
        categories.other++;
      }
    });

    return categories;
  }

  /**
   * Calcola la distribuzione della rilevanza
   */
  private calculateRelevanceDistribution(results: WebSearchResult[]): {
    high: number;
    medium: number;
    low: number;
  } {
    const distribution = {
      high: 0,
      medium: 0,
      low: 0
    };

    // results.forEach(result => { // result.relevanceScore is removed
    //   if (result.relevanceScore >= 0.8) {
    //     distribution.high++;
    //   } else if (result.relevanceScore >= 0.5) {
    //     distribution.medium++;
    //   } else {
    //     distribution.low++;
    //   }
    // });

    return distribution;
  }

  /**
   * Valuta l'allineamento con il contesto
   */
  private assessContextAlignment(results: WebSearchResult[], context: CADContextForSearch): number {
    if (!context.technicalTerms || context.technicalTerms.length === 0) {
      return 1; // Nessun contesto specifico
    }

    let alignmentScore = 0;
    // Ensure context.technicalTerms is not undefined before calculating totalChecks
    const totalChecks = results.length * (context.technicalTerms?.length || 0);

    results.forEach(result => {
      const text = `${result.title} ${result.cited_text || ""}`.toLowerCase(); // Changed from snippet
      context.technicalTerms?.forEach(term => {
        if (text.includes(term.toLowerCase())) {
          alignmentScore++;
        }
      });
    });

    return totalChecks > 0 ? alignmentScore / totalChecks : 0;
  }

  /**
   * Genera chiave cache unica
   */
  private generateCacheKey(query: string, options: WebSearchOptions, context?: CADContextForSearch): string {
    const keyParts = [
      query,
      options.searchDepth || "shallow",
      options.maxResults || this.DEFAULT_MAX_RESULTS,
      options.language || "en",
      options.region || "global"
    ];

    if (context) {
      keyParts.push(JSON.stringify(context));
    }

    return `websearch_${keyParts.join("_")}`.replace(/\s+/g, "_");
  }

  /**
   * Ottieni storia delle ricerche
   */
  getSearchHistory(): WebSearchResponse[] {
    return Array.from(this.searchHistory.values());
  }

  /**
   * Pulisci cache e storia
   */
  clearCache(): void {
    this.searchHistory.clear();
    // La cache di aiCache verrà gestita dal suo sistema di pulizia
  }
}

// Esporta istanza singleton
export const webSearchService = WebSearchService.getInstance();
