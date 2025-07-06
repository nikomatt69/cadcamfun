import {
  ThinkingStep,
  ThinkingSession,
  ExtendedThinkingOptions,
  AgentMemory,
  ContinuousAgentState
} from "../../../types/AITypes";
import { v4 as uuidv4 } from "uuid";

export class ExtendedThinkingService {
  private static instance: ExtendedThinkingService;
  private thinkingSessions: Map<string, ThinkingSession> = new Map();
  private agentMemory: Map<string, AgentMemory> = new Map();
  private continuousState: ContinuousAgentState = {
    isActive: false,
    currentContext: "",
    memoryId: "",
    thinkingSessions: [],
    proactiveMode: false,
    suggestionThreshold: 0.7
  };

  private defaultOptions: ExtendedThinkingOptions = {
    enabled: true,
    budgetTokens: 2000,
    showRealTime: true,
    persistToMemory: true,
    minimumThinkingTime: 2,
    verbosityLevel: "normal",
    phases: ["analysis", "reasoning", "conclusion", "question", "hypothesis"]
  };

  private static readonly MAX_SESSIONS = 100;
  private static readonly MAX_STORAGE_SIZE = 5 * 1024 * 1024; // 5MB
  private memoryLoaded = false;

  private constructor() {
    // Don't load persisted memory during construction to avoid SSR issues
    // It will be loaded when first needed on client side
  }

  /**
   * Ensures memory is loaded from localStorage (client-side only)
   */
  private ensureMemoryLoaded(): void {
    if (!this.memoryLoaded && typeof window !== "undefined" && window.localStorage) {
      this.loadPersistedMemory();
      this.memoryLoaded = true;
    }
  }

  static getInstance(): ExtendedThinkingService {
    if (!ExtendedThinkingService.instance) {
      ExtendedThinkingService.instance = new ExtendedThinkingService();
    }
    return ExtendedThinkingService.instance;
  }

  /**
   * Inizia una nuova sessione di thinking
   */
  startThinkingSession(
    conversationId: string,
    contextText: string,
    options: Partial<ExtendedThinkingOptions> = {}
  ): string {
    const sessionId = uuidv4();
    const mergedOptions = { ...this.defaultOptions, ...options };

    const session: ThinkingSession = {
      id: sessionId,
      userQuery: contextText,
      context: contextText,
      steps: [],
      summary: "",
      confidence: 0,
      totalDuration: 0,
      timestamp: new Date(),
      mcpToolsUsed: [],
      outcome: "completed",
      tags: []
    };

    this.thinkingSessions.set(sessionId, session);

    // Update continuous state
    this.continuousState.thinkingSessions.push(session);

    return sessionId;
  }

  /**
   * Aggiunge un step di thinking
   */
  addThinkingStep(
    sessionId: string,
    type: ThinkingStep["type"],
    content: string,
    confidence: number = 0.8,
    reasoning?: string,
    relatedConceptsParam?: string[]
  ): void {
    const session = this.thinkingSessions.get(sessionId);
    if (!session) return;

    const step: ThinkingStep = {
      id: uuidv4(),
      type,
      content,
      confidence,
      timestamp: new Date(),
      reasoning: reasoning || "",
      relatedConcepts: relatedConceptsParam || [],
      duration: 0
    };

    session.steps.push(step);

    // Aggiorna la durata
    const duration = Date.now() - session.timestamp.getTime();
    session.totalDuration = duration;

    this.thinkingSessions.set(sessionId, session);
  }

  /**
   * Finalizza una sessione di thinking
   */
  finalizeThinkingSession(sessionId: string, summary?: string): ThinkingSession | null {
    const session = this.thinkingSessions.get(sessionId);
    if (!session) return null;

    session.summary = summary || this.generateSummary(session.steps);
    session.outcome = "completed";

    // Persisti in memoria se configurato
    if (this.defaultOptions.persistToMemory) {
      this.persistThinkingToMemory(session, session.id);
    }

    return session;
  }

