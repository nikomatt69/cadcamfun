// src/lib/auth-client.ts
import { createAuthClient } from "better-auth/react";

// Detect desktop environment
const isDesktop = typeof window !== 'undefined' &&
  (window.navigator.userAgent.includes('Tauri') ||
    window.location.protocol === 'tauri:' ||
    window.location.hostname === 'localhost' && window.location.port === '1420');

export const authClient = createAuthClient({
  baseURL: isDesktop
    ? "https://localhost:3000"  // Desktop sempre usa localhost
    : process.env.NEXTAUTH_URL || (process.env.NODE_ENV === "production"
      ? "https://cadcamfun.xyz"
      : "https://localhost:3000"),

  // Enhanced configuration for desktop compatibility
  fetchOptions: {
    credentials: 'include', // Important for desktop cookie handling
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }
  }
});

// Enhanced session management with caching and desktop compatibility
import { useState, useEffect, useRef, useCallback } from "react";

// Session cache per evitare chiamate multiple
interface SessionCache {
  data: any;
  timestamp: number;
  isValid: boolean;
}

// Cache duration - 5 minuti
const CACHE_DURATION = 5 * 60 * 1000;
let sessionCache: SessionCache | null = null;

// Session refresh logic compatible with both web and desktop
const refreshSession = async (): Promise<any> => {
  try {
    // Build full URL for desktop compatibility
    const baseURL = isDesktop
      ? "https://localhost:3000"
      : (typeof window !== 'undefined' ? window.location.origin : "");

    const response = await fetch(`${baseURL}/api/auth/get-session`, {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      credentials: 'include' // Essential for cookie handling on both platforms
    });

    if (!response.ok) {
      if (response.status === 401) {
        // Authentication failed - clear any cached session
        return null;
      }
      throw new Error(`Session fetch failed: ${response.status}`);
    }

    const sessionData = await response.json();
    return sessionData.session;
  } catch (error) {
    console.error("Error fetching session:", error);
    return null;
  }
};

// Optimized useSession hook con cache e desktop support
export const useSession = () => {
  const [data, setData] = useState<any>(null);
  const [isPending, setIsPending] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const initialLoadRef = useRef(false);

  // Check cache validity
  const isCacheValid = useCallback((): boolean => {
    if (!sessionCache) return false;
    const now = Date.now();
    const cacheAge = now - sessionCache.timestamp;
    return cacheAge < CACHE_DURATION && sessionCache.isValid;
  }, []);

  // Update cache
  const updateCache = useCallback((sessionData: any) => {
    sessionCache = {
      data: sessionData,
      timestamp: Date.now(),
      isValid: true
    };
  }, []);

  // Invalidate cache
  const invalidateCache = useCallback(() => {
    if (sessionCache) {
      sessionCache.isValid = false;
    }
  }, []);

  // Main session fetch con cache e abort controller
  const fetchSession = useCallback(async (useCache = true) => {
    // Abort previous request se in corso
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Check cache prima di fare richiesta
    if (useCache && isCacheValid() && sessionCache) {
      setData(sessionCache.data);
      setIsPending(false);
      setError(null);
      return sessionCache.data;
    }

    // Show loading solo se non è initial load o cache non valida
    if (!initialLoadRef.current || !isCacheValid()) {
      setIsPending(true);
    }

    setError(null);

    // Create new abort controller
    abortControllerRef.current = new AbortController();

    try {
      const sessionData = await refreshSession();

      // Check if request was aborted
      if (abortControllerRef.current?.signal.aborted) {
        return;
      }

      setData(sessionData);
      updateCache(sessionData);
      setError(null);

      if (!initialLoadRef.current) {
        initialLoadRef.current = true;
      }

      return sessionData;
    } catch (err) {
      if (abortControllerRef.current?.signal.aborted) {
        return;
      }

      const errorMessage = err instanceof Error ? err.message : 'Session fetch failed';
      setError(errorMessage);
      setData(null);
      invalidateCache();
    } finally {
      if (!abortControllerRef.current?.signal.aborted) {
        setIsPending(false);
      }
      abortControllerRef.current = null;
    }
  }, [isCacheValid, updateCache, invalidateCache]);

  // Initial fetch
  useEffect(() => {
    fetchSession();

    // Cleanup on unmount
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchSession]);

  // Refresh session manually
  const refresh = useCallback(() => {
    return fetchSession(false);
  }, [fetchSession]);

  // Clear session (per logout)
  const clear = useCallback(() => {
    setData(null);
    setError(null);
    setIsPending(false);
    invalidateCache();
  }, [invalidateCache]);

  return {
    data,
    isPending,
    error,
    refresh,
    clear
  };
};

// Enhanced auth functions con desktop compatibility e cache management
export const signIn = async (credentials: { email: string; password: string }) => {
  try {
    const response = await fetch('/api/auth/signin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(credentials),
      credentials: 'include' // Important per desktop compatibility
    });

    const result = await response.json();

    // Se login successful, invalida cache per refresh session
    if (response.ok && result.success) {
      // Invalida session cache per forzare refresh
      if (sessionCache) {
        sessionCache.isValid = false;
      }
    }

    return { data: result, error: !response.ok };
  } catch (error) {
    console.error("Sign in error:", error);
    return { data: null, error: true };
  }
};

