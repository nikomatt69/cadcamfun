// src/hooks/useAuthRedirect.ts
import { useRouter } from "next/router";
import { useEffect, useCallback, useState } from "react";
import { useSession } from "@/src/lib/auth-client";

interface RedirectOptions {
  requireAuth?: boolean;
  redirectTo?: string;
  allowedRoles?: string[];
  onRedirect?: () => void;
}

interface AuthRedirectState {
  isLoading: boolean;
  isRedirecting: boolean;
  canAccess: boolean;
  user: any;
}

const PUBLIC_ROUTES = [
  '/auth/signin',
  '/auth/signup', 
  '/auth/verify',
  '/auth/reset-password',
  '/legal/privacy',
  '/legal/terms',
  '/pricing'
];

const PROTECTED_ROUTES = [
  '/cad',
  '/cam', 
  '/projects',
  '/admin',
  '/settings',
  '/analytics'
];

// Store intended route compatibile web/desktop
const INTENDED_ROUTE_KEY = 'auth_intended_route';

// Storage adapter per cross-platform compatibility
const createStorage = () => {
  // In-memory fallback per desktop o quando sessionStorage non disponibile
  let memoryStorage: { [key: string]: string } = {};
  
  return {
    setItem: (key: string, value: string) => {
      try {
        if (typeof window !== 'undefined' && window.sessionStorage) {
          sessionStorage.setItem(key, value);
        } else {
          memoryStorage[key] = value;
        }
      } catch (error) {
        // Fallback to memory se sessionStorage fallisce (desktop)
        memoryStorage[key] = value;
      }
    },
    getItem: (key: string): string | null => {
      try {
        if (typeof window !== 'undefined' && window.sessionStorage) {
          return sessionStorage.getItem(key);
        } else {
          return memoryStorage[key] || null;
        }
      } catch (error) {
        // Fallback to memory se sessionStorage fallisce
        return memoryStorage[key] || null;
      }
    },
    removeItem: (key: string) => {
      try {
        if (typeof window !== 'undefined' && window.sessionStorage) {
          sessionStorage.removeItem(key);
        } else {
          delete memoryStorage[key];
        }
      } catch (error) {
        delete memoryStorage[key];
      }
    }
  };
};

const storage = createStorage();

export function useAuthRedirect(options: RedirectOptions = {}): AuthRedirectState {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [isRedirecting, setIsRedirecting] = useState(false);
  
  const {
    requireAuth = false,
    redirectTo = '/auth/signin',
    allowedRoles = [],
    onRedirect
  } = options;

  // Store intended route quando user accede a protected route senza auth
  const storeIntendedRoute = useCallback((route: string) => {
    if (!PUBLIC_ROUTES.includes(route)) {
      storage.setItem(INTENDED_ROUTE_KEY, route);
    }
  }, []);

  // Get intended route e pulisci storage
  const getAndClearIntendedRoute = useCallback((): string => {
    const intended = storage.getItem(INTENDED_ROUTE_KEY);
    if (intended) {
      storage.removeItem(INTENDED_ROUTE_KEY);
      return intended;
    }
    return '/';
  }, []);

  // Check if user has required roles
  const hasRequiredRole = useCallback((userRoles: string[] = []) => {
    if (allowedRoles.length === 0) return true;
    return allowedRoles.some(role => userRoles.includes(role));
  }, [allowedRoles]);

  // Smart redirect logic
  const handleRedirect = useCallback(async (destination: string) => {
    if (router.asPath === destination) return;
    
    setIsRedirecting(true);
    onRedirect?.();
    
    try {
      await router.push(destination);
    } catch (error) {
      console.error('Redirect error:', error);
    } finally {
      setIsRedirecting(false);
    }
  }, [router, onRedirect]);

  // Main effect per gestire auth redirects
  useEffect(() => {
    if (isPending) return;

    const currentRoute = router.asPath;
    const isPublicRoute = PUBLIC_ROUTES.some(route => currentRoute.startsWith(route));
    const isProtectedRoute = PROTECTED_ROUTES.some(route => currentRoute.startsWith(route));

    // Se è loading, non fare nulla
    if (isPending) return;

    // Se user non autenticato
    if (!session?.user) {
      // Se è in protected route o requireAuth è true
      if (isProtectedRoute || requireAuth) {
        storeIntendedRoute(currentRoute);
        handleRedirect(redirectTo);
        return;
      }
      
      // Se è già in auth pages e non autenticato, ok
      if (isPublicRoute) return;
      
      return;
    }

    // User autenticato
    const userRoles = session.user.roles || [];
    
    // Check roles se specificati
    if (!hasRequiredRole(userRoles)) {
      handleRedirect('/');
      return;
    }

    // Se user autenticato è in auth pages, redirect alla intended route o home
    if (isPublicRoute && currentRoute.startsWith('/auth/')) {
      const intendedRoute = getAndClearIntendedRoute();
      handleRedirect(intendedRoute);
      return;
    }

  }, [session, isPending, router.asPath, requireAuth, redirectTo, hasRequiredRole, storeIntendedRoute, getAndClearIntendedRoute, handleRedirect]);

  // Calculate access state
  const canAccess = (() => {
    if (isPending) return false;
    
    if (requireAuth && !session?.user) return false;
    
    if (session?.user && allowedRoles.length > 0) {
      return hasRequiredRole(session.user.roles || []);
    }
    
    return true;
  })();

  return {
    isLoading: isPending,
    isRedirecting,
    canAccess,
    user: session?.user || null
  };
}

// Hook per redirect post-login ottimizzato (desktop compatible)
export function usePostLoginRedirect() {
  const router = useRouter();
  
  return useCallback(async () => {
    const intendedRoute = storage.getItem(INTENDED_ROUTE_KEY);
    
    if (intendedRoute && !PUBLIC_ROUTES.includes(intendedRoute)) {
      storage.removeItem(INTENDED_ROUTE_KEY);
      await router.push(intendedRoute);
    } else {
      await router.push('/');
    }
  }, [router]);
}

// Hook per controllo route access
export function useRouteAccess(requiredRoles: string[] = []) {
  const { data: session, isPending } = useSession();
  
  return {
    hasAccess: !isPending && session?.user && 
      (requiredRoles.length === 0 || 
       requiredRoles.some(role => session.user.roles?.includes(role))),
    isLoading: isPending,
    user: session?.user
  };
}