  /**
   * Genera un summary automatico dai thinking steps
   */
  private generateSummary(steps: ThinkingStep[]): string {
    const typeGroups = steps.reduce(
      (acc, step) => {
        if (!acc[step.type]) acc[step.type] = [];
        acc[step.type].push(step);
        return acc;
      },
      {} as Record<string, ThinkingStep[]>
    );

    const summaryParts: string[] = [];

    Object.entries(typeGroups).forEach(([type, typeSteps]) => {
      const avgConfidence = typeSteps.reduce((sum, step) => sum + step.confidence, 0) / typeSteps.length;
      const keyInsights = typeSteps
        .filter(step => step.confidence > 0.7)
        .map(step => step.content.substring(0, 100))
        .slice(0, 2);

      if (keyInsights.length > 0) {
        summaryParts.push(`${type}: ${keyInsights.join(", ")} (confidence: ${Math.round(avgConfidence * 100)}%)`);
      }
    });

    return summaryParts.join(" | ");
  }

  /**
   * Persiste il thinking in memoria per continuità
   */
  private persistThinkingToMemory(session: ThinkingSession, conversationId: string): void {
    this.ensureMemoryLoaded();
    const memoryId = conversationId;
    let memory = this.agentMemory.get(memoryId);

    if (!memory) {
      memory = {
        conversationId: memoryId,
        contextWindow: [],
        learningPoints: [],
        preferences: {},
        specializations: [],
        lastInteraction: new Date(),
        sessionCount: 0
      };
    }

    // Aggiorna la memoria con insights dalla sessione di thinking
    memory.lastInteraction = new Date();
    memory.sessionCount++;

    // Estrai learning points dai thinking steps
    const learningPoints = session.steps
      .filter(step => step.confidence > 0.8)
      .map(step => `${step.type}: ${step.content.substring(0, 200)}`)
      .slice(-5);

    memory.learningPoints = [...memory.learningPoints, ...learningPoints].slice(-20);

    // Aggiorna il context window
    memory.contextWindow.push(session.summary);
    memory.contextWindow = memory.contextWindow.slice(-10);

    this.agentMemory.set(memoryId, memory);
    this.savePersistedMemory();
  }

  /**
   * Ottiene la memoria per una conversazione
   */
  getAgentMemory(conversationId: string): AgentMemory | null {
    this.ensureMemoryLoaded();
    return this.agentMemory.get(conversationId) || null;
  }

  /**
   * Genera suggerimenti proattivi basati sulla memoria
   */
  generateProactiveSuggestions(conversationId: string, currentContext: string): string[] {
    this.ensureMemoryLoaded();
    const memory = this.getAgentMemory(conversationId);
    if (!memory) return [];

    const suggestions: string[] = [];

    // Suggerimenti basati su pattern di uso
    if (memory.learningPoints.some(point => point.includes("analysis"))) {
      suggestions.push("Would you like me to analyze the current design for potential improvements?");
    }

    if (memory.learningPoints.some(point => point.includes("optimization"))) {
      suggestions.push("I can suggest optimizations based on our previous work together.");
    }

    // Suggerimenti basati su specializzazioni rilevate
    if (memory.specializations.includes("mechanical")) {
      suggestions.push("I noticed you work with mechanical components - need help with tolerances or fits?");
    }

    return suggestions.slice(0, 3);
  }

  /**
   * Aggiorna le impostazioni di thinking
   */
  updateThinkingOptions(options: Partial<ExtendedThinkingOptions>): void {
    this.defaultOptions = { ...this.defaultOptions, ...options };
  }

  /**
   * Ottiene lo stato corrente dell'agente continuo
   */
  getContinuousState(): ContinuousAgentState {
    return { ...this.continuousState };
  }

  /**
   * Attiva/disattiva modalità proattiva
   */
  setProactiveMode(enabled: boolean): void {
    this.continuousState.proactiveMode = enabled;
    this.continuousState.isActive = enabled;
  }

