// src/lib/httpClient.ts
// Unified HTTP client that works in both web and desktop environments

// SSR-safe desktop environment detection
const isDesktop = (): boolean => {
  if (typeof window === 'undefined') return false;
  
  return (
    (window as any).__TAURI__ !== undefined ||
    (window as any).__TAURI_METADATA__ !== undefined ||
    (window as any).__TAURI_INTERNALS__ !== undefined ||
    window.navigator.userAgent.includes('Tauri') ||
    window.location.protocol === 'tauri:'
  );
};

// Dynamic import for Tauri HTTP plugin
let tauriFetch: any = null;

const loadTauriFetch = async () => {
  if (isDesktop() && !tauriFetch) {
    try {
      const { fetch } = await import('@tauri-apps/plugin-http');
      tauriFetch = fetch;
    } catch (error) {
      console.warn('Failed to load Tauri HTTP plugin:', error);
      // Fallback to global fetch
      tauriFetch = globalThis.fetch;
    }
  }
  return tauriFetch || globalThis.fetch;
};

/**
 * Unified HTTP fetch function that works in both web and desktop environments
 * 
 * @param url - The URL to fetch
 * @param options - Fetch options (same as standard fetch API)
 * @returns Promise<Response>
 */
export const httpFetch = async (url: string, options?: RequestInit): Promise<Response> => {
  // SSR-safe check
  if (typeof window === 'undefined') {
    // During SSR, use Node.js fetch or return a mock response
    return fetch(url, options);
  }

  const desktop = isDesktop();
  
  // Add platform header for desktop environment
  const enhancedOptions: RequestInit = {
    ...options,
    headers: {
      ...options?.headers,
      ...(desktop && { 'x-platform': 'desktop' }),
    }
  };

  if (desktop) {
    // Desktop environment - use Tauri HTTP plugin
    const fetchFn = await loadTauriFetch();
    return fetchFn(url, enhancedOptions);
  } else {
    // Web environment - use global fetch
    return fetch(url, enhancedOptions);
  }
};

/**
 * Enhanced HTTP client with built-in error handling and JSON parsing
 */
export class HttpClient {
  private baseURL: string;
  private defaultHeaders: Record<string, string>;

  constructor(baseURL: string = '', defaultHeaders: Record<string, string> = {}) {
    // Determine base URL based on environment
    if (!baseURL) {
      if (typeof window !== 'undefined') {
        if (isDesktop()) {
          this.baseURL = 'http://localhost:3001';
        } else {
          this.baseURL = window.location.origin;
        }
      } else {
        // SSR environment
        this.baseURL = process.env.NEXTAUTH_URL || 'http://localhost:3001';
      }
    } else {
      this.baseURL = baseURL;
    }

    const desktop = typeof window !== 'undefined' ? isDesktop() : false;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      // Automatically add platform header for desktop environment
      ...(desktop && { 'x-platform': 'desktop' }),
      ...defaultHeaders,
    };
  }

  private async makeRequest(url: string, options?: RequestInit): Promise<Response> {
    const fullUrl = url.startsWith('http') ? url : `${this.baseURL}${url}`;

    const mergedOptions: RequestInit = {
      ...options,
      headers: {
        ...this.defaultHeaders,
        ...options?.headers,
      },
    };

    // Add credentials for cookie handling
    if (!mergedOptions.credentials) {
      mergedOptions.credentials = 'include';
    }

    return httpFetch(fullUrl, mergedOptions);
  }

  async get(url: string, options?: RequestInit): Promise<Response> {
    return this.makeRequest(url, { ...options, method: 'GET' });
  }

  async post(url: string, body?: any, options?: RequestInit): Promise<Response> {
    return this.makeRequest(url, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async put(url: string, body?: any, options?: RequestInit): Promise<Response> {
    return this.makeRequest(url, {
      ...options,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async delete(url: string, options?: RequestInit): Promise<Response> {
    return this.makeRequest(url, { ...options, method: 'DELETE' });
  }

  async patch(url: string, body?: any, options?: RequestInit): Promise<Response> {
    return this.makeRequest(url, {
      ...options,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  /**
   * Make a request and automatically parse JSON response
   */
  async json<T = any>(url: string, options?: RequestInit): Promise<T> {
    const response = await this.makeRequest(url, options);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error('Response is not JSON');
    }

    return response.json();
  }
}

// Default client instance - SSR safe
let _httpClient: HttpClient | null = null;

export const httpClient = (() => {
  if (typeof window !== 'undefined' && !_httpClient) {
    _httpClient = new HttpClient();
  }
  return _httpClient || new HttpClient();
})();

// Utility functions for common patterns
export const apiGet = (url: string) => httpClient.get(url);
export const apiPost = (url: string, body?: any) => httpClient.post(url, body);
export const apiPut = (url: string, body?: any) => httpClient.put(url, body);
export const apiDelete = (url: string) => httpClient.delete(url);
export const apiPatch = (url: string, body?: any) => httpClient.patch(url, body);

// JSON utilities
export const getJSON = <T = any>(url: string): Promise<T> => httpClient.json<T>(url);
export const postJSON = <T = any>(url: string, body?: any): Promise<T> =>
  httpClient.json<T>(url, { method: 'POST', body: body ? JSON.stringify(body) : undefined });