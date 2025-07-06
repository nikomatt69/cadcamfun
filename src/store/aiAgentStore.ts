import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  getMCPIntegratedService,
  MCPIntegratedRequest,
  MCPIntegratedResponse
} from "../lib/ai/mcp/mcpIntegratedService";
import { getMCPClient } from "../lib/ai/mcp/mcpOfficialClient";
import { getConnectedServers } from "./mcpServerStore";

// Enhanced types for Claude MCP integration
export interface ConversationEntry {
  id: string;
  timestamp: Date;
  role: "user" | "assistant" | "system";
  content: string;
  mode: string;
  context: {
    projectId?: string;
    fileReferences?: string[];
    mcpToolsUsed?: Array<{
      server: string;
      tool: string;
      success: boolean;
      processingTime: number;
    }>;
    thinkingProcessId?: string;
    claudeMcpData?: {
      processingTime: number;
      serverStatuses: Record<string, string>;
      thinkingSession?: any;
      proactiveSuggestions: string[];
      cacheHit: boolean;
    };
    importance: number; // 0-1, for context relevance
    semanticVector?: number[]; // For semantic similarity
    tags: string[];
    relatedEntries?: string[]; // IDs of related conversation entries
  };
}

export interface ProjectContext {
  id: string;
  name: string;
  type: "cad" | "cam" | "mixed";
  description: string;
  files: Array<{
    id: string;
    name: string;
    type: string;
    path: string;
    lastModified: Date;
    relevantEntries: string[]; // Conversation entry IDs
  }>;
  objectives: string[];
  constraints: string[];
  preferences: Record<string, any>;
  mcpConfiguration: {
    preferredServers: string[];
    enableThinking: boolean;
    customPrompts: Record<string, string>;
  };
  timeline: {
    created: Date;
    lastActivity: Date;
    milestones: Array<{
      id: string;
      name: string;
      date: Date;
      completed: boolean;
      relatedEntries: string[];
    }>;
  };
}

export interface UserPreferences {
  communicationStyle: "detailed" | "concise" | "technical" | "beginner-friendly";
  preferredUnits: "metric" | "imperial";
  thinkingPreference: "show-always" | "show-complex" | "show-never";
  contextRetention: "high" | "medium" | "low";
  expertiseLevel: "beginner" | "intermediate" | "advanced" | "expert";
  interests: string[];
  workflowPreferences: Record<string, any>;
  claudeMcpPreferences: {
    defaultServers: string[];
    enableThinking: boolean;
    preferredModel: string;
    maxTokens: number;
    temperature: number;
    enableCache: boolean;
  };
  notificationSettings: {
    insights: boolean;
    suggestions: boolean;
    reminders: boolean;
    mcpEvents: boolean;
  };
}

export interface SessionInsight {
  id: string;
  timestamp: Date;
  type: "pattern" | "suggestion" | "learning" | "warning" | "opportunity" | "mcp-performance";
  title: string;
  description: string;
  confidence: number;
  actionable: boolean;
  relatedEntries: string[];
  tags: string[];
  priority: "low" | "medium" | "high" | "critical";
  dismissed: boolean;
  mcpData?: {
    relatedServers: string[];
    toolsRecommended: string[];
    performanceMetrics: Record<string, number>;
  };
  actions?: Array<{
    id: string;
    label: string;
    type: "suggestion" | "automation" | "reminder" | "mcp-config";
    payload: any;
  }>;
}

export interface ContextualSuggestion {
  id: string;
  type: "next-step" | "tool-recommendation" | "best-practice" | "optimization" | "learning" | "mcp-enhancement";
  content: string;
  reasoning: string;
  confidence: number;
  relevantEntries: string[];
  mcpTools?: string[];
  mcpServers?: string[];
  priority: number;
  expiresAt?: Date;
  actions?: Array<{
    id: string;
    label: string;
    type: "suggestion" | "automation" | "reminder" | "mcp-config";
    payload: any;
  }>;
}

interface AIAgentState {
  // Core memory
  conversationMemory: ConversationEntry[];
  projectContexts: ProjectContext[];
  activeProjectId: string | null;

  // User modeling
  userPreferences: UserPreferences;
  userProfile: {
    expertiseAreas: Record<string, number>; // area -> proficiency (0-1)
    commonPatterns: string[];
    preferredWorkflows: string[];
    mcpUsagePatterns: {
      favoriteServers: Record<string, number>;
      frequentTools: Record<string, number>;
      averageProcessingTime: number;
      successRate: number;
    };
    timeZone: string;
    language: string;
  };

  // Session state
  currentSessionId: string;
  sessionInsights: SessionInsight[];
  contextualSuggestions: ContextualSuggestion[];

  // Claude MCP Integration State
  mcpIntegrationEnabled: boolean;
  mcpPerformanceMetrics: {
    totalRequests: number;
    successfulRequests: number;
    averageResponseTime: number;
    toolUsageStats: Record<string, number>;
    serverReliability: Record<string, number>;
    lastUpdated: Date;
  };

