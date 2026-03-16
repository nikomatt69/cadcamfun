// src/lib/error/logger.ts
// Enterprise-level Logging System with multiple transports

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4,
}

export type LogTransport = 'console' | 'remote' | 'localStorage' | 'indexedDB';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  levelName: string;
  message: string;
  context?: Record<string, any>;
  stack?: string;
  userId?: string;
  sessionId?: string;
  url?: string;
  userAgent?: string;
}

export interface LoggerConfig {
  minLevel: LogLevel;
  enableConsole: boolean;
  enableRemote: boolean;
  enableLocalStorage: boolean;
  remoteEndpoint?: string;
  flushInterval: number;
  maxBufferSize: number;
  metadata?: Record<string, any>;
}

interface BufferedLog extends LogEntry {
  retries: number;
}

/**
 * Enterprise Logger
 * Supports multiple log levels, transports, buffering, and structured logging
 */
class EnterpriseLogger {
  private config: LoggerConfig;
  private buffer: BufferedLog[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private sessionId: string;
  private userId: string | null = null;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      minLevel: config.minLevel ?? (process.env.NODE_ENV === 'production' ? LogLevel.WARN : LogLevel.DEBUG),
      enableConsole: config.enableConsole ?? true,
      enableRemote: config.enableRemote ?? process.env.NODE_ENV === 'production',
      enableLocalStorage: config.enableLocalStorage ?? false,
      remoteEndpoint: config.remoteEndpoint ?? '/api/logs',
      flushInterval: config.flushInterval ?? 5000,
      maxBufferSize: config.maxBufferSize ?? 100,
      metadata: config.metadata ?? {},
    };

    this.sessionId = this.generateSessionId();
    this.startFlushTimer();

    // Register global error handlers
    this.registerGlobalHandlers();
  }

  private generateSessionId(): string {
    return `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateLogId(): string {
    return `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private startFlushTimer(): void {
    if (this.flushTimer) return;
    
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.config.flushInterval);
  }

  private stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  private registerGlobalHandlers(): void {
    if (typeof window === 'undefined') return;

    // Global unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.error('Unhandled Promise Rejection', {
        reason: event.reason?.message || event.reason,
        stack: event.reason?.stack,
      });
    });

    // Global uncaught errors
    window.addEventListener('error', (event) => {
      this.error('Uncaught Error', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    });
  }

  setUserId(userId: string | null): void {
    this.userId = userId;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.config.minLevel;
  }

  private createLogEntry(
    level: LogLevel,
    message: string,
    context?: Record<string, any>
  ): LogEntry {
    return {
      id: this.generateLogId(),
      timestamp: new Date().toISOString(),
      level,
      levelName: LogLevel[level],
      message,
      context: { ...this.config.metadata, ...context },
      userId: this.userId ?? undefined,
      sessionId: this.sessionId,
      url: typeof window !== 'undefined' ? window.location.href : undefined,
      userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : undefined,
    };
  }

  private log(level: LogLevel, message: string, context?: Record<string, any>): void {
    if (!this.shouldLog(level)) return;

    const entry = this.createLogEntry(level, message, context);

    // Console transport
    if (this.config.enableConsole) {
      this.logToConsole(entry);
    }

    // LocalStorage transport
    if (this.config.enableLocalStorage) {
      this.logToLocalStorage(entry);
    }

    // Buffer for remote transport
    if (this.config.enableRemote) {
      this.buffer.push({ ...entry, retries: 0 });
      this.maybeFlush();
    }
  }

  private logToConsole(entry: LogEntry): void {
    const styles: Record<LogLevel, string> = {
      [LogLevel.DEBUG]: 'color: #6c757d',
      [LogLevel.INFO]: 'color: #0dcaf0',
      [LogLevel.WARN]: 'color: #ffc107',
      [LogLevel.ERROR]: 'color: #dc3545',
      [LogLevel.FATAL]: 'color: #dc3545; font-weight: bold',
    };

    const prefix = `%c[${entry.levelName}]`;
    const style = styles[entry.level] || styles[LogLevel.INFO];

    if (entry.context) {
      console.log(prefix, style, entry.message, entry.context);
    } else {
      console.log(prefix, style, entry.message);
    }
  }

  private logToLocalStorage(entry: LogEntry): void {
    try {
      const key = 'app_logs';
      const existing = localStorage.getItem(key);
      const logs = existing ? JSON.parse(existing) : [];
      
      logs.push(entry);
      
      // Keep only last 100 logs in localStorage
      const trimmed = logs.slice(-100);
      localStorage.setItem(key, JSON.stringify(trimmed));
    } catch (e) {
      console.error('Failed to write to localStorage:', e);
    }
  }

  private maybeFlush(): void {
    if (this.buffer.length >= this.config.maxBufferSize) {
      this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const entries = [...this.buffer];
    this.buffer = [];

    try {
      const response = await fetch(this.config.remoteEndpoint!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logs: entries }),
      });

      if (!response.ok) {
        // Re-buffer failed entries
        this.buffer = [...entries, ...this.buffer];
      }
    } catch (error) {
      // Re-buffer on network error
      this.buffer = [...entries, ...this.buffer];
      
      // Limit retries
      this.buffer = this.buffer.filter(entry => {
        if (entry.retries < 3) {
          entry.retries++;
          return true;
        }
        return false;
      });
    }
  }

  // Public logging methods
  debug(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  info(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, context);
  }

  warn(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, context);
  }

  error(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.ERROR, message, context);
  }

  fatal(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.FATAL, message, context);
  }

  // Create child logger with additional context
  child(additionalContext: Record<string, any>): EnterpriseLogger {
    const childLogger = new EnterpriseLogger({
      ...this.config,
      metadata: { ...this.config.metadata, ...additionalContext },
    });
    childLogger.setUserId(this.userId);
    return childLogger;
  }

  // Performance timing
  time(label: string): () => void {
    const start = Date.now();
    return () => {
      const duration = Date.now() - start;
      this.info(`[TIMING] ${label}`, { durationMs: duration });
    };
  }

  // Cleanup
  destroy(): void {
    this.stopFlushTimer();
    this.flush();
  }
}

// Singleton instance
export const logger = new EnterpriseLogger();

// Convenience functions
export const createLogger = (config?: Partial<LoggerConfig>) => new EnterpriseLogger(config);

export default logger;
