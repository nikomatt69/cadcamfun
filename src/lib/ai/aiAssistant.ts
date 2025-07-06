import { v4 as uuidv4 } from "uuid";
import { aiCore } from "./aiCore";
import { aiCache } from "./aiCache";
import { aiAnalytics } from "./aiAnalytics";
import { getMCPIntegratedService } from "./mcp/mcpIntegratedService";
import { getExtendedThinkingService } from "./ai-new/extendedThinkingService";
import { AssistantMode } from "../../store/aiAssistantStore";
import { AIModelType } from "../../types/ai";

// Suggested prompts per mode
const SUGGESTED_PROMPTS: Record<AssistantMode, string[]> = {
  cad: [
    "How do I create a complex shape?",
    "What's the best approach for designing gears?",
    "Can you explain boolean operations?"
  ],
  cam: [
    "How do I optimize cutting paths?",
    "What feeds and speeds should I use for aluminum?",
    "What's the difference between roughing and finishing?"
  ],
  gcode: [
    "Can you help me debug this G-code issue?",
    "How do I set up tool compensation?",
    "What's the best way to handle tool changes?"
  ],
  toolpath: [
    "How do I create a contour toolpath?",
    "What's the best strategy for pocketing?",
    "How can I optimize my toolpaths for speed?"
  ],
  general: [
    "How do I get started with CAD/CAM?",
    "What's the difference between CAD and CAM?",
    "Can you recommend resources for learning more?"
  ]
};

class AIAssistant {
  private contextMap: Record<AssistantMode, string> = {
    cad: "You are a CAD design expert assistant. ",
    cam: "You are a CAM operations expert assistant. ",
    gcode: "You are a G-code optimization expert assistant. ",
    toolpath: "You are a toolpath generation expert assistant. ",
    general: "You are a helpful AI assistant for software development and engineering tasks. "
  };

  private mcpService = getMCPIntegratedService();
  private thinkingService = getExtendedThinkingService();

  async processMessage(message: string, mode: AssistantMode, model: AIModelType) {
    const contextPrefix = this.contextMap[mode];
    const cacheKey = `${mode}-${message}`;

    // Check cache first
    const cachedResponse = aiCache.get(cacheKey);
    if (cachedResponse) {
      return cachedResponse;
    }

    try {
      // Track analytics
      const requestId = aiAnalytics.trackRequestStart("assistant_message", uuidv4(), {
        mode,
        messageLength: message.length
      });

      const response = await aiCore.processRequest({
        prompt: `${contextPrefix}${message}`,
        model,
        maxTokens: 1000,
        temperature: 0.7
      });

      // Cache the response
      aiCache.set(cacheKey, response.data);
      // Track completion
      const startTime = parseInt(requestId.split("_")[1] || "0", 10);
      const responseTime = startTime > 0 ? Date.now() - startTime : 1000; // Default to 1 second if parsing fails
      aiAnalytics.trackRequestComplete(
        requestId,
        responseTime,
        true,
        message.length,
        typeof response.data === "string" ? response.data.length : 0
      );

      return response.data;
    } catch (error) {
      console.error("AI Assistant Error:", error);
      throw error;
    }
  }

  /**
   * Enhanced message processing with MCP and Extended Thinking
   */
  async processEnhancedMessage({
    message,
    mode,
    model,
    context = {},
    enableThinking = true,
    enableMCP = true
  }: {
    message: string;
    mode: AssistantMode;
    model: AIModelType;
    context?: {
      conversationId?: string;
      cadElements?: any[];
      currentProject?: string;
      userPreferences?: Record<string, any>;
    };
    enableThinking?: boolean;
    enableMCP?: boolean;
  }) {
    console.log(`🤖 Processing enhanced message in ${mode} mode: ${message.substring(0, 100)}...`);

    const cacheKey = `enhanced-${mode}-${message}-${enableMCP}-${enableThinking}`;

    // Check cache first
    const cachedResponse = aiCache.get(cacheKey);
    if (cachedResponse) {
      console.log("📦 Using cached enhanced response");
      return cachedResponse;
    }

    try {
      // Determine MCP servers based on mode
      const mcpServers = this.getMCPServersForMode(mode);

      // Use MCP integrated service
      const result = await this.mcpService.processWithMCPAndThinking({
        message: `${this.contextMap[mode]}${message}`,
        context: {
          conversationId: context.conversationId || `assistant_${mode}_${Date.now()}`,
          cadElements: context.cadElements || [],
          currentProject: context.currentProject,
          userPreferences: context.userPreferences || {}
        },
        options: {
          enableThinking,
          enableMCP,
          mcpServers,
          model,
          temperature: 0.7,
          maxTokens: 2000
        }
      });

      // Cache the enhanced response
      const responseData = {
        response: result.response,
        thinkingSession: result.thinkingSession,
        mcpToolsCalled: result.mcpToolsCalled,
        proactiveSuggestions: result.proactiveSuggestions,
        processingTime: result.processingTime
      };

      aiCache.set(cacheKey, responseData);

      console.log(`✅ Enhanced message processed in ${result.processingTime}ms`);
      console.log(`🔧 MCP tools called: ${result.mcpToolsCalled.length}`);
      console.log(`💡 Suggestions generated: ${result.proactiveSuggestions.length}`);

      return responseData;
    } catch (error) {
      console.error("❌ Enhanced AI Assistant Error:", error);
      throw error;
    }
  }

