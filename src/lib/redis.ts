import Redis from 'ioredis';

let redis: Redis | null = null;

export const getRedisClient = () => {
  if (!redis) {
    const redisUrl = process.env.REDIS_URL || process.env.REDISCLOUD_URL;
    
    if (redisUrl) {
      redis = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });
    } else if (process.env.NODE_ENV === 'development') {
      // Fallback to local Redis in development
      redis = new Redis({
        host: 'localhost',
        port: 6379,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });
    }
  }
  
  return redis;
};

export const challengeStorage = {
  async setChallenge(key: string, data: any, ttl: number = 300): Promise<void> {
    const client = getRedisClient();
    if (!client) {
      throw new Error('Redis not available');
    }
    
    await client.setex(key, ttl, JSON.stringify({
      ...data,
      timestamp: Date.now()
    }));
  },

  async getChallenge(key: string): Promise<any | null> {
    const client = getRedisClient();
    if (!client) {
      throw new Error('Redis not available');
    }
    
    const data = await client.get(key);
    if (!data) return null;
    
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  },

  async deleteChallenge(key: string): Promise<void> {
    const client = getRedisClient();
    if (!client) {
      throw new Error('Redis not available');
    }
    
    await client.del(key);
  },

  async cleanExpiredChallenges(): Promise<void> {
    // Redis TTL handles this automatically
    // This method is kept for compatibility
  }
};

// Fallback in-memory storage for development without Redis
class MemoryStorage {
  private store = new Map<string, { data: any; expires: number }>();

  async setChallenge(key: string, data: any, ttl: number = 300): Promise<void> {
    this.store.set(key, {
      data: { ...data, timestamp: Date.now() },
      expires: Date.now() + (ttl * 1000)
    });
  }

  async getChallenge(key: string): Promise<any | null> {
    const entry = this.store.get(key);
    if (!entry || Date.now() > entry.expires) {
      this.store.delete(key);
      return null;
    }
    return entry.data;
  }

  async deleteChallenge(key: string): Promise<void> {
    this.store.delete(key);
  }

  async cleanExpiredChallenges(): Promise<void> {
    const now = Date.now();
    Array.from(this.store.entries()).forEach(([key, entry]) => {
      if (now > entry.expires) {
        this.store.delete(key);
      }
    });
  }
}

export const fallbackStorage = new MemoryStorage();

export const getChallengeStorage = () => {
  const client = getRedisClient();
  return client ? challengeStorage : fallbackStorage;
}; 