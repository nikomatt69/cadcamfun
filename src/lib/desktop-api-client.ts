// Desktop API Client - Uses Tauri HTTP Plugin for all API calls
// This ensures all HTTP requests go through Tauri's secure HTTP plugin instead of browser fetch

import { getEnvironment, getApiUrl } from '../hooks/useTauri';

export interface DesktopSignInRequest {
  email: string;
  password: string;
  deviceId?: string;
  platform?: string;
}

export interface DesktopSignInResponse {
  success: boolean;
  token?: string;
  user?: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
  };
  error?: string;
  syncData?: {
    lastSync: string;
    version: string;
  };
}

export interface ProjectData {
  id: string;
  name: string;
  description?: string;
  organizationId?: string;
  createdAt: string;
  updatedAt: string;
  userId: string;
}

export interface UserData {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Main Desktop API Client Class
export class DesktopApiClient {
  private httpFetch: ((url: string, options?: RequestInit) => Promise<Response>) | null = null;
  private isDesktop: boolean = false;
  private authToken: string | null = null;
  private baseUrl: string;

  constructor() {
    this.baseUrl = this.getBaseUrl();
    this.initializeHttpClient();
  }

  // Initialize HTTP client with Tauri bridge
  private async initializeHttpClient() {
    const env = getEnvironment();
    this.isDesktop = env === 'desktop';

    if (this.isDesktop && typeof window !== 'undefined') {
      // Load Tauri HTTP client dynamically
      try {
        const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
        this.httpFetch = tauriFetch;
        console.log('✅ Desktop API Client: Using Tauri HTTP Plugin');
      } catch (error) {
        console.warn('⚠️ Desktop API Client: Tauri HTTP Plugin failed, falling back to standard fetch', error);
        this.httpFetch = window.fetch.bind(window);
      }
    } else {
      // Fallback for web environment
      this.httpFetch = typeof window !== 'undefined' ? window.fetch.bind(window) : fetch;
      console.log('🌐 Desktop API Client: Using standard fetch (web environment)');
    }
  }

  // Get appropriate base URL for current environment
  private getBaseUrl(): string {
    const env = getEnvironment();
    
    if (env === 'desktop') {
      return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    }
    
    if (typeof window !== 'undefined') {
      return window.location.origin;
    }
    
    return process.env.NEXTAUTH_URL || 'http://localhost:3001';
  }

  // Set authentication token for subsequent requests
  setAuthToken(token: string | null) {
    this.authToken = token;
  }

  // Generic API request method with Tauri HTTP plugin
  private async apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    // Ensure HTTP client is initialized
    if (!this.httpFetch) {
      await this.initializeHttpClient();
    }

    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    // Add authentication token if available
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    // Add Tauri-specific headers for desktop identification
    if (this.isDesktop) {
      headers['X-Desktop-Client'] = 'tauri';
      headers['X-Client-Platform'] = 'desktop';
    }

    const requestOptions: RequestInit = {
      ...options,
      headers,
    };

    try {
      console.log(`🔄 API Request [${this.isDesktop ? 'TAURI' : 'WEB'}]: ${options.method || 'GET'} ${url}`);
      
      const response = await this.httpFetch!(url, requestOptions);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ API Error: ${response.status} ${response.statusText}`, errorText);
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`
        };
      }

      const data = await response.json();
      console.log(`✅ API Success [${this.isDesktop ? 'TAURI' : 'WEB'}]: ${url}`);
      