  // Learning and adaptation
  continuousLearning: boolean;
  adaptationLevel: "conservative" | "moderate" | "aggressive";
  learningHistory: Array<{
    timestamp: Date;
    type: string;
    description: string;
    impact: number;
    mcpRelated: boolean;
  }>;

  // Performance metrics
  contextRelevanceScore: number;
  responseQualityTrend: number[];
  userSatisfactionIndicators: Record<string, number>;

  // Actions
  addConversationEntry: (entry: Omit<ConversationEntry, "id" | "timestamp">) => string;
  updateEntryContext: (entryId: string, context: Partial<ConversationEntry["context"]>) => void;
  findRelevantContext: (query: string, limit?: number) => ConversationEntry[];

  // Claude MCP Enhanced Actions
  processMessageWithMCP: (message: string, projectId?: string, mode?: string) => Promise<MCPIntegratedResponse>;
  updateMCPPerformanceMetrics: (response: MCPIntegratedResponse) => void;
  generateMCPInsights: () => Promise<SessionInsight[]>;
  optimizeMCPConfiguration: () => Promise<void>;

  // Project management
  createProject: (project: Omit<ProjectContext, "id" | "timeline" | "mcpConfiguration">) => string;
  updateProject: (projectId: string, updates: Partial<ProjectContext>) => void;
  setActiveProject: (projectId: string | null) => void;
  getActiveProject: () => ProjectContext | null;

  // Enhanced insights and suggestions with MCP
  generateInsights: () => Promise<SessionInsight[]>;
  generateSuggestions: (context: string) => Promise<ContextualSuggestion[]>;
  dismissInsight: (insightId: string) => void;
  executeSuggestionAction: (suggestionId: string, actionId: string) => Promise<void>;

  // Learning and adaptation
  recordLearning: (type: string, description: string, impact: number, mcpRelated?: boolean) => void;
  updateUserProfile: (updates: Partial<AIAgentState["userProfile"]>) => void;
  updatePreferences: (updates: Partial<UserPreferences>) => void;

  // Memory management
  compressOldMemories: () => void;
  searchMemory: (query: string, filters?: any) => ConversationEntry[];
  getMemoryStats: () => Record<string, any>;

  // Context analysis
  analyzeConversationFlow: () => any;
  identifyTopics: () => Record<string, number>;
  detectPatterns: () => string[];

  // Session management
  startNewSession: () => void;
  endSession: () => void;
  getSessionSummary: () => any;

  // Claude MCP specific utilities
  getMCPRecommendations: (context: string) => Promise<{
    servers: string[];
    tools: string[];
    reasoning: string;
  }>;
  testMCPIntegration: () => Promise<{ success: boolean; details: any }>;

  // Utility actions
  exportMemory: () => string;
  importMemory: (data: string) => void;
  clearOldData: (daysOld: number) => void;
}

// Helper functions
const generateId = () => "agent_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);

const calculateImportance = (entry: ConversationEntry): number => {
  let importance = 0.5; // Base importance

  // Boost importance for certain types
  if (entry.role === "user") importance += 0.2;
  if (entry.context.mcpToolsUsed?.length) importance += 0.15;
  if (entry.context.thinkingProcessId) importance += 0.1;
  if (entry.context.fileReferences?.length) importance += 0.15;
  if (entry.context.claudeMcpData?.processingTime && entry.context.claudeMcpData.processingTime < 2000)
    importance += 0.1;

  // Boost for longer, more detailed content
  const contentLength = entry.content.length;
  if (contentLength > 200) importance += 0.1;
  if (contentLength > 500) importance += 0.1;

  // Boost for recent entries
  const hoursAgo = (Date.now() - entry.timestamp.getTime()) / (1000 * 60 * 60);
  if (hoursAgo < 1) importance += 0.2;
  else if (hoursAgo < 24) importance += 0.1;

  return Math.min(importance, 1.0);
};

const extractTopics = (content: string): string[] => {
  // Enhanced topic extraction with CAD/CAM terms
  const cadTerms = ["cad", "cam", "cnc", "toolpath", "gcode", "machining", "design", "modeling", "manufacturing"];
  const topics = content.toLowerCase().match(/\b[a-zA-Z]{3,}\b/g) || [];

  return Array.from(new Set(topics))
    .filter(
      topic =>
        !["this", "that", "with", "from", "they", "would", "could", "should", "will", "want", "need"].includes(topic)
    )
    .sort((a, b) => {
      const aIsCad = cadTerms.includes(a);
      const bIsCad = cadTerms.includes(b);
      if (aIsCad && !bIsCad) return -1;
      if (!aIsCad && bIsCad) return 1;
      return 0;
    })
    .slice(0, 12);
};

