import { AIMessage, AIHistoryItem } from "@/src/types/AITypes";

interface ConversationContext {
  sessionId: string;
  messages: AIMessage[];
  lastInteraction: number;
  contextSummary?: string;
  userPreferences?: Record<string, any>;
  projectContext?: {
    currentProject?: string;
    recentElements?: any[];
    workingDirectory?: string;
  };
}

interface ContextPersistenceOptions {
  maxMessages?: number;
  contextWindowMinutes?: number;
  enableSummaryGeneration?: boolean;
}

export class AIContextPersistenceService {
  private readonly STORAGE_KEY = "ai-conversation-context";
  private readonly SESSION_KEY = "ai-session-id";
  private readonly DEFAULT_OPTIONS: ContextPersistenceOptions = {
    maxMessages: 50,
    contextWindowMinutes: 30,
    enableSummaryGeneration: true
  };

  private options: ContextPersistenceOptions;

  constructor(options?: ContextPersistenceOptions) {
    this.options = { ...this.DEFAULT_OPTIONS, ...options };
  }

  /**
   * Save the current conversation context
   */
  saveContext(messages: AIMessage[], additionalContext?: Partial<ConversationContext>): void {
    const sessionId = this.getOrCreateSessionId();

    const context: ConversationContext = {
      sessionId,
      messages: messages.slice(-this.options.maxMessages!),
      lastInteraction: Date.now(),
      ...additionalContext
    };

    if (this.options.enableSummaryGeneration && messages.length > 10) {
      context.contextSummary = this.generateContextSummary(messages);
    }

    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(context));
    } catch (error) {
      console.error("Failed to save conversation context:", error);
    }
  }

  /**
   * Load previous conversation context if still valid
   */
  loadContext(): ConversationContext | null {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (!saved) return null;

      const context = JSON.parse(saved) as ConversationContext;
      const timeSinceLastInteraction = Date.now() - context.lastInteraction;

      // Check if context is still within the valid time window
      if (timeSinceLastInteraction > this.options.contextWindowMinutes! * 60 * 1000) {
        this.clearContext();
        return null;
      }

      return context;
    } catch (error) {
      console.error("Failed to load conversation context:", error);
      return null;
    }
  }

  /**
   * Generate a summary of the conversation for context retention
   */
  private generateContextSummary(messages: AIMessage[]): string {
    const recentMessages = messages.slice(-10);
    const topics = new Set<string>();
    const actions = new Set<string>();

    recentMessages.forEach(msg => {
      if (msg.role === "user") {
        const content =
          typeof msg.content === "string" ? msg.content : msg.content.find(block => block.type === "text")?.text || "";

        // Extract key topics and actions
        if (content.toLowerCase().includes("cad")) topics.add("CAD operations");
        if (content.toLowerCase().includes("element")) topics.add("Element manipulation");
        if (content.toLowerCase().includes("export")) actions.add("Export requested");
        if (content.toLowerCase().includes("analyze")) actions.add("Analysis performed");
        if (content.toLowerCase().includes("optimize")) actions.add("Optimization requested");
      }
    });

    const topicsList = Array.from(topics).join(", ");
    const actionsList = Array.from(actions).join(", ");

    return `Recent topics: ${topicsList || "General CAD assistance"}. Actions: ${actionsList || "None"}.`;
  }

  /**
   * Get or create a session ID for tracking conversations
   */
  private getOrCreateSessionId(): string {
    let sessionId = sessionStorage.getItem(this.SESSION_KEY);
    if (!sessionId) {
      sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      sessionStorage.setItem(this.SESSION_KEY, sessionId);
    }
    return sessionId;
  }

  /**
   * Clear stored context
   */
  clearContext(): void {
    localStorage.removeItem(this.STORAGE_KEY);
    sessionStorage.removeItem(this.SESSION_KEY);
  }

  /**
   * Get context age in minutes
   */
  getContextAge(): number | null {
    const context = this.loadContext();
    if (!context) return null;

    return Math.floor((Date.now() - context.lastInteraction) / 60000);
  }

  /**
   * Update project-specific context
   */
  updateProjectContext(projectContext: ConversationContext["projectContext"]): void {
    const context = this.loadContext();
    if (context) {
      context.projectContext = { ...context.projectContext, ...projectContext };
      this.saveContext(context.messages, { projectContext: context.projectContext });
    }
  }

  /**
   * Extract action items from conversation
   */
  extractActionItems(messages: AIMessage[]): string[] {
    const actionItems: string[] = [];

    messages.forEach(msg => {
      if (msg.artifacts) {
        msg.artifacts.forEach(artifact => {
          if (artifact.type === "tool_calls" && Array.isArray(artifact.content)) {
            artifact.content.forEach((action: any) => {
              actionItems.push(`${action.type}: ${JSON.stringify(action.payload)}`);
            });
          }
        });
      }
    });

    return actionItems;
  }
}

export const aiContextPersistence = new AIContextPersistenceService();