      return {
        success: true,
        data
      };
    } catch (error) {
      console.error(`❌ API Request Failed [${this.isDesktop ? 'TAURI' : 'WEB'}]:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // ============================================================================
  // AUTHENTICATION ENDPOINTS
  // ============================================================================

  async signIn(request: DesktopSignInRequest): Promise<ApiResponse<DesktopSignInResponse>> {
    return this.apiRequest<DesktopSignInResponse>('/api/desktop/auth/signin', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async checkAuthStatus(): Promise<ApiResponse<any>> {
    return this.apiRequest<any>('/api/auth/session');
  }

  async signOut(): Promise<ApiResponse<void>> {
    const response = await this.apiRequest<void>('/api/auth/signout', {
      method: 'POST',
    });
    
    // Clear auth token on successful signout
    if (response.success) {
      this.setAuthToken(null);
    }
    
    return response;
  }

  // ============================================================================
  // USER MANAGEMENT ENDPOINTS
  // ============================================================================

  async getUserByEmail(email: string): Promise<ApiResponse<UserData>> {
    return this.apiRequest<UserData>(`/api/desktop/user/by-email?email=${encodeURIComponent(email)}`);
  }

  async getCurrentUser(): Promise<ApiResponse<UserData>> {
    return this.apiRequest<UserData>('/api/user/me');
  }

  // ============================================================================
  // PROJECT MANAGEMENT ENDPOINTS
  // ============================================================================

  async getProjects(): Promise<ApiResponse<ProjectData[]>> {
    return this.apiRequest<ProjectData[]>('/api/desktop/projects');
  }

  async createProject(name: string, description?: string, organizationId?: string): Promise<ApiResponse<ProjectData>> {
    return this.apiRequest<ProjectData>('/api/desktop/projects', {
      method: 'POST',
      body: JSON.stringify({ name, description, organizationId }),
    });
  }

  async getProjectById(projectId: string): Promise<ApiResponse<ProjectData>> {
    return this.apiRequest<ProjectData>(`/api/desktop/projects/${projectId}`);
  }

  async updateProject(projectId: string, data: Partial<Pick<ProjectData, 'name' | 'description'>>): Promise<ApiResponse<ProjectData>> {
    return this.apiRequest<ProjectData>(`/api/desktop/projects/${projectId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteProject(projectId: string): Promise<ApiResponse<void>> {
    return this.apiRequest<void>(`/api/desktop/projects/${projectId}`, {
      method: 'DELETE',
    });
  }

  // ============================================================================
  // HEALTH & MONITORING ENDPOINTS
  // ============================================================================

  async checkHealth(): Promise<ApiResponse<any>> {
    return this.apiRequest<any>('/api/health');
  }

  async getSyncStatus(): Promise<ApiResponse<any>> {
    return this.apiRequest<any>('/api/desktop/sync/status');
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  isUsingTauriHttp(): boolean {
    return this.isDesktop && this.httpFetch !== window?.fetch;
  }

  getClientInfo() {
    return {
      isDesktop: this.isDesktop,
      baseUrl: this.baseUrl,
      usingTauriHttp: this.isUsingTauriHttp(),
      hasAuthToken: !!this.authToken,
    };
  }
}

// Singleton instance
let desktopApiClient: DesktopApiClient | null = null;

// Get or create the singleton desktop API client
export const getDesktopApiClient = (): DesktopApiClient => {
  if (!desktopApiClient) {
    desktopApiClient = new DesktopApiClient();
  }
  return desktopApiClient;
};

// Hook for React components
export const useDesktopApi = () => {
  const client = getDesktopApiClient();
  
  return {
    client,
    ...client.getClientInfo(),
    
    // Authentication methods
    signIn: client.signIn.bind(client),
    signOut: client.signOut.bind(client),
    checkAuthStatus: client.checkAuthStatus.bind(client),
    
    // User methods
    getUserByEmail: client.getUserByEmail.bind(client),
    getCurrentUser: client.getCurrentUser.bind(client),
    
    // Project methods
    getProjects: client.getProjects.bind(client),
    createProject: client.createProject.bind(client),
    getProjectById: client.getProjectById.bind(client),
    updateProject: client.updateProject.bind(client),
    deleteProject: client.deleteProject.bind(client),
    
    // Utility methods
    checkHealth: client.checkHealth.bind(client),
    getSyncStatus: client.getSyncStatus.bind(client),
    setAuthToken: client.setAuthToken.bind(client),
  };
};

// Export default client instance
export default getDesktopApiClient;