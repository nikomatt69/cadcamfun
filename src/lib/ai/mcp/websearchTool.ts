// MCP WebSearch Tool - Integrazione con Model Context Protocol
import { z } from "zod";
import { webSearchService } from "../websearch/websearchService";
import type { WebSearchOptions, CADContextForSearch } from "../websearch/websearchService";

// Schema per i parametri del tool
const WebSearchToolParamsSchema = z.object({
  query: z.string().describe("The search query"),
  options: z
    .object({
      maxResults: z.number().optional().describe("Maximum number of results to return"),
      searchDepth: z.enum(["shallow", "deep", "comprehensive"]).optional(),
      includeImages: z.boolean().optional(),
      dateRange: z
        .object({
          from: z.string().optional(),
          to: z.string().optional()
        })
        .optional(),
      domains: z.array(z.string()).optional(),
      excludeDomains: z.array(z.string()).optional(),
      language: z.string().optional(),
      region: z.string().optional(),
      contextAware: z.boolean().optional()
    })
    .optional(),
  cadContext: z
    .object({
      projectType: z.string().optional(),
      materials: z.array(z.string()).optional(),
      machineType: z.string().optional(),
      toolTypes: z.array(z.string()).optional(),
      currentOperation: z.string().optional(),
      technicalTerms: z.array(z.string()).optional()
    })
    .optional()
});

export type WebSearchToolParams = z.infer<typeof WebSearchToolParamsSchema>;

/**
 * MCP Tool per WebSearch
 */
export class WebSearchMCPTool {
  name = "web_search";
  description = "Search the web for information, with special optimization for CAD/CAM and manufacturing topics";

  // Schema per validazione parametri
  inputSchema = WebSearchToolParamsSchema;

  /**
   * Esegue il tool di ricerca web
   */
  async execute(params: WebSearchToolParams): Promise<any> {
    try {
      // Valida i parametri
      const validatedParams = WebSearchToolParamsSchema.parse(params);

      // Converti date string in Date objects se presenti
      const options: WebSearchOptions = {
        ...validatedParams.options,
        dateRange: validatedParams.options?.dateRange
          ? {
              from: validatedParams.options.dateRange.from
                ? new Date(validatedParams.options.dateRange.from)
                : undefined,
              to: validatedParams.options.dateRange.to ? new Date(validatedParams.options.dateRange.to) : undefined
            }
          : undefined
      };

      // Esegui la ricerca
      const result = await webSearchService.search(validatedParams.query, options, validatedParams.cadContext);

      if (result.success && result.data) {
        return {
          success: true,
          results: result.data.results,
          totalResults: result.data.results.length,
          searchTime: result.processingTime,
          // suggestions: result.data.suggestions,
          // relatedQueries: result.data.relatedQueries,
          metadata: {
            query: validatedParams.query,
            options: validatedParams.options,
            cadContext: validatedParams.cadContext,
            processingTime: result.processingTime
          }
        };
      } else {
        throw new Error(result.error || "Search failed");
      }
    } catch (error) {
      console.error("WebSearch MCP Tool error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        metadata: {
          query: params.query,
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  /**
   * Ottieni la descrizione dettagliata del tool per il sistema MCP
   */
  getToolDefinition() {
    return {
      name: this.name,
      description: this.description,
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query"
          },
          options: {
            type: "object",
            properties: {
              maxResults: {
                type: "number",
                description: "Maximum number of results (1-50)"
              },
              searchDepth: {
                type: "string",
                enum: ["shallow", "deep", "comprehensive"],
                description: "Search depth level"
              },
              includeImages: {
                type: "boolean",
                description: "Include image results"
              },
              dateRange: {
                type: "object",
                properties: {
                  from: {
                    type: "string",
                    format: "date-time",
                    description: "Start date for filtering results"
                  },
                  to: {
                    type: "string",
                    format: "date-time",
                    description: "End date for filtering results"
                  }
                }
              },
              domains: {
                type: "array",
                items: { type: "string" },
                description: "Limit search to specific domains"
              },
              excludeDomains: {
                type: "array",
                items: { type: "string" },
                description: "Exclude specific domains from search"
              },
              language: {
                type: "string",
                description: "Language code (e.g., en, it, de)"
              },
              region: {
                type: "string",
                description: "Region code for localized results"
              },
              contextAware: {
                type: "boolean",
                description: "Use CAD/CAM context for better results"
              }
            }
          },
          cadContext: {
            type: "object",
            properties: {
              projectType: {
                type: "string",
                description: "Type of CAD/CAM project"
              },
              materials: {
                type: "array",
                items: { type: "string" },
                description: "Materials being used"
              },
              machineType: {
                type: "string",
                description: "Type of CNC machine"
              },
              toolTypes: {
                type: "array",
                items: { type: "string" },
                description: "Types of cutting tools"
              },
              currentOperation: {
                type: "string",
                description: "Current machining operation"
              },
              technicalTerms: {
                type: "array",
                items: { type: "string" },
                description: "Technical terms for context"
              }
            }
          }
        },
        required: ["query"]
      },
      examples: [
        {
          query: "best cutting parameters for aluminum 6061",
          options: {
            searchDepth: "deep",
            maxResults: 10,
            contextAware: true
          },
          cadContext: {
            materials: ["aluminum 6061"],
            machineType: "3-axis CNC mill",
            currentOperation: "face milling"
          }
        },
        {
          query: "G-code optimization techniques",
          options: {
            searchDepth: "comprehensive",
            domains: ["cnccookbook.com", "practicalmachinist.com"],
            dateRange: {
              from: "2023-01-01T00:00:00Z"
            }
          }
        }
      ]
    };
  }
}

// Esporta istanza del tool
export const webSearchMCPTool = new WebSearchMCPTool();

// Funzione helper per registrare il tool nel sistema MCP
export function registerWebSearchTool(mcpServer: any) {
  mcpServer.registerTool(webSearchMCPTool.getToolDefinition(), async (params: any) => {
    return webSearchMCPTool.execute(params);
  });
}