const findSimilarEntries = (entry: ConversationEntry, allEntries: ConversationEntry[]): string[] => {
  const entryTopics = extractTopics(entry.content);

  return allEntries
    .filter(e => e.id !== entry.id)
    .map(e => ({
      id: e.id,
      similarity:
        calculateSimilarity(entryTopics, extractTopics(e.content)) +
        (e.context.mcpToolsUsed?.length && entry.context.mcpToolsUsed?.length ? 0.1 : 0)
    }))
    .filter(({ similarity }) => similarity > 0.3)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 5)
    .map(({ id }) => id);
};

const calculateSimilarity = (topics1: string[], topics2: string[]): number => {
  const set1 = new Set(topics1);
  const set2 = new Set(topics2);
  const intersection = new Set(Array.from(set1).filter(x => set2.has(x)));
  const union = new Set([...Array.from(set1), ...Array.from(set2)]);
  return union.size > 0 ? intersection.size / union.size : 0;
};

export const useAIAgentStore = create<AIAgentState>()(
  persist(
    (set, get) => ({
      // Initial state
      conversationMemory: [],
      projectContexts: [],
      activeProjectId: null,

      userPreferences: {
        communicationStyle: "detailed",
        preferredUnits: "metric",
        thinkingPreference: "show-complex",
        contextRetention: "high",
        expertiseLevel: "intermediate",
        interests: [],
        workflowPreferences: {},
        claudeMcpPreferences: {
          defaultServers: ["filesystem", "specialized-tools"],
          enableThinking: true,
          preferredModel: "claude-sonnet-4-20250514",
          maxTokens: 4000,
          temperature: 0.7,
          enableCache: true
        },
        notificationSettings: {
          insights: true,
          suggestions: true,
          reminders: true,
          mcpEvents: true
        }
      },

      userProfile: {
        expertiseAreas: {},
        commonPatterns: [],
        preferredWorkflows: [],
        mcpUsagePatterns: {
          favoriteServers: {},
          frequentTools: {},
          averageProcessingTime: 0,
          successRate: 0.95
        },
        timeZone: typeof window !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC",
        language: "en"
      },

      currentSessionId: generateId(),
      sessionInsights: [],
      contextualSuggestions: [],

      // Claude MCP Integration
      mcpIntegrationEnabled: true,
      mcpPerformanceMetrics: {
        totalRequests: 0,
        successfulRequests: 0,
        averageResponseTime: 0,
        toolUsageStats: {},
        serverReliability: {},
        lastUpdated: new Date()
      },

      continuousLearning: true,
      adaptationLevel: "moderate",
      learningHistory: [],

      contextRelevanceScore: 0.8,
      responseQualityTrend: [0.8],
      userSatisfactionIndicators: {},

      // Actions
      addConversationEntry: entryData => {
        const entry: ConversationEntry = {
          ...entryData,
          id: generateId(),
          timestamp: new Date(),
          context: {
            ...entryData.context,
            importance: calculateImportance({ ...entryData, id: "", timestamp: new Date() } as ConversationEntry),
            tags: entryData.context.tags || extractTopics(entryData.content)
          }
        };

        // Find related entries
        const relatedEntries = findSimilarEntries(entry, get().conversationMemory);
        entry.context.relatedEntries = relatedEntries;

        set(state => ({
          conversationMemory: [entry, ...state.conversationMemory].slice(0, 1000) // Keep last 1000
        }));

        // Update user profile
        const currentProfile = get().userProfile;
        get().updateUserProfile({
          commonPatterns: [...currentProfile.commonPatterns, ...entry.context.tags].slice(-50)
        });

        // Update MCP usage patterns if applicable
        if (entry.context.mcpToolsUsed?.length) {
          const mcpTools = entry.context.mcpToolsUsed;
          const updatedMcpPatterns = { ...currentProfile.mcpUsagePatterns };

          mcpTools.forEach(tool => {
            updatedMcpPatterns.frequentTools[tool.tool] = (updatedMcpPatterns.frequentTools[tool.tool] || 0) + 1;
            updatedMcpPatterns.favoriteServers[tool.server] =
              (updatedMcpPatterns.favoriteServers[tool.server] || 0) + 1;
          });

          get().updateUserProfile({
            mcpUsagePatterns: updatedMcpPatterns
          });
        }

        return entry.id;
      },

      updateEntryContext: (entryId, contextUpdates) => {
        set(state => ({
          conversationMemory: state.conversationMemory.map(entry =>
            entry.id === entryId ? { ...entry, context: { ...entry.context, ...contextUpdates } } : entry
          )
        }));
      },

      findRelevantContext: (query, limit = 5) => {
        const queryTopics = extractTopics(query);
        const { conversationMemory } = get();

        return conversationMemory
          .map(entry => ({
            entry,
            relevance:
              calculateSimilarity(queryTopics, entry.context.tags) * entry.context.importance +
              (entry.context.mcpToolsUsed?.length ? 0.1 : 0) // Boost entries with MCP usage
          }))
          .filter(({ relevance }) => relevance > 0.1)
          .sort((a, b) => b.relevance - a.relevance)
          .slice(0, limit)
          .map(({ entry }) => entry);
      },

      // Claude MCP Enhanced Actions
      processMessageWithMCP: async (message, projectId, mode = "general") => {
        const state = get();
        const activeProject = projectId
          ? state.projectContexts.find(p => p.id === projectId)
          : state.getActiveProject();

        // Prepare MCP request
        const mcpRequest: MCPIntegratedRequest = {
          message,
          context: {
            conversationId: state.currentSessionId,
            cadElements: [], // Would be populated with actual CAD elements
            currentProject: activeProject?.name || "AI Agent Session",
            userPreferences: state.userPreferences,
            previousMessages: state.conversationMemory.slice(0, 6).map(entry => ({
              role: entry.role as "user" | "assistant",
              content: entry.content,
              timestamp: entry.timestamp.getTime()
            }))
          },
          options: {
            enableThinking: state.userPreferences.claudeMcpPreferences.enableThinking,
            enableMCP: state.mcpIntegrationEnabled,
            mcpServers:
              activeProject?.mcpConfiguration?.preferredServers ||
              state.userPreferences.claudeMcpPreferences.defaultServers,
            model: state.userPreferences.claudeMcpPreferences.preferredModel,
            temperature: state.userPreferences.claudeMcpPreferences.temperature,
            maxTokens: state.userPreferences.claudeMcpPreferences.maxTokens,
            useCache: state.userPreferences.claudeMcpPreferences.enableCache,
            priority: "normal"
          }
        };

        try {
          const mcpService = getMCPIntegratedService();
          const response = await mcpService.processWithMCPAndThinking(mcpRequest);

          // Add entries to conversation memory
          const userEntryId = state.addConversationEntry({
            role: "user",
            content: message,
            mode,
            context: {
              projectId,
              tags: extractTopics(message),
              importance: 0.8
            }
          });

          const assistantEntryId = state.addConversationEntry({
            role: "assistant",
            content: response.response,
            mode,
            context: {
              projectId,
              mcpToolsUsed: response.mcpToolsCalled.map(tool => ({
                server: tool.server,
                tool: tool.tool,
                success: !!tool.result,
                processingTime: response.processingTime
              })),
              claudeMcpData: {
                processingTime: response.processingTime,
                serverStatuses: response.serverStatuses || {},
                thinkingSession: response.thinkingSession,
                proactiveSuggestions: response.proactiveSuggestions,
                cacheHit: response.cacheHit || false
              },
              tags: extractTopics(response.response),
              importance: 0.9,
              relatedEntries: [userEntryId]
            }
          });

          // Update performance metrics
          state.updateMCPPerformanceMetrics(response);

          return response;
        } catch (error) {
          console.error("Error processing message with Claude MCP:", error);

          // Add error entry
          state.addConversationEntry({
            role: "system",
            content: `Error processing message: ${error instanceof Error ? error.message : "Unknown error"}`,
            mode,
            context: {
              projectId,
              tags: ["error", "mcp"],
              importance: 0.6
            }
          });

          throw error;
        }
      },

      updateMCPPerformanceMetrics: response => {
        set(state => {
          const metrics = { ...state.mcpPerformanceMetrics };

          metrics.totalRequests += 1;
          if (response.mcpToolsCalled.length > 0) {
            metrics.successfulRequests += 1;
          }

          // Update average response time
          metrics.averageResponseTime =
            (metrics.averageResponseTime * (metrics.totalRequests - 1) + response.processingTime) /
            metrics.totalRequests;

          // Update tool usage stats
          response.mcpToolsCalled.forEach(tool => {
            const toolKey = `${tool.server}.${tool.tool}`;
            metrics.toolUsageStats[toolKey] = (metrics.toolUsageStats[toolKey] || 0) + 1;
          });

          // Update server reliability
          if (response.serverStatuses) {
            Object.entries(response.serverStatuses).forEach(([server, status]) => {
              const currentReliability = metrics.serverReliability[server] || 0.5;
              const newReliability =
                status === "connected"
                  ? Math.min(currentReliability + 0.1, 1.0)
                  : Math.max(currentReliability - 0.1, 0.0);
              metrics.serverReliability[server] = newReliability;
            });
          }

          metrics.lastUpdated = new Date();

          return { mcpPerformanceMetrics: metrics };
        });
      },

      generateMCPInsights: async () => {
        const { mcpPerformanceMetrics, conversationMemory } = get();
        const mcpInsights: SessionInsight[] = [];

        // Performance insights
        if (mcpPerformanceMetrics.averageResponseTime > 5000) {
          mcpInsights.push({
            id: generateId(),
            timestamp: new Date(),
            type: "mcp-performance",
            title: "Slow MCP Response Times",
            description: `Average response time is ${(mcpPerformanceMetrics.averageResponseTime / 1000).toFixed(2)}s. Consider optimizing server configuration.`,
            confidence: 0.8,
            actionable: true,
            relatedEntries: [],
            tags: ["performance", "mcp"],
            priority: "medium",
            dismissed: false,
            mcpData: {
              relatedServers: Object.keys(mcpPerformanceMetrics.serverReliability),
              toolsRecommended: [],
              performanceMetrics: { avgResponseTime: mcpPerformanceMetrics.averageResponseTime }
            },
            actions: [
              {
                id: "optimize-servers",
                label: "Optimize Server Configuration",
                type: "mcp-config",
                payload: { action: "optimize" }
              }
            ]
          });
        }

        // Server reliability insights
        const lowReliabilityServers = Object.entries(mcpPerformanceMetrics.serverReliability)
          .filter(([_, reliability]) => reliability < 0.7)
          .map(([server, _]) => server);

        if (lowReliabilityServers.length > 0) {
          mcpInsights.push({
            id: generateId(),
            timestamp: new Date(),
            type: "warning",
            title: "Unreliable MCP Servers",
            description: `Servers ${lowReliabilityServers.join(", ")} have low reliability. Consider troubleshooting or using alternatives.`,
            confidence: 0.9,
            actionable: true,
            relatedEntries: [],
            tags: ["reliability", "mcp"],
            priority: "high",
            dismissed: false,
            mcpData: {
              relatedServers: lowReliabilityServers,
              toolsRecommended: [],
              performanceMetrics: {}
            }
          });
        }

        return mcpInsights;
      },

      optimizeMCPConfiguration: async () => {
        const state = get();
        const connectedServers = getConnectedServers();
        const performanceMetrics = state.mcpPerformanceMetrics;

        // Optimize server selection based on reliability
        const reliableServers = Object.entries(performanceMetrics.serverReliability)
          .filter(([server, reliability]) => reliability > 0.8 && connectedServers.includes(server))
          .map(([server, _]) => server);

        if (reliableServers.length > 0) {
          const updatedPreferences = {
            ...state.userPreferences,
            claudeMcpPreferences: {
              ...state.userPreferences.claudeMcpPreferences,
              defaultServers: reliableServers
            }
          };

          state.updatePreferences(updatedPreferences);

          // Record optimization
          state.recordLearning(
            "mcp-optimization",
            `Optimized MCP server configuration based on reliability metrics`,
            0.3,
            true
          );
        }
      },

      // Enhanced project management with MCP
      createProject: projectData => {
        const project: ProjectContext = {
          ...projectData,
          id: generateId(),
          mcpConfiguration: {
            preferredServers: get().userPreferences.claudeMcpPreferences.defaultServers,
            enableThinking: true,
            customPrompts: {}
          },
          timeline: {
            created: new Date(),
            lastActivity: new Date(),
            milestones: []
          }
        };

        set(state => ({
          projectContexts: [...state.projectContexts, project],
          activeProjectId: project.id
        }));

        return project.id;
      },

      updateProject: (projectId, updates) => {
        set(state => ({
          projectContexts: state.projectContexts.map(project =>
            project.id === projectId
              ? {
                  ...project,
                  ...updates,
                  timeline: {
                    ...project.timeline,
                    lastActivity: new Date()
                  }
                }
              : project
          )
        }));
      },

      setActiveProject: projectId => {
        set({ activeProjectId: projectId });
      },

      getActiveProject: () => {
        const { projectContexts, activeProjectId } = get();
        return projectContexts.find(p => p.id === activeProjectId) || null;
      },

      // Enhanced insights with MCP data
      generateInsights: async () => {
        const baseInsights = await get().generateMCPInsights();

        // Add traditional insights logic here (from original implementation)
        const { conversationMemory, userProfile, sessionInsights } = get();
        const recentEntries = conversationMemory.slice(0, 20);

        const insights: SessionInsight[] = [...baseInsights];

        // Pattern detection with MCP enhancement
        const topics = recentEntries.flatMap(e => e.context.tags);
        const topicCounts = topics.reduce(
          (acc, topic) => {
            acc[topic] = (acc[topic] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>
        );

        const dominantTopics = Object.entries(topicCounts)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 3);

        if (dominantTopics.length > 0) {
          insights.push({
            id: generateId(),
            timestamp: new Date(),
            type: "pattern",
            title: `Frequent Topic: ${dominantTopics[0][0]}`,
            description: `You've been discussing ${dominantTopics[0][0]} frequently. Consider creating a dedicated project or using specialized MCP tools.`,
            confidence: 0.8,
            actionable: true,
            relatedEntries: recentEntries.filter(e => e.context.tags.includes(dominantTopics[0][0])).map(e => e.id),
            tags: [dominantTopics[0][0], "pattern"],
            priority: "medium",
            dismissed: false,
            mcpData: {
              relatedServers: getConnectedServers().filter(
                server => server.includes(dominantTopics[0][0]) || server.includes("cad") || server.includes("cam")
              ),
              toolsRecommended: [],
              performanceMetrics: {}
            },
            actions: [
              {
                id: "create-project",
                label: "Create Project",
                type: "suggestion",
                payload: { topic: dominantTopics[0][0] }
              },
              {
                id: "configure-mcp",
                label: "Configure MCP Tools",
                type: "mcp-config",
                payload: { topic: dominantTopics[0][0] }
              }
            ]
          });
        }

        set({ sessionInsights: [...sessionInsights, ...insights] });
        return insights;
      },

      generateSuggestions: async context => {
        const { conversationMemory, activeProjectId, mcpPerformanceMetrics } = get();
        const relevantEntries = get().findRelevantContext(context, 3);

        const suggestions: ContextualSuggestion[] = [];

        // MCP-enhanced suggestions
        const connectedServers = getConnectedServers();
        if (connectedServers.length > 0 && relevantEntries.some(e => !e.context.mcpToolsUsed?.length)) {
          suggestions.push({
            id: generateId(),
            type: "mcp-enhancement",
            content: "Consider using Claude MCP tools to enhance this workflow",
            reasoning: "Connected MCP servers can provide specialized capabilities for CAD/CAM tasks",
            confidence: 0.8,
            relevantEntries: relevantEntries.map(e => e.id),
            mcpServers: connectedServers,
            priority: 0.8
          });
        }

        // Performance-based suggestions
        if (mcpPerformanceMetrics.averageResponseTime > 3000) {
          suggestions.push({
            id: generateId(),
            type: "optimization",
            content: "Optimize MCP server configuration for better performance",
            reasoning: "Current average response time is above optimal threshold",
            confidence: 0.7,
            relevantEntries: [],
            priority: 0.6,
            actions: [
              {
                id: "optimize-mcp",
                label: "Optimize MCP Configuration",
                type: "mcp-config",
                payload: { action: "optimize" }
              }
            ]
          });
        }

        // Traditional suggestions (from original implementation)
        if (relevantEntries.some(e => e.context.mcpToolsUsed?.length)) {
          suggestions.push({
            id: generateId(),
            type: "tool-recommendation",
            content: "Build on previous MCP tool usage for enhanced results",
            reasoning: "Previous similar conversations benefited from MCP tool usage",
            confidence: 0.7,
            relevantEntries: relevantEntries.map(e => e.id),
            priority: 0.8
          });
        }

        if (activeProjectId) {
          suggestions.push({
            id: generateId(),
            type: "next-step",
            content: "Document this Claude MCP interaction in your active project",
            reasoning: "Maintaining project documentation with MCP insights improves continuity",
            confidence: 0.8,
            relevantEntries: [],
            priority: 0.6
          });
        }

        set({ contextualSuggestions: suggestions });
        return suggestions;
      },

      dismissInsight: insightId => {
        set(state => ({
          sessionInsights: state.sessionInsights.map(insight =>
            insight.id === insightId ? { ...insight, dismissed: true } : insight
          )
        }));
      },

      executeSuggestionAction: async (suggestionId, actionId) => {
        const suggestion = get().contextualSuggestions.find(s => s.id === suggestionId);
        const action = suggestion?.actions?.find(a => a.id === actionId);

        if (action) {
          if (action.type === "suggestion" && action.payload.topic) {
            // Create project for the topic
            get().createProject({
              name: `${action.payload.topic} Project`,
              type: "mixed",
              description: `Auto-generated project for ${action.payload.topic}`,
              files: [],
              objectives: [],
              constraints: [],
              preferences: {}
            });
          } else if (action.type === "mcp-config") {
            if (action.payload.action === "optimize") {
              await get().optimizeMCPConfiguration();
            }
          }
        }
      },

      // Enhanced learning with MCP tracking
      recordLearning: (type, description, impact, mcpRelated = false) => {
        set(state => ({
          learningHistory: [
            {
              timestamp: new Date(),
              type,
              description,
              impact,
              mcpRelated
            },
            ...state.learningHistory
          ].slice(0, 100)
        }));
      },

      updateUserProfile: updates => {
        set(state => ({
          userProfile: { ...state.userProfile, ...updates }
        }));
      },

      updatePreferences: updates => {
        set(state => ({
          userPreferences: { ...state.userPreferences, ...updates }
        }));
      },

      // Memory management (enhanced from original)
      compressOldMemories: () => {
        const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days

        set(state => ({
          conversationMemory: state.conversationMemory.filter(
            entry =>
              entry.timestamp > cutoffDate || entry.context.importance > 0.8 || entry.context.mcpToolsUsed?.length // Keep MCP-enhanced entries
          )
        }));
      },

      searchMemory: (query, filters = {}) => {
        return get().findRelevantContext(query, filters.limit || 10);
      },

      getMemoryStats: () => {
        const { conversationMemory, sessionInsights, projectContexts, mcpPerformanceMetrics } = get();

        const mcpEntries = conversationMemory.filter(e => e.context.mcpToolsUsed?.length);

        return {
          totalEntries: conversationMemory.length,
          mcpEnhancedEntries: mcpEntries.length,
          averageImportance:
            conversationMemory.reduce((sum, e) => sum + e.context.importance, 0) / conversationMemory.length,
          topicDistribution: conversationMemory
            .flatMap(e => e.context.tags)
            .reduce(
              (acc, tag) => ({ ...acc, [tag]: ((acc as Record<string, number>)[tag] || 0) + 1 }),
              {} as Record<string, number>
            ),
          insightsGenerated: sessionInsights.length,
          activeProjects: projectContexts.length,
          mcpPerformance: {
            totalRequests: mcpPerformanceMetrics.totalRequests,
            successRate:
              mcpPerformanceMetrics.totalRequests > 0
                ? mcpPerformanceMetrics.successfulRequests / mcpPerformanceMetrics.totalRequests
                : 0,
            averageResponseTime: mcpPerformanceMetrics.averageResponseTime
          },
          oldestEntry: conversationMemory[conversationMemory.length - 1]?.timestamp,
          newestEntry: conversationMemory[0]?.timestamp
        };
      },

      // Context analysis (enhanced from original)
      analyzeConversationFlow: () => {
        const { conversationMemory } = get();
        const recentEntries = conversationMemory.slice(0, 20);

        return {
          turnCount: recentEntries.length,
          averageLength: recentEntries.reduce((sum, e) => sum + e.content.length, 0) / recentEntries.length,
          topicShifts: [], // Would implement topic shift detection
          userEngagement: recentEntries.filter(e => e.role === "user").length / recentEntries.length,
          toolUsage: recentEntries.filter(e => e.context.mcpToolsUsed?.length).length,
          mcpUsageRatio: recentEntries.filter(e => e.context.mcpToolsUsed?.length).length / recentEntries.length,
          averageMcpResponseTime:
            recentEntries
              .filter(e => e.context.claudeMcpData?.processingTime)
              .reduce((sum, e) => sum + (e.context.claudeMcpData?.processingTime || 0), 0) /
              recentEntries.filter(e => e.context.claudeMcpData?.processingTime).length || 0
        };
      },

      identifyTopics: () => {
        const { conversationMemory } = get();
        const allTopics = conversationMemory.flatMap(e => e.context.tags);

        return allTopics.reduce(
          (acc, topic) => {
            acc[topic] = (acc[topic] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>
        );
      },

      detectPatterns: () => {
        const { conversationMemory } = get();
        return conversationMemory
          .flatMap(e => e.context.tags)
          .filter((tag, index, arr) => arr.indexOf(tag) !== index)
          .slice(0, 10);
      },

      // Session management (enhanced from original)
      startNewSession: () => {
        set({
          currentSessionId: generateId(),
          sessionInsights: [],
          contextualSuggestions: []
        });
      },

      endSession: () => {
        get().compressOldMemories();
        // Could implement session summary generation with MCP data
      },

      getSessionSummary: () => {
        const { conversationMemory, sessionInsights, currentSessionId, mcpPerformanceMetrics } = get();
        const sessionEntries = conversationMemory.filter(
          e => e.timestamp.getTime() > Date.now() - 24 * 60 * 60 * 1000 // Last 24 hours
        );

        const mcpEntries = sessionEntries.filter(e => e.context.mcpToolsUsed?.length);

        return {
          sessionId: currentSessionId,
          entryCount: sessionEntries.length,
          mcpEnhancedEntries: mcpEntries.length,
          insights: sessionInsights.length,
          topTopics: get().identifyTopics(),
          mcpPerformance: {
            requestsInSession: mcpPerformanceMetrics.totalRequests,
            averageResponseTime: mcpPerformanceMetrics.averageResponseTime,
            toolsUsed: Object.keys(mcpPerformanceMetrics.toolUsageStats).length
          },
          duration:
            sessionEntries.length > 0
              ? sessionEntries[0].timestamp.getTime() - sessionEntries[sessionEntries.length - 1].timestamp.getTime()
              : 0
        };
      },

      // Claude MCP specific utilities
      getMCPRecommendations: async context => {
        const connectedServers = getConnectedServers();
        const contextTopics = extractTopics(context);

        // Recommend servers based on context
        const recommendedServers = connectedServers.filter(server => {
          if (contextTopics.some(topic => ["cad", "design", "modeling"].includes(topic))) {
            return server.includes("cad") || server.includes("design");
          }
          if (contextTopics.some(topic => ["cam", "machining", "toolpath"].includes(topic))) {
            return server.includes("cam") || server.includes("toolpath");
          }
          if (contextTopics.some(topic => ["file", "save", "load", "export"].includes(topic))) {
            return server.includes("filesystem");
          }
          return true;
        });

        // Recommend tools based on context and server capabilities
        const recommendedTools: string[] = [];
        if (contextTopics.some(topic => ["analyze", "check", "validate"].includes(topic))) {
          recommendedTools.push("analyze-geometry", "validate-design");
        }
        if (contextTopics.some(topic => ["optimize", "improve"].includes(topic))) {
          recommendedTools.push("optimize-topology", "suggest-improvements");
        }
        if (contextTopics.some(topic => ["generate", "create", "build"].includes(topic))) {
          recommendedTools.push("generate-component", "create-assembly");
        }

        return {
          servers: recommendedServers,
          tools: recommendedTools,
          reasoning: `Based on context topics: ${contextTopics.join(", ")}`
        };
      },

      testMCPIntegration: async () => {
        try {
          const mcpService = getMCPIntegratedService();
          const result = await mcpService.testClaudeMCPIntegration();

          // Record the test
          get().recordLearning(
            "mcp-integration-test",
            `Integration test ${result.success ? "successful" : "failed"}: ${result.message}`,
            result.success ? 0.1 : -0.1,
            true
          );

          return result;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          get().recordLearning(
            "mcp-integration-test",
            `Integration test failed with error: ${errorMessage}`,
            -0.2,
            true
          );

          return {
            success: false,
            details: { error: errorMessage }
          };
        }
      },

      // Utility actions (enhanced from original)
      exportMemory: () => {
        const state = get();
        return JSON.stringify(
          {
            conversationMemory: state.conversationMemory,
            projectContexts: state.projectContexts,
            userPreferences: state.userPreferences,
            userProfile: state.userProfile,
            mcpPerformanceMetrics: state.mcpPerformanceMetrics,
            learningHistory: state.learningHistory.filter(l => l.mcpRelated),
            exportedAt: new Date()
          },
          null,
          2
        );
      },

      importMemory: data => {
        try {
          const parsed = JSON.parse(data);
          set({
            conversationMemory: parsed.conversationMemory || [],
            projectContexts: parsed.projectContexts || [],
            userPreferences: parsed.userPreferences || get().userPreferences,
            userProfile: parsed.userProfile || get().userProfile,
            mcpPerformanceMetrics: parsed.mcpPerformanceMetrics || get().mcpPerformanceMetrics,
            learningHistory: parsed.learningHistory || []
          });
        } catch (error) {
          console.error("Failed to import memory:", error);
        }
      },

      clearOldData: daysOld => {
        const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);

        set(state => ({
          conversationMemory: state.conversationMemory.filter(
            e => e.timestamp > cutoffDate || e.context.mcpToolsUsed?.length // Keep MCP entries
          ),
          sessionInsights: state.sessionInsights.filter(i => i.timestamp > cutoffDate),
          learningHistory: state.learningHistory.filter(l => l.timestamp > cutoffDate)
        }));
      }
    }),
    {
      name: "ai-agent-store-mcp",
      partialize: state => ({
        conversationMemory: state.conversationMemory.slice(0, 500), // Persist last 500
        projectContexts: state.projectContexts,
        userPreferences: state.userPreferences,
        userProfile: state.userProfile,
        sessionInsights: state.sessionInsights.slice(0, 50),
        learningHistory: state.learningHistory.slice(0, 100),
        mcpPerformanceMetrics: state.mcpPerformanceMetrics,
        mcpIntegrationEnabled: state.mcpIntegrationEnabled
      })
    }
  )
);

// Enhanced convenience hooks with MCP
export const useConversationMemory = () => {
  const store = useAIAgentStore();
  return {
    memory: store.conversationMemory,
    addEntry: store.addConversationEntry,
    updateEntry: store.updateEntryContext,
    findRelevant: store.findRelevantContext,
    searchMemory: store.searchMemory,
    processMessage: store.processMessageWithMCP,
    stats: store.getMemoryStats()
  };
};

export const useProjectContext = () => {
  const store = useAIAgentStore();
  return {
    projects: store.projectContexts,
    activeProject: store.getActiveProject(),
    createProject: store.createProject,
    updateProject: store.updateProject,
    setActive: store.setActiveProject
  };
};

export const useAIInsights = () => {
  const store = useAIAgentStore();
  return {
    insights: store.sessionInsights,
    suggestions: store.contextualSuggestions,
    generateInsights: store.generateInsights,
    generateSuggestions: store.generateSuggestions,
    dismissInsight: store.dismissInsight,
    executeAction: store.executeSuggestionAction,
    mcpInsights: store.generateMCPInsights
  };
};

export const useUserAdaptation = () => {
  const store = useAIAgentStore();
  return {
    preferences: store.userPreferences,
    profile: store.userProfile,
    learningHistory: store.learningHistory,
    updatePreferences: store.updatePreferences,
    updateProfile: store.updateUserProfile,
    recordLearning: store.recordLearning
  };
};

export const useMCPIntegration = () => {
  const store = useAIAgentStore();
  return {
    enabled: store.mcpIntegrationEnabled,
    performanceMetrics: store.mcpPerformanceMetrics,
    processMessage: store.processMessageWithMCP,
    getRecommendations: store.getMCPRecommendations,
    testIntegration: store.testMCPIntegration,
    optimizeConfiguration: store.optimizeMCPConfiguration,
    connectedServers: getConnectedServers()
  };
};