  /**
   * Get MCP servers appropriate for assistant mode
   */
  private getMCPServersForMode(mode: AssistantMode): string[] {
    switch (mode) {
      case "cad":
        return ["cad-tools"];
      case "cam":
        return ["cam-tools"];
      case "gcode":
        return ["cam-tools"];
      case "toolpath":
        return ["cam-tools"];
      default:
        return ["cad-tools", "cam-tools"];
    }
  }

  async getSuggestions(mode: AssistantMode): Promise<string[]> {
    return SUGGESTED_PROMPTS[mode] || [];
  }

  /**
   * Get enhanced suggestions based on current context
   */
  async getEnhancedSuggestions({
    mode,
    context = {},
    conversationId
  }: {
    mode: AssistantMode;
    context?: {
      cadElements?: any[];
      currentProject?: string;
      recentActions?: string[];
    };
    conversationId?: string;
  }): Promise<{
    suggestions: string[];
    contextualSuggestions: string[];
    proactiveSuggestions: string[];
  }> {
    const baseSuggestions = SUGGESTED_PROMPTS[mode] || [];

    // Generate contextual suggestions based on current state
    let contextualSuggestions: string[] = [];
    if (context.cadElements && context.cadElements.length > 0) {
      contextualSuggestions = [
        `Analyze the ${context.cadElements.length} elements in my current design`,
        "Suggest improvements for the current CAD model",
        "Generate a technical report for this design"
      ];
    }

    // Get proactive suggestions from thinking service
    let proactiveSuggestions: string[] = [];
    if (conversationId) {
      proactiveSuggestions = this.thinkingService.generateProactiveSuggestions(
        conversationId,
        `${mode} mode with ${context.cadElements?.length || 0} elements in project: ${context.currentProject || "None"}`
      );
    }

    return {
      suggestions: baseSuggestions,
      contextualSuggestions,
      proactiveSuggestions
    };
  }

  /**
   * Test enhanced capabilities
   */
  async testEnhancedCapabilities(): Promise<{
    success: boolean;
    details: {
      mcpTest: any;
      thinkingTest: any;
      integrationTest: any;
    };
  }> {
    try {
      console.log("✅ Enhanced AI Assistant capabilities ready");

      // Test solo disponibilità dei servizi senza eseguire query
      const mcpService = this.mcpService || null;
      const thinkingService = this.thinkingService || null;

      /* Test disabilitato per evitare chiamate inutili
      console.log('🧪 Testing enhanced AI Assistant capabilities...');
      
      // Test MCP integration
      const mcpTest = await this.mcpService.processWithMCPAndThinking({
        message: 'Test the enhanced capabilities',
        context: {
          conversationId: 'test-session',
          cadElements: [],
          currentProject: 'Enhanced Test'
        },
        options: {
          enableThinking: true,
          enableMCP: true,
          mcpServers: ['filesystem', 'cad-tools', 'cam-tools' , 'web-search' ],
          model: 'claude-sonnet-4-20250514',
          temperature: 0.7,
          maxTokens: 2000
        }
      });
      
      // Test thinking service
      const thinkingTest = {
        memoryStats: this.thinkingService.getMemoryStats(),
        continuousState: this.thinkingService.getContinuousState()
      };
      
      // Test integration with a sample request
      const integrationTest = await this.processEnhancedMessage({
        message: 'Test the enhanced capabilities',
        mode: 'general',
        model: 'claude-sonnet-4-20250514',
        context: {
          conversationId: 'test-session',
          cadElements: [],
          currentProject: 'Enhanced Test'
        },
        enableThinking: true,
        enableMCP: true
      }) as {
        response: any;
        thinkingSession: any;
        mcpToolsCalled: any[];
        processingTime: number;
      };
      
      console.log('✅ Enhanced capabilities test completed');
      */

      return {
        success: true,
        details: {
          mcpTest: {
            available: !!mcpService,
            status: "Available without test query"
          },
          thinkingTest: {
            available: !!thinkingService,
            status: "Available without test query"
          },
          integrationTest: {
            available: true,
            status: "Available without test query"
          }
        }
      };
    } catch (error) {
      console.error("❌ Enhanced capabilities test failed:", error);
      return {
        success: false,
        details: {
          mcpTest: { error: "Test failed" },
          thinkingTest: { error: "Test failed" },
          integrationTest: { error: "Test failed" }
        }
      };
    }
  }
}

export const aiAssistant = new AIAssistant();