  /**
   * Salva la memoria su localStorage
   */
  private savePersistedMemory(): void {
    // Check if we're in browser environment
    if (typeof window === "undefined" || !window.localStorage) {
      return;
    }

    try {
      // Clean up old sessions
      const now = Date.now();
      const oldSessions = Array.from(this.thinkingSessions.entries())
        .filter(([_, session]) => {
          const age = now - session.timestamp.getTime();
          return age > 24 * 60 * 60 * 1000; // 24 hours
        })
        .map(([id]) => id);

      oldSessions.forEach(id => this.thinkingSessions.delete(id));

      // Prepare data for storage
      const data = {
        memories: Array.from(this.agentMemory.entries()),
        continuousState: this.continuousState
      };

      const serialized = JSON.stringify(data);

      // Check storage size
      if (serialized.length > ExtendedThinkingService.MAX_STORAGE_SIZE) {
        console.warn("Memory size exceeds limit, clearing oldest entries");
        this.cleanupOldestMemories();
        return;
      }

      localStorage.setItem("cad_assistant_extended_memory", serialized);
    } catch (error) {
      console.warn("Failed to save agent memory:", error);
    }
  }

  private cleanupOldestMemories(): void {
    const memories = Array.from(this.agentMemory.entries()).sort(
      ([_, a], [__, b]) => a.lastInteraction.getTime() - b.lastInteraction.getTime()
    );

    // Remove oldest half of memories
    memories.slice(0, Math.floor(memories.length / 2)).forEach(([id]) => this.agentMemory.delete(id));
  }

  /**
   * Carica la memoria da localStorage
   */
  private loadPersistedMemory(): void {
    // Check if we're in browser environment
    if (typeof window === "undefined" || !window.localStorage) {
      return;
    }

    try {
      const saved = localStorage.getItem("cad_assistant_extended_memory");
      if (saved) {
        const data = JSON.parse(saved);
        this.agentMemory = new Map(data.memories);
        this.continuousState = { ...this.continuousState, ...data.continuousState };
      }
    } catch (error) {
      console.warn("Failed to load persisted agent memory:", error);
    }
  }

  /**
   * Pulisce la memoria (utile per testing o reset)
   */
  clearMemory(): void {
    this.agentMemory.clear();
    this.thinkingSessions.clear();
    this.continuousState.thinkingSessions = [];

    // Check if we're in browser environment
    if (typeof window !== "undefined" && window.localStorage) {
      localStorage.removeItem("cad_assistant_extended_memory");
    }
  }

  /**
   * Ottiene statistiche sulla memoria
   */
  getMemoryStats(): {
    totalConversations: number;
    totalThinkingSessions: number;
    averageSessionDuration: number;
    topSpecializations: string[];
  } {
    this.ensureMemoryLoaded();
    const totalConversations = this.agentMemory.size;
    const totalThinkingSessions = this.thinkingSessions.size;
    const averageSessionDuration =
      Array.from(this.thinkingSessions.values()).reduce((sum, session) => sum + session.totalDuration, 0) /
        totalThinkingSessions || 0;

    const specializations = Array.from(this.agentMemory.values()).flatMap(memory => memory.specializations);
    const topSpecializations = Array.from(new Set(specializations)).slice(0, 5);

    return {
      totalConversations,
      totalThinkingSessions,
      averageSessionDuration,
      topSpecializations
    };
  }
}

// Lazy initialization to avoid SSR issues
let _extendedThinkingServiceInstance: ExtendedThinkingService | null = null;

export const getExtendedThinkingService = (): ExtendedThinkingService => {
  if (!_extendedThinkingServiceInstance) {
    _extendedThinkingServiceInstance = ExtendedThinkingService.getInstance();
  }
  return _extendedThinkingServiceInstance;
};

// Legacy export for backward compatibility (will be created lazily)
export const extendedThinkingService = new Proxy({} as ExtendedThinkingService, {
  get(target, prop) {
    const service = getExtendedThinkingService();
    return (service as any)[prop];
  }
});
