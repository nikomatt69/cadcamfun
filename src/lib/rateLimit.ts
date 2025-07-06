import { NextApiRequest, NextApiResponse } from 'next';
import { getRedisClient } from './redis';

interface RateLimitOptions {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  keyGenerator?: (req: NextApiRequest) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

export class RateLimiter {
  private options: RateLimitOptions;
  private fallbackStore = new Map<string, { count: number; resetTime: number }>();

  constructor(options: RateLimitOptions) {
    this.options = {
      keyGenerator: (req) => this.getClientIP(req),
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
      ...options
    };
  }

  private getClientIP(req: NextApiRequest): string {
    const forwarded = req.headers['x-forwarded-for'];
    const ip = forwarded 
      ? (Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0])
      : req.connection?.remoteAddress || req.socket?.remoteAddress;
    
    return ip || 'unknown';
  }

  async isAllowed(req: NextApiRequest): Promise<{ allowed: boolean; limit: number; remaining: number; resetTime: number }> {
    const key = `rate_limit:${this.options.keyGenerator!(req)}`;
    const now = Date.now();
    const windowStart = now - this.options.windowMs;

    try {
      const redis = getRedisClient();
      
      if (redis) {
        return await this.checkRedisLimit(redis, key, now, windowStart);
      } else {
        return this.checkMemoryLimit(key, now, windowStart);
      }
    } catch (error) {
      console.error('Rate limit check failed:', error);
      // Fail open - allow request if rate limiting fails
      return {
        allowed: true,
        limit: this.options.maxRequests,
        remaining: this.options.maxRequests,
        resetTime: now + this.options.windowMs
      };
    }
  }

  private async checkRedisLimit(redis: any, key: string, now: number, windowStart: number) {
    const pipeline = redis.pipeline();
    
    // Remove old entries
    pipeline.zremrangebyscore(key, 0, windowStart);
    
    // Count current requests
    pipeline.zcard(key);
    
    // Add current request
    pipeline.zadd(key, now, `${now}-${Math.random()}`);
    
    // Set expiration
    pipeline.expire(key, Math.ceil(this.options.windowMs / 1000));
    
    const results = await pipeline.exec();
    const currentCount = results[1][1] as number;
    
    const allowed = currentCount < this.options.maxRequests;
    const resetTime = now + this.options.windowMs;

    return {
      allowed,
      limit: this.options.maxRequests,
      remaining: Math.max(0, this.options.maxRequests - currentCount - 1),
      resetTime
    };
  }

  private checkMemoryLimit(key: string, now: number, windowStart: number) {
    // Clean old entries
    Array.from(this.fallbackStore.entries()).forEach(([k, v]) => {
      if (v.resetTime < now) {
        this.fallbackStore.delete(k);
      }
    });

    const current = this.fallbackStore.get(key) || { count: 0, resetTime: now + this.options.windowMs };
    
    if (current.resetTime < now) {
      current.count = 0;
      current.resetTime = now + this.options.windowMs;
    }

    const allowed = current.count < this.options.maxRequests;
    
    if (allowed) {
      current.count++;
      this.fallbackStore.set(key, current);
    }

    return {
      allowed,
      limit: this.options.maxRequests,
      remaining: Math.max(0, this.options.maxRequests - current.count),
      resetTime: current.resetTime
    };
  }
}

// Pre-configured rate limiters for different endpoints
export const rateLimiters = {
  // WebAuthn endpoints - strict limiting
  webauthn: new RateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 10, // 10 attempts per 15 minutes
  }),

  // Authentication endpoints
  auth: new RateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 15,
  }),

  // API endpoints - more lenient
  api: new RateLimiter({
    windowMs: 1 * 60 * 1000, // 1 minute
    maxRequests: 100,
  }),

  // Marketplace endpoints
  marketplace: new RateLimiter({
    windowMs: 1 * 60 * 1000, // 1 minute
    maxRequests: 60,
  })
};

export function withRateLimit(limiter: RateLimiter) {
  return async (req: NextApiRequest, res: NextApiResponse, next: () => Promise<void>) => {
    const result = await limiter.isAllowed(req);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', result.limit);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000));

    if (!result.allowed) {
      return res.status(429).json({
        error: 'Too many requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000)
      });
    }

    await next();
  };
} 