/**
 * Logger utility for MCP Server
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

class Logger {
  private level: LogLevel;

  constructor(level: LogLevel = LogLevel.INFO) {
    this.level = level;

    // Set log level from environment variable if available
    if (process.env.LOG_LEVEL) {
      const envLevel = process.env.LOG_LEVEL.toUpperCase();
      switch (envLevel) {
        case "DEBUG":
          this.level = LogLevel.DEBUG;
          break;
        case "INFO":
          this.level = LogLevel.INFO;
          break;
        case "WARN":
          this.level = LogLevel.WARN;
          break;
        case "ERROR":
          this.level = LogLevel.ERROR;
          break;
      }
    }
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  debug(message: string, context?: any): void {
    if (this.level <= LogLevel.DEBUG) {
      this.log("DEBUG", message, context);
    }
  }

  info(message: string, context?: any): void {
    if (this.level <= LogLevel.INFO) {
      this.log("INFO", message, context);
    }
  }

  warn(message: string, context?: any): void {
    if (this.level <= LogLevel.WARN) {
      this.log("WARN", message, context);
    }
  }

  error(message: string, context?: any): void {
    if (this.level <= LogLevel.ERROR) {
      this.log("ERROR", message, context);
    }
  }

  private log(level: string, message: string, context?: any): void {
    const timestamp = new Date().toISOString();
    const formattedContext = context ? JSON.stringify(context) : "";

    // In production, this would use a proper logging library
    console.log(`[${timestamp}] [${level}] ${message} ${formattedContext}`);
  }
}

export const logger = new Logger();
