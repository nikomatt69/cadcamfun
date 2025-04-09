// src/lib/api/client.ts
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

interface RequestOptions {
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean>;
  data?: any;
}

interface ApiResponse<T> {
  data: T;
  status: number;
}

class ApiError extends Error {
  status: number;
  data: any;
  
  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export async function apiRequest<T>(
  method: HttpMethod,
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  // Costruisci URL con query params
  const url = new URL(endpoint, window.location.origin);
  
  if (options.params) {
    Object.entries(options.params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    });
  }
  
  // Configura la richiesta
  const config: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    credentials: 'include' // Importante per includere i cookie
  };
  
  // Aggiungi il body per POST, PUT
  if (['POST', 'PUT'].includes(method) && options.data) {
    config.body = JSON.stringify(options.data);
  }
  
  // Esegui la richiesta
  const response = await fetch(url.toString(), config);
  
  // Gestisci risposte non JSON
  const contentType = response.headers.get('content-type');
  let data;
  
  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }
  
  // Gestisci errori
  if (!response.ok) {
    const message = data.message || `Errore ${response.status}: ${response.statusText}`;
    throw new ApiError(message, response.status, data);
  }
  
  return data;
}

// Helper per ogni metodo HTTP
export const api = {
  get: <T>(endpoint: string, options?: RequestOptions) => 
    apiRequest<T>('GET', endpoint, options),
  
  post: <T>(endpoint: string, data: any, options?: RequestOptions) => 
    apiRequest<T>('POST', endpoint, { ...options, data }),
  
  put: <T>(endpoint: string, data: any, options?: RequestOptions) => 
    apiRequest<T>('PUT', endpoint, { ...options, data }),
  
  delete: <T>(endpoint: string, options?: RequestOptions) => 
    apiRequest<T>('DELETE', endpoint, options)
};