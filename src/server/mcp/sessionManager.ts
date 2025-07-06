/**
 * Session Manager for MCP Server
 *
 * Manages sessions for maintaining context across interactions.
 */
import { Session, EnrichedContext, SessionHistoryItem } from "./types";
import { logger } from "./logger";

/**
 * Implementation of a session
 */
class SessionImpl implements Session {
  private id: string;
  private context: EnrichedContext | null = null;
  private history: SessionHistoryItem[] = [];
  private lastActivity: number;
  private maxHistoryItems = 50;

  constructor(id: string) {
    this.id = id;
    this.lastActivity = Date.now();
  }

  getId(): string {
    return this.id;
  }

  getContext(): EnrichedContext | null {
    return this.context;
  }

  updateContext(context: EnrichedContext): void {
    this.context = context;
    this.lastActivity = Date.now();

    // Add to history
    this.history.push({
      type: "context_update",
      timestamp: Date.now(),
      data: {
        summary: context.summary,
        selectedElementCount: context.selectedElements.length
      }
    });

    // Trim history if needed
    if (this.history.length > this.maxHistoryItems) {
      this.history = this.history.slice(-this.maxHistoryItems);
    }
  }

  getHistory(): SessionHistoryItem[] {
    return this.history;
  }

  recordAction(action: string, parameters: any, result: any): void {
    this.lastActivity = Date.now();

    // Add to history
    this.history.push({
      type: "action_execution",
      timestamp: Date.now(),
      data: {
        action,
        parameters,
        resultSummary: result.message || "Action executed"
      }
    });

    // Trim history if needed
    if (this.history.length > this.maxHistoryItems) {
      this.history = this.history.slice(-this.maxHistoryItems);
    }
  }

  getLastActivity(): number {
    return this.lastActivity;
  }
}

/**
 * Session Manager for handling multiple sessions
 */
export class SessionManager {
  private sessions: Map<string, SessionImpl> = new Map();
  private sessionTTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  constructor() {
    // Set up periodic cleanup of expired sessions
    setInterval(() => this.cleanupExpiredSessions(), 60 * 60 * 1000); // Every hour
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): Session | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Create a new session
   */
  createSession(): Session {
    const sessionId = this.generateSessionId();
    const session = new SessionImpl(sessionId);
    this.sessions.set(sessionId, session);

    logger.info(`Created new session: ${sessionId}`);
    return session;
  }

  /**
   * Get an existing session or create a new one if it doesn't exist
   */
  getOrCreateSession(sessionId: string): Session {
    const existingSession = this.sessions.get(sessionId);

    if (existingSession) {
      logger.debug(`Retrieved existing session: ${sessionId}`);
      return existingSession;
    }

    const session = new SessionImpl(sessionId);
    this.sessions.set(sessionId, session);

    logger.info(`Created new session with ID: ${sessionId}`);
    return session;
  }

  /**
   * Delete a session
   */
  deleteSession(sessionId: string): boolean {
    logger.info(`Deleting session: ${sessionId}`);
    return this.sessions.delete(sessionId);
  }

  /**
   * Clean up expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = Date.now();
    let expiredCount = 0;

    for (const [sessionId, session] of Array.from(this.sessions.entries())) {
      if (now - session.getLastActivity() > this.sessionTTL) {
        this.sessions.delete(sessionId);
        expiredCount++;
      }
    }

    if (expiredCount > 0) {
      logger.info(`Cleaned up ${expiredCount} expired sessions`);
    }
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    // Generate a random ID
    const id = "session_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9);

    // Ensure uniqueness
    if (this.sessions.has(id)) {
      return this.generateSessionId();
    }

    return id;
  }
}
