// src/hooks/useUnifiedAuth.ts
// React hook for unified authentication system

import { useState, useEffect, useCallback, useRef } from 'react';
import { auth, AuthState, AuthSession, AuthError } from '@/src/lib/auth-unified';

interface UseAuthOptions {
  requireAuth?: boolean;
  requiredRoles?: string[];
  onAuthChange?: (state: AuthState) => void;
}

interface UseAuthResult extends AuthState {
  signIn: (email: string, password: string) => Promise<AuthSession>;
  signOut: () => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<AuthSession>;
  refresh: () => Promise<void>;
  hasRole: (role: string) => boolean;
  hasAnyRole: (roles: string[]) => boolean;
  isDesktop: boolean;
  isWeb: boolean;
  platform: 'web' | 'desktop';
}

export function useUnifiedAuth(options: UseAuthOptions = {}): UseAuthResult {
  const { requireAuth = false, requiredRoles = [], onAuthChange } = options;
  
  const [state, setState] = useState<AuthState>(() => auth.getState());
  const unsubscribeRef = useRef<(() => void) | null>(null);
  
  // Subscribe to auth state changes
  useEffect(() => {
    unsubscribeRef.current = auth.onAuthStateChange((newState) => {
      setState(newState);
      onAuthChange?.(newState);
    });
    
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [onAuthChange]);

  // Memoized auth methods
  const signIn = useCallback(async (email: string, password: string): Promise<AuthSession> => {
    return await auth.signIn(email, password);
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    await auth.signOut();
  }, []);

  const signUp = useCallback(async (name: string, email: string, password: string): Promise<AuthSession> => {
    return await auth.signUp(name, email, password);
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    await auth.validateSession();
  }, []);

  const hasRole = useCallback((role: string): boolean => {
    return auth.hasRole(role);
  }, []);

  const hasAnyRole = useCallback((roles: string[]): boolean => {
    return auth.hasAnyRole(roles);
  }, []);

  // Platform detection
  const isDesktop = auth.isDesktop();
  const isWeb = auth.isWeb();
  const platform = auth.getPlatform();

  return {
    ...state,
    signIn,
    signOut,
    signUp,
    refresh,
    hasRole,
    hasAnyRole,
    isDesktop,
    isWeb,
    platform
  };
}

// Specialized hooks for common use cases
export function useAuthSession(): AuthSession | null {
  const { session } = useUnifiedAuth();
  return session;
}

export function useAuthUser() {
  const { session } = useUnifiedAuth();
  return session?.user || null;
}

export function useAuthGuard(requiredRoles: string[] = []) {
  const { isAuthenticated, hasAnyRole, loading } = useUnifiedAuth();
  
  const canAccess = isAuthenticated && (requiredRoles.length === 0 || hasAnyRole(requiredRoles));
  
  return {
    canAccess,
    isAuthenticated,
    loading,
    hasAccess: canAccess
  };
}

// Hook for protected routes
export function useProtectedRoute(requiredRoles: string[] = []) {
  const { isAuthenticated, hasAnyRole, loading, session } = useUnifiedAuth();
  
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      // Redirect to login if not authenticated
      if (typeof window !== 'undefined') {
        window.location.href = '/auth/signin';
      }
    }
  }, [isAuthenticated, loading]);
  
  const canAccess = isAuthenticated && (requiredRoles.length === 0 || hasAnyRole(requiredRoles));
  
  return {
    canAccess,
    isAuthenticated,
    loading,
    user: session?.user || null
  };
}

// Hook for authentication forms
export function useAuthForm() {
  const { signIn, signOut, signUp, loading, error } = useUnifiedAuth();
  const [formError, setFormError] = useState<string | null>(null);
  
  const handleSignIn = useCallback(async (email: string, password: string) => {
    try {
      setFormError(null);
      await signIn(email, password);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Sign in failed');
    }
  }, [signIn]);
  
  const handleSignUp = useCallback(async (name: string, email: string, password: string) => {
    try {
      setFormError(null);
      await signUp(name, email, password);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Sign up failed');
    }
  }, [signUp]);
  
  const handleSignOut = useCallback(async () => {
    try {
      setFormError(null);
      await signOut();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Sign out failed');
    }
  }, [signOut]);
  
  return {
    signIn: handleSignIn,
    signUp: handleSignUp,
    signOut: handleSignOut,
    loading,
    error: formError || error?.message || null
  };
}

// Hook for desktop-specific features
export function useDesktopAuth() {
  const { isDesktop, platform, session } = useUnifiedAuth();
  
  // Desktop-specific session persistence
  const persistSession = useCallback(async () => {
    if (isDesktop && session) {
      try {
        localStorage.setItem('desktop_session', JSON.stringify({
          sessionId: session.sessionId,
          userId: session.user.id,
          expires: session.expires
        }));
      } catch (error) {
        console.error('Failed to persist desktop session:', error);
      }
    }
  }, [isDesktop, session]);
  
  // Desktop-specific session restoration
  const restoreSession = useCallback(async () => {
    if (isDesktop) {
      try {
        const stored = localStorage.getItem('desktop_session');
        if (stored) {
          const data = JSON.parse(stored);
          if (new Date(data.expires) > new Date()) {
            await auth.validateSession();
          } else {
            localStorage.removeItem('desktop_session');
          }
        }
      } catch (error) {
        console.error('Failed to restore desktop session:', error);
      }
    }
  }, [isDesktop]);
  
  useEffect(() => {
    if (isDesktop) {
      restoreSession();
    }
  }, [isDesktop, restoreSession]);
  
  useEffect(() => {
    if (isDesktop && session) {
      persistSession();
    }
  }, [isDesktop, session, persistSession]);
  
  return {
    isDesktop,
    platform,
    persistSession,
    restoreSession
  };
}