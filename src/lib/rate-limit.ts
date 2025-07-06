// src/lib/rate-limit.ts
// Rate limiting utility for API endpoints

interface RateLimitConfig {
  interval: number; // Time window in milliseconds
  uniqueTokenPerInterval: number; // Max unique tokens per interval
}

interface RateLimitCache {
  count: number;
  resetTime: number;
}

class RateLimit {
  private config: RateLimitConfig;
  private cache: Map<string, RateLimitCache> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor(config: RateLimitConfig) {
    this.config = config;

    // Cleanup expired entries every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60 * 1000);
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, value] of Array.from(this.cache.entries())) {
      if (now > value.resetTime) {
        this.cache.delete(key);
      }
    }
  }

  async check(res: any, limit: number, token: string): Promise<void> {
    const now = Date.now();
    const resetTime = now + this.config.interval;

    const cached = this.cache.get(token);

    if (!cached) {
      // First request from this token
      this.cache.set(token, { count: 1, resetTime });
      return;
    }

    if (now > cached.resetTime) {
      // Reset window has passed
      this.cache.set(token, { count: 1, resetTime });
      return;
    }

    if (cached.count >= limit) {
      // Rate limit exceeded
      throw new Error('Rate limit exceeded');
    }

    // Increment count
    cached.count++;
  }

  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.cache.clear();
  }
}

export function rateLimit(config: RateLimitConfig): RateLimit {
  return new RateLimit(config);
}