export const signOut = async () => {
  try {
    const response = await fetch('/api/auth/signout', {
      method: 'POST',
      headers: {
        'Accept': 'application/json'
      },
      credentials: 'include' // Important per desktop compatibility
    });

    const result = await response.json();

    // Sempre invalida cache dopo logout (anche se richiesta fallisce)
    if (sessionCache) {
      sessionCache.isValid = false;
    }

    return { data: result, error: !response.ok };
  } catch (error) {
    console.error("Sign out error:", error);

    // Invalida cache anche in caso di errore
    if (sessionCache) {
      sessionCache.isValid = false;
    }

    return { data: null, error: true };
  }
};

export const signUp = async (data: { name: string; email: string; password: string }) => {
  try {
    const response = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return { data: await response.json(), error: !response.ok };
  } catch (error) {
    console.error("Sign up error:", error);
    return { data: null, error: true };
  }
};

export const forgetPassword = async (email: string) => {
  try {
    const response = await fetch('/api/auth/forget-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    return { data: await response.json(), error: !response.ok };
  } catch (error) {
    console.error("Forget password error:", error);
    return { data: null, error: true };
  }
};

export const resetPassword = async (token: string, password: string) => {
  try {
    const response = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });
    return { data: await response.json(), error: !response.ok };
  } catch (error) {
    console.error("Reset password error:", error);
    return { data: null, error: true };
  }
};

export const verifyEmail = async (token: string) => {
  try {
    const response = await fetch('/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    return { data: await response.json(), error: !response.ok };
  } catch (error) {
    console.error("Verify email error:", error);
    return { data: null, error: true };
  }
};

// Passkey functions - fallback to API calls
export const signInWithPasskey = async () => {
  try {
    const response = await fetch('/api/auth/passkey/authenticate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    return { data: await response.json(), error: !response.ok };
  } catch (error) {
    console.error("Passkey sign in error:", error);
    return { data: null, error: true };
  }
};

export const addPasskey = async () => {
  try {
    const response = await fetch('/api/auth/passkey/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    return { data: await response.json(), error: !response.ok };
  } catch (error) {
    console.error("Add passkey error:", error);
    return { data: null, error: true };
  }
};

// Magic Link function - local mode (no email provider needed)
export const sendMagicLink = async (email: string) => {
  try {
    // Call Better Auth magic link endpoint
    const baseURL = typeof window !== 'undefined' 
      ? window.location.origin 
      : (process.env.NEXTAUTH_URL || 'https://localhost:3000');
      
    const response = await fetch(`${baseURL}/api/auth/magic-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
      credentials: 'include'
    });
    
    if (response.ok) {
      const result = await response.json();
      return { 
        data: { 
          success: true, 
          message: "Magic link generated! Check browser console for the link.",
          showConsoleHint: true,
          ...result
        }, 
        error: false 
      };
    } else {
      const errorData = await response.json();
      return { data: errorData, error: true };
    }
  } catch (error) {
    console.error("Send magic link error:", error);
    return { 
      data: { 
        success: false, 
        message: "Failed to generate magic link" 
      }, 
      error: true 
    };
  }
};

// GitHub OAuth functions
export const signInWithGitHub = async (callbackURL?: string) => {
  try {
    const baseURL = typeof window !== 'undefined' 
      ? window.location.origin 
      : (process.env.NEXTAUTH_URL || 'https://localhost:3000');
      
    const response = await fetch(`${baseURL}/api/auth/sign-in/social`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        provider: 'github',
        callbackURL: callbackURL || '/'
      }),
      credentials: 'include'
    });
    
    if (response.ok) {
      const result = await response.json();
      // If there's a redirect URL, redirect the user
      if (result.url) {
        window.location.href = result.url;
      }
      return { data: result, error: false };
    } else {
      const errorData = await response.json();
      return { data: errorData, error: true };
    }
  } catch (error) {
    console.error("GitHub sign in error:", error);
    return { 
      data: { 
        success: false, 
        message: "Failed to sign in with GitHub" 
      }, 
      error: true 
    };
  }
};

export const linkGitHubAccount = async (callbackURL?: string) => {
  try {
    const baseURL = typeof window !== 'undefined' 
      ? window.location.origin 
      : (process.env.NEXTAUTH_URL || 'https://localhost:3000');
      
    const response = await fetch(`${baseURL}/api/auth/link-social`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        provider: 'github',
        callbackURL: callbackURL || '/'
      }),
      credentials: 'include'
    });
    
    if (response.ok) {
      const result = await response.json();
      // If there's a redirect URL, redirect the user
      if (result.url) {
        window.location.href = result.url;
      }
      return { data: result, error: false };
    } else {
      const errorData = await response.json();
      return { data: errorData, error: true };
    }
  } catch (error) {
    console.error("GitHub link account error:", error);
    return { 
      data: { 
        success: false, 
        message: "Failed to link GitHub account" 
      }, 
      error: true 
    };
  }
};

// Additional exports for compatibility
export const useSignIn = () => ({ mutate: signIn });
export const useSignUp = () => ({ mutate: signUp });

// Export the full client
