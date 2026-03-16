// src/lib/api/client/index.ts
// Enterprise API Client with retry, caching, and error handling

import { logger } from '../../error/logger';
import { createApiError, isApiError, type ApiError } from '../../error/errorUtils';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestConfig {
  method?: HttpMethod;
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  cache?: RequestCache;
  cacheTTL?: number;
}

export interface RequestOptions extends RequestConfig {
  baseURL?: string;
}

interface CacheEntry {
  data: unknown;
  timestamp: number;
  ttl: number;
}

class APIClient {
  private baseURL: string;
  private defaultHeaders: Record<string, string>;
  private cache: Map<string, CacheEntry>;
  private defaultRetries = 3;
  private defaultRetryDelay = 1000;

  constructor(baseURL: string = '/api') {
    this.baseURL = baseURL;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
    };
    this.cache = new Map();
    
    // Start cache cleanup
    this.startCacheCleanup();
  }

  /**
   * Set authentication token
   */
  setAuthToken(token: string): void {
    this.defaultHeaders['Authorization'] = `Bearer ${token}`;
  }

  /**
   * Remove authentication token
   */
  clearAuthToken(): void {
    delete this.defaultHeaders['Authorization'];
  }

  /**
   * Set default headers
   */
  setHeaders(headers: Record<string, string>): void {
    this.defaultHeaders = { ...this.defaultHeaders, ...headers };
  }

  /**
   * Make HTTP request with retry logic
   */
  async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const {
      method = 'GET',
      headers = {},
      body,
      timeout = 30000,
      retries = this.defaultRetries,
      retryDelay = this.defaultRetryDelay,
      cache,
      cacheTTL,
    } = options;

    const url = this.buildURL(endpoint);
    const requestHeaders = { ...this.defaultHeaders, ...headers };

    // Check cache for GET requests
    if (method === 'GET' && cache !== 'no-store') {
      const cached = this.getFromCache(url, cacheTTL);
      if (cached) {
        logger.debug('Cache hit', { url });
        return cached as T;
      }
    }

    let lastError: Error;
    let attempt = 0;

    while (attempt < retries) {
      try {
        const response = await this.executeRequest<T>(
          url,
          method,
          requestHeaders,
          body,
          timeout
        );

        // Cache successful GET responses
        if (method === 'GET' && cacheTTL && cacheTTL > 0) {
          this.setCache(url, response, cacheTTL);
        }

        logger.info(`API Request: ${method} ${endpoint}`, { 
          status: 'success',
          attempt: attempt + 1 
        });

        return response;
      } catch (error) {
        lastError = error as Error;
        attempt++;

        // Don't retry on client errors (4xx)
        if (error instanceof Response && error.status >= 400 && error.status < 500) {
          throw error;
        }

        if (attempt < retries) {
          logger.warn(`API Request failed, retrying...`, { 
            endpoint, 
            attempt,
            error: lastError.message 
          });
          await this.sleep(retryDelay * attempt);
        }
      }
    }

    logger.error(`API Request failed after ${retries} attempts`, { 
      endpoint, 
      error: lastError?.message 
    });

    throw lastError!;
  }

  private async executeRequest<T>(
    url: string,
    method: HttpMethod,
    headers: Record<string, string>,
    body: unknown,
    timeout: number
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw createApiError(
          errorData.message || `HTTP ${response.status}`,
          response.status,
          errorData.code,
          errorData.details
        );
      }

      // Handle empty responses
      const text = await response.text();
      return text ? JSON.parse(text) : ({} as T);
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw createApiError('Request timeout', 408, 'TIMEOUT');
        }
        throw error;
      }
      
      throw createApiError('Unknown error', 500, 'UNKNOWN');
    }
  }

  /**
   * GET request
   */
  get<T>(endpoint: string, options?: RequestConfig): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  /**
   * POST request
   */
  post<T>(endpoint: string, body?: unknown, options?: RequestConfig): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'POST', body });
  }

  /**
   * PUT request
   */
  put<T>(endpoint: string, body?: unknown, options?: RequestConfig): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'PUT', body });
  }

  /**
   * PATCH request
   */
  patch<T>(endpoint: string, body?: unknown, options?: RequestConfig): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'PATCH', body });
  }

  /**
   * DELETE request
   */
  delete<T>(endpoint: string, options?: RequestConfig): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }

  // ============================================
  // Cache Management
  // ============================================

  private getFromCache(url: string, ttl = 60000): unknown | null {
    const entry = this.cache.get(url);
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(url);
      return null;
    }
    
    return entry.data;
  }

  private setCache(url: string, data: unknown, ttl: number): void {
    this.cache.set(url, {
      data,
      timestamp: Date.now(),
      ttl,
    });
  }

  private clearCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }

  private startCacheCleanup(): void {
    setInterval(() => this.clearCache(), 60000);
  }

  // ============================================
  // Helpers
  // ============================================

  private buildURL(endpoint: string): string {
    if (endpoint.startsWith('http')) return endpoint;
    return `${this.baseURL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Create singleton instance
export const api = new APIClient();

// Create typed API client for specific endpoints
export const createAPIClient = (baseURL: string) => new APIClient(baseURL);

// ============================================
// Typed API Methods
// ============================================

// Projects
export const projects = {
  list: () => api.get('/projects'),
  get: (id: string) => api.get(`/projects/${id}`),
  create: (data: unknown) => api.post('/projects', data),
  update: (id: string, data: unknown) => api.put(`/projects/${id}`, data),
  delete: (id: string) => api.delete(`/projects/${id}`),
};

// Drawings
export const drawings = {
  list: (projectId: string) => api.get(`/projects/${projectId}/drawings`),
  get: (id: string) => api.get(`/drawings/${id}`),
  create: (projectId: string, data: unknown) => 
    api.post(`/projects/${projectId}/drawings`, data),
  update: (id: string, data: unknown) => api.put(`/drawings/${id}`, data),
  delete: (id: string) => api.delete(`/drawings/${id}`),
};

// Components
export const components = {
  list: (params?: { projectId?: string; category?: string }) => 
    api.get('/components', { cacheTTL: 300000, ...params }),
  get: (id: string) => api.get(`/components/${id}`),
  create: (data: unknown) => api.post('/components', data),
  update: (id: string, data: unknown) => api.put(`/components/${id}`, data),
  delete: (id: string) => api.delete(`/components/${id}`),
};

// Toolpaths
export const toolpaths = {
  list: (projectId: string) => api.get(`/projects/${projectId}/toolpaths`),
  get: (id: string) => api.get(`/toolpaths/${id}`),
  create: (data: unknown) => api.post('/toolpaths', data),
  update: (id: string, data: unknown) => api.put(`/toolpaths/${id}`, data),
  delete: (id: string) => api.delete(`/toolpaths/${id}`),
  generate: (drawingId: string, params: unknown) => 
    api.post(`/drawings/${drawingId}/generate-toolpath`, params),
};

// Materials
export const materials = {
  list: () => api.get('/materials', { cacheTTL: 3600000 }),
  get: (id: string) => api.get(`/materials/${id}`),
  create: (data: unknown) => api.post('/materials', data),
  update: (id: string, data: unknown) => api.put(`/materials/${id}`, data),
  delete: (id: string) => api.delete(`/materials/${id}`),
};

// Tools
export const tools = {
  list: () => api.get('/tools', { cacheTTL: 3600000 }),
  get: (id: string) => api.get(`/tools/${id}`),
  create: (data: unknown) => api.post('/tools', data),
  update: (id: string, data: unknown) => api.put(`/tools/${id}`, data),
  delete: (id: string) => api.delete(`/tools/${id}`),
};

// User
export const user = {
  me: () => api.get('/user/me'),
  update: (data: unknown) => api.put('/user/me', data),
  preferences: () => api.get('/user/preferences'),
  updatePreferences: (data: unknown) => api.put('/user/preferences', data),
};

export default api;
