// src/lib/auth-client.ts - JWT-based auth client
import { useState, useEffect } from 'react';

// Determina se siamo in Tauri
const isTauri = typeof window !== "undefined" && (window as any).__TAURI__;

// Determina la base URL in base all'ambiente
const getBaseURL = () => {
  // Server-side
  if (typeof window === "undefined") {
    return process.env.NEXTAUTH_URL || "http://localhost:3001";
  }

  // Client-side - controlla se siamo in Tauri
  if (isTauri) {
    // Tauri desktop app
    return process.env.NODE_ENV === "production"
      ? "https://cadcamfun.xyz"
      : "http://localhost:3001";
  }

  // Web browser
  return "";
};

// Utility per fetch con cookie automatici
export const authFetch = async (url: string, options: RequestInit = {}) => {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  return fetch(`${getBaseURL()}${url}`, {
    ...options,
    headers,
    credentials: 'include',
  });
};

// Tipi per session
export interface User {
  id: string;
  email: string;
  name: string;
  emailVerified?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Session {
  user: User;
  expires: string;
  sessionToken?: string;
}

export interface SessionData {
  session: Session | null;
}

// Hook useSession personalizzato
export const useSession = () => {
  const [data, setData] = useState<Session | null>(null);
  const [isPending, setIsPending] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSession = async () => {
    try {
      setIsPending(true);
      setError(null);

      const response = await authFetch('/api/auth/get-session');

      if (response.ok) {
        const sessionData: SessionData = await response.json();
        setData(sessionData.session);
      } else if (response.status === 401) {
        // No session - questo è normale
        setData(null);
      } else {
        throw new Error(`Session check failed: ${response.status}`);
      }
    } catch (err) {
      console.error('Session fetch error:', err);
      setError(err instanceof Error ? err.message : 'Session check failed');
      setData(null);
    } finally {
      setIsPending(false);
    }
  };

  useEffect(() => {
    fetchSession();
  }, []);

  return {
    data,
    isPending,
    error,
    refetch: fetchSession,
  };
};

// Funzioni di autenticazione

// SignIn con email/password
export const signIn = {
  email: async ({ email, password }: { email: string; password: string }) => {
    const response = await authFetch('/api/auth/signin-direct', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.details || error.error || 'Login failed');
    }

    return response.json();
  },

  // Social logins placeholder
  social: async ({ provider, callbackURL }: { provider: string; callbackURL?: string }) => {
    // TODO: implementare social login quando necessario
    throw new Error(`Social login with ${provider} not yet implemented`);
  },
};

// SignUp con email/password/name
export const signUp = {
  email: async ({ email, password, name, confirmPassword }: {
    email: string;
    password: string;
    name: string;
    confirmPassword?: string;
  }) => {
    const response = await authFetch('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        name,
        confirmPassword: confirmPassword || password
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.details || error.error || 'Signup failed');
    }

    return response.json();
  },
};

// SignOut
export const signOut = async () => {
  const response = await authFetch('/api/auth/signout', {
    method: 'POST',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.details || error.error || 'Signout failed');
  }

  // Forza refresh della pagina per pulire stato
  if (typeof window !== 'undefined') {
    window.location.reload();
  }

  return response.json();
};

// Magic Link functions
export const sendMagicLink = async (email: string, callbackURL?: string) => {
  const response = await authFetch('/api/auth/send-magic-link', {
    method: 'POST',
    body: JSON.stringify({ email, callbackURL }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.details || error.error || 'Magic link send failed');
  }

  return response.json();
};

export const verifyMagicLink = async (token: string) => {
  const response = await fetch('/api/auth/verify-magic-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
    credentials: 'include'
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || data.details || 'Failed to verify magic link');
  }

  return data;
};

// Password Reset functions
export const forgetPassword = async (email: string, callbackURL?: string) => {
  const response = await authFetch('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email, callbackURL }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.details || error.error || 'Password reset request failed');
  }

  return response.json();
};

export const resetPassword = async (token: string, newPassword: string, confirmPassword: string) => {
  const response = await authFetch('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword, confirmPassword }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.details || error.error || 'Password reset failed');
  }

  return response.json();
};

// Passkey functions (placeholder)
export const addPasskey = async (name: string) => {
  const response = await authFetch('/api/auth/passkey-register', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.details || error.error || 'Passkey registration failed');
  }

  return response.json();
};

export const signInWithPasskey = async () => {
  throw new Error('Passkey signin not yet implemented');
};

// Two-Factor functions (placeholder per compatibilità)
export const enableTwoFactor = async () => {
  throw new Error('Two-factor authentication not yet implemented');
};

export const disableTwoFactor = async () => {
  throw new Error('Two-factor authentication not yet implemented');
};

export const verifyTotp = async (code: string) => {
  throw new Error('TOTP verification not yet implemented');
};

export const sendTwoFactorOtp = async () => {
  throw new Error('Two-factor OTP not yet implemented');
};

export const verifyTwoFactorOtp = async (code: string) => {
  throw new Error('Two-factor OTP verification not yet implemented');
};

export const generateBackupCodes = async () => {
  throw new Error('Backup codes not yet implemented');
};

export const verifyBackupCode = async (code: string) => {
  throw new Error('Backup code verification not yet implemented');
};

// Email verification (placeholder)
export const sendVerificationEmail = async (email: string, callbackURL?: string) => {
  const response = await fetch('/api/auth/send-verification-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, callbackURL }),
    credentials: 'include'
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || data.details || 'Failed to send verification email');
  }

  return data;
};

export const verifyEmail = async (token: string) => {
  const response = await fetch('/api/auth/verify-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
    credentials: 'include'
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || data.details || 'Failed to verify email');
  }

  return data;
};

// Hook per inizializzare Tauri auth (mantenuto per compatibilità)
export const useTauriAuth = () => {
  if (isTauri && typeof window !== "undefined") {
    // Listen per deep links OAuth in Tauri
    const setupTauriCallbacks = async () => {
      try {
        const { listen } = (window as any).__TAURI__.event;

        // Ascolta callback OAuth
        await listen('oauth-callback', (event: any) => {
          const { url } = event.payload;

          if (url.includes('/api/auth/callback')) {
            // Forza refresh della sessione
            window.location.reload();
          }
        });
      } catch (error) {
        console.error('Failed to setup Tauri auth callbacks:', error);
      }
    };

    setupTauriCallbacks();
  }
};

// AuthClient mock per compatibilità con Better Auth
export const authClient = {
  useSession,
  signIn,
  signUp,
  signOut,
  getSession: async () => {
    const response = await authFetch('/api/auth/get-session');
    if (response.ok) {
      const data: SessionData = await response.json();
      return data.session;
    }
    return null;
  },
};

// Type helper
export type $Infer = any;
