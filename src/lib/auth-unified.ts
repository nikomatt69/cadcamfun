// src/lib/auth-unified.ts
// Unified authentication system for both web and desktop platforms


interface AuthEnvironment {
  isDesktop: boolean;
  isWeb: boolean;
  baseURL: string;
  platform: 'web' | 'desktop';
}

interface AuthSession {
  user: {
    id: string;
    email: string;
    name: string;
    image?: string;
    roles?: string[];
  };
  expires: string;
  sessionId: string;
}

interface AuthError {
  code: string;
  message: string;
  details?: any;
}

interface AuthState {
  session: AuthSession | null;
  loading: boolean;
  error: AuthError | null;
  isAuthenticated: boolean;
}

class UnifiedAuth {
  private environment: AuthEnvironment;
  private sessionCache: Map<string, { data: AuthSession; expires: number }> = new Map();
  private listeners: Set<(state: AuthState) => void> = new Set();
  private currentState: AuthState = {
    session: null,
    loading: false,
    error: null,
    isAuthenticated: false
  };

  constructor() {
    this.environment = this.detectEnvironment();
    this.initializeAuth();
  }

  private detectEnvironment(): AuthEnvironment {
    // SSR-safe environment detection
    if (typeof window === 'undefined') {
      // Server-side rendering
      return {
        isDesktop: false,
        isWeb: true,
        baseURL: process.env.NEXTAUTH_URL || "http://localhost:3001",
        platform: 'web'
      };
    }

    const isDesktop = (
      window.navigator.userAgent.includes('Tauri') ||
      window.location.protocol === 'tauri:' ||
      (window.location.hostname === 'localhost' && window.location.port === '1420') ||
      // Additional desktop detection
      window.location.protocol === 'file:' ||
      window.navigator.userAgent.includes('Electron')
    );

    const baseURL = isDesktop
      ? "http://localhost:3001"
      : window.location.origin;

    return {
      isDesktop,
      isWeb: !isDesktop,
      baseURL,
      platform: isDesktop ? 'desktop' : 'web'
    };
  }

  private async initializeAuth() {
    // Skip initialization during SSR
    if (typeof window === 'undefined') {
      return;
    }

    try {
      this.updateState({ loading: true, error: null });
      const session = await this.validateSession();
      this.updateState({
        session,
        loading: false,
        isAuthenticated: !!session,
        error: null
      });
    } catch (error) {
      this.updateState({
        loading: false,
        error: this.createError('INIT_ERROR', 'Failed to initialize authentication', error)
      });
    }
  }

  private updateState(updates: Partial<AuthState>) {
    this.currentState = { ...this.currentState, ...updates };
    this.listeners.forEach(listener => listener(this.currentState));
  }

  private createError(code: string, message: string, details?: any): AuthError {
    return { code, message, details };
  }

  private async makeRequest(endpoint: string, options: RequestInit = {}): Promise<Response> {
    const url = `${this.environment.baseURL}${endpoint}`;

    // SSR-safe headers construction
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Platform': this.environment.platform,
      ...options.headers as Record<string, string>
    };

    // Add client-side headers only when window is available
    if (typeof window !== 'undefined') {
      headers['X-Forwarded-Host'] = window.location.hostname;
      headers['X-Forwarded-Port'] = window.location.port;
      headers['X-Forwarded-Proto'] = window.location.protocol;
      headers['X-Forwarded-For'] = window.location.hostname;
    }

    const defaultOptions: RequestInit = {
      credentials: 'include',
      headers,
      ...options
    };

    // Desktop-specific request handling
    if (this.environment.isDesktop) {
      // Ensure proper cookie handling for desktop
      defaultOptions.mode = 'cors';
    }

    const response = await fetch(url, defaultOptions);

    // Handle common errors
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(error.message || `Request failed: ${response.status}`);
    }

    return response;
  }

  async validateSession(): Promise<AuthSession | null> {
    try {
      const response = await this.makeRequest('/api/auth/get-session');
      const data = await response.json();

      if (data.session) {
        // Cache the session
        this.sessionCache.set('current', {
          data: data.session,
          expires: Date.now() + (5 * 60 * 1000) // 5 minutes
        });
        return data.session;
      }

      return null;
    } catch (error) {
      console.error('Session validation error:', error);
      return null;
    }
  }

  async signIn(email: string, password: string): Promise<AuthSession> {
    try {
      this.updateState({ loading: true, error: null });

      const response = await this.makeRequest('/api/auth/signin', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Sign in failed');
      }

      // Refresh session after successful sign in
      const session = await this.validateSession();
      if (!session) {
        throw new Error('Failed to establish session after sign in');
      }

      this.updateState({
        session,
        loading: false,
        isAuthenticated: true,
        error: null
      });

      return session;
    } catch (error) {
      const authError = this.createError('SIGNIN_ERROR', 'Sign in failed', error);
      this.updateState({
        loading: false,
        error: authError,
        isAuthenticated: false,
        session: null
      });
      throw authError;
    }
  }

  async signOut(): Promise<void> {
    try {
      this.updateState({ loading: true, error: null });

      await this.makeRequest('/api/auth/signout', {
        method: 'POST'
      });

      // Clear cache
      this.sessionCache.clear();

      this.updateState({
        session: null,
        loading: false,
        isAuthenticated: false,
        error: null
      });
    } catch (error) {
      // Even if signout fails, clear local state
      this.sessionCache.clear();
      this.updateState({
        session: null,
        loading: false,
        isAuthenticated: false,
        error: this.createError('SIGNOUT_ERROR', 'Sign out failed', error)
      });
    }
  }

  async signUp(name: string, email: string, password: string): Promise<AuthSession> {
    try {
      this.updateState({ loading: true, error: null });

      const response = await this.makeRequest('/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ name, email, password })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Sign up failed');
      }

      // Auto sign in after successful registration
      return await this.signIn(email, password);
    } catch (error) {
      const authError = this.createError('SIGNUP_ERROR', 'Sign up failed', error);
      this.updateState({
        loading: false,
        error: authError
      });
      throw authError;
    }
  }

  // Session management with caching
  getCachedSession(): AuthSession | null {
    const cached = this.sessionCache.get('current');
    if (cached && cached.expires > Date.now()) {
      return cached.data;
    }
    return null;
  }

  // Subscribe to auth state changes
  onAuthStateChange(listener: (state: AuthState) => void): () => void {
    this.listeners.add(listener);
    // Immediately call with current state
    listener(this.currentState);

    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  // Get current auth state
  getState(): AuthState {
    return { ...this.currentState };
  }

  // Check if user has required roles
  hasRole(role: string): boolean {
    return this.currentState.session?.user?.roles?.includes(role) || false;
  }

  // Check if user has any of the required roles
  hasAnyRole(roles: string[]): boolean {
    if (!this.currentState.session?.user?.roles) return false;
    return roles.some(role => this.currentState.session!.user.roles!.includes(role));
  }

  // Platform-specific methods
  isDesktop(): boolean {
    return this.environment.isDesktop;
  }

  isWeb(): boolean {
    return this.environment.isWeb;
  }

  getPlatform(): 'web' | 'desktop' {
    return this.environment.platform;
  }
}

// Export singleton instance
export const auth = new UnifiedAuth();
export type { AuthSession, AuthError, AuthState };