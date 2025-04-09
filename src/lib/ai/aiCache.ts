// src/lib/ai/aiCache.ts
interface CacheItem<T> {
  data: T;
  timestamp: number;
  hash: string;
}

interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
  maxSize?: number; // Maximum number of items in cache
}

export class AICache {
  [x: string]: any;
  private cache: Map<string, CacheItem<any>> = new Map();
  private options: Required<CacheOptions>;
  
  constructor(options: CacheOptions = {}) {
    this.options = {
      ttl: options.ttl || 1000 * 60 * 30, // 30 minutes by default
      maxSize: options.maxSize || 100 // 100 items by default
    };
  }
  
  // Generate a cache key from a request
  getKeyForRequest(requestObj: any): string {
    // Serialize and hash the request for a unique key
    return btoa(JSON.stringify(requestObj));
  }
  
  // Get a cached item if it exists and is not expired
  get<T>(key: string): T | null {
    const item = this.cache.get(key);
    
    if (!item) return null;
    
    // Check if item is expired
    if (Date.now() - item.timestamp > this.options.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return item.data;
  }
  
  // Store an item in the cache
  set<T>(key: string, data: T): void {
    // Ensure we don't exceed the max size
    if (this.cache.size >= this.options.maxSize) {
      // Rimuove l'elemento più vecchio
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      hash: key
    });
  }
  
  // Check if a key exists and is not expired
  has(key: string): boolean {
    const item = this.cache.get(key);
    
    if (!item) return false;
    
    // Check if item is expired
    if (Date.now() - item.timestamp > this.options.ttl) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }
  
  // Clear all cached items
  clear(): void {
    this.cache.clear();
  }
  
  // Clear expired items
  clearExpired(): void {
    this.cache.forEach((item, key) => {
      if (Date.now() - item.timestamp > this.options.ttl) {
        this.cache.delete(key);
      }
    });
  }
}

// Export a singleton instance
export const aiCache = new AICache();