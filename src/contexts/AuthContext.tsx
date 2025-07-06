// src/contexts/AuthContext.tsx

import React, { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/router";
import {
  useSession,
  signIn,
  signOut,
  signInWithPasskey,
  addPasskey,
  forgetPassword,
  resetPassword,
  verifyEmail,
  sendMagicLink,
  signInWithGitHub,
  linkGitHubAccount
} from "@/src/lib/auth-client";
import { useAuthStore } from '@/src/store/authStore';
import { usePostLoginRedirect } from '@/src/hooks/useAuthRedirect';

type Role = "ADMIN" | "MANAGER" | "MEMBER" | "USER";

interface User {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  roles?: Role[];
  emailVerified?: boolean | null;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  authError: string | null;
  showOnboarding: boolean;
  hasRole: (role: Role | Role[]) => boolean;
  signIn: (credentials?: any) => Promise<any>;
  signInWithPasskey: () => Promise<void>;
  signInWithGitHub: (callbackURL?: string) => Promise<void>;
  linkGitHubAccount: (callbackURL?: string) => Promise<{ success: boolean; message: string }>;
  registerPasskey: () => Promise<{ success: boolean; message: string }>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<{ success: boolean; message: string }>;
  resetPassword: (token: string, password: string) => Promise<{ success: boolean; message: string }>;
  verifyEmail: (token: string) => Promise<{ success: boolean; message: string }>;
  sendMagicLink: (email: string) => Promise<{ success: boolean; message: string }>;
  refreshSession: () => Promise<any>;
  clearAuthError: () => void;
  completeOnboarding: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  // Enhanced Better Auth hooks con cache
  const { data: session, isPending, error, refresh, clear } = useSession();

  const [user, setUser] = useState<User | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  // Auth store integration
  const { syncSession, clearSession, recordLoginMethod, checkPasskeySupport } = useAuthStore();

  // Enhanced redirect hook
  const redirectAfterLogin = usePostLoginRedirect();

  // Enhanced session sync con error handling
  useEffect(() => {
    // Clear auth errors when session changes
    setAuthError(null);

    if (session?.user) {
      const userData = {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        image: session.user.image,
        emailVerified: session.user.emailVerified,
        roles: (session.user.roles as unknown as Role[]) || ["USER" as unknown as Role]
      };
      setUser(userData);

      // Sync with auth store
      syncSession(session);
    } else {
      setUser(null);
      clearSession();
    }
  }, [session, syncSession, clearSession]);

  // Handle session errors
  useEffect(() => {
    if (error) {
      setAuthError(error);
      console.warn('Session error:', error);
    }
  }, [error]);

  // Check passkey support on mount
  useEffect(() => {
    checkPasskeySupport();
  }, [checkPasskeySupport]);

  const hasRole = (role: Role | Role[]): boolean => {
    if (!user || !user.roles) return false;

    if (Array.isArray(role)) {
      return role.some(r => user.roles?.includes(r));
    }

    return user.roles.includes(role);
  };

  const handleSignIn = async (credentials?: any) => {
    try {
      setAuthError(null);

      const result = await signIn({
        email: credentials.email,
        password: credentials.password,
      });

      if (result.data && !result.error) {
        recordLoginMethod('password');

        // Refresh session per ottenere data aggiornati
        await refresh();

        // Smart redirect alla intended route
        await redirectAfterLogin();
      } else {
        setAuthError(result.data?.message || 'Login failed');
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Login error';
      setAuthError(errorMessage);
      console.error("Sign in error:", error);
      throw error;
    }
  };

  const handleSignInWithPasskey = async () => {
    try {
      setAuthError(null);

      const result = await signInWithPasskey();

      if (result?.data && !result.error) {
        recordLoginMethod('passkey');

        // Refresh session per ottenere data aggiornati
        await refresh();

        // Smart redirect alla intended route
        await redirectAfterLogin();
      } else {
        setAuthError(result?.data?.message || 'Passkey authentication failed');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Passkey authentication error';
      setAuthError(errorMessage);
      console.error("Passkey sign in error:", error);
      throw error;
    }
  };

  const handleSignOut = async () => {
    try {
      setAuthError(null);

      // Call server logout first
      await signOut();

      // Clear local session
      clear();

      // Log successful logout
      console.log('Logout successful');

      // Navigate to signin
      router.push("/auth/signin");
    } catch (error) {
      console.error("Logout error:", error);

      // Still clear local session and redirect even if server logout fails
      clear();
      router.push("/auth/signin");

      throw error;
    }
  };

  const requestPasswordReset = async (email: string): Promise<{ success: boolean; message: string }> => {
    try {
      const result = await forgetPassword(email);

      if (result?.data && !result.error) {
        return { success: true, message: "Password reset email sent" };
      } else {
        return { success: false, message: "Failed to send reset email" };
      }
    } catch (error) {
      console.error("Password reset request error:", error);
      return { success: false, message: "An unexpected error occurred" };
    }
  };

  const handleResetPassword = async (token: string, password: string): Promise<{ success: boolean; message: string }> => {
    try {
      const result = await resetPassword(token, password);

      if (result?.data && !result.error) {
        return { success: true, message: "Password updated successfully" };
      } else {
        return { success: false, message: "Failed to reset password" };
      }
    } catch (error) {
      console.error("Password reset error:", error);
      return { success: false, message: "An unexpected error occurred" };
    }
  };

  const registerPasskey = async (): Promise<{ success: boolean; message: string }> => {
    try {
      if (!user) {
        return { success: false, message: "You must be logged in to register a passkey" };
      }

      const result = await addPasskey();

      if (result?.data && !result.error) {
        return { success: true, message: "Passkey registered successfully!" };
      } else {
        return { success: false, message: "Failed to register passkey" };
      }
    } catch (error: any) {
      console.error("Passkey registration error:", error);
      return { success: false, message: error.message || "Failed to register passkey" };
    }
  };

  const handleVerifyEmail = async (token: string): Promise<{ success: boolean; message: string }> => {
    try {
      const result = await verifyEmail(token);

      if (result?.data && !result.error) {
        return { success: true, message: "Email verified successfully" };
      } else {
        return { success: false, message: "Failed to verify email" };
      }
    } catch (error) {
      console.error("Email verification error:", error);
      return { success: false, message: "An unexpected error occurred" };
    }
  };

  const handleSendMagicLink = async (email: string): Promise<{ success: boolean; message: string }> => {
    try {
      setAuthError(null);

      const result = await sendMagicLink(email);

      if (result?.data && !result.error) {
        return { success: true, message: "Magic link sent! Check your email." };
      } else {
        return { success: false, message: "Failed to send magic link" };
      }
    } catch (error) {
      console.error("Magic link send error:", error);
      return { success: false, message: "An unexpected error occurred" };
    }
  };

  const handleSignInWithGitHub = async (callbackURL?: string) => {
    try {
      setAuthError(null);

      const result = await signInWithGitHub(callbackURL);

      if (result?.data && !result.error) {
        recordLoginMethod('oauth');
        // The redirect will be handled by the OAuth flow
      } else {
        setAuthError(result?.data?.message || 'GitHub authentication failed');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'GitHub authentication error';
      setAuthError(errorMessage);
      console.error("GitHub sign in error:", error);
      throw error;
    }
  };

  const handleLinkGitHubAccount = async (callbackURL?: string): Promise<{ success: boolean; message: string }> => {
    try {
      setAuthError(null);

      if (!user) {
        return { success: false, message: "You must be logged in to link a GitHub account" };
      }

      const result = await linkGitHubAccount(callbackURL);

      if (result?.data && !result.error) {
        return { success: true, message: "GitHub account linked successfully!" };
      } else {
        return { success: false, message: result?.data?.message || "Failed to link GitHub account" };
      }
    } catch (error) {
      console.error("GitHub link account error:", error);
      return { success: false, message: "An unexpected error occurred" };
    }
  };

  // Clear auth error helper
  const clearAuthError = () => {
    setAuthError(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading: isPending,
        isAuthenticated: !!user,
        authError,
        hasRole,
        signIn: handleSignIn,
        signInWithPasskey: handleSignInWithPasskey,
        signInWithGitHub: handleSignInWithGitHub,
        linkGitHubAccount: handleLinkGitHubAccount,
        registerPasskey,
        signOut: handleSignOut,
        requestPasswordReset,
        resetPassword: handleResetPassword,
        verifyEmail: handleVerifyEmail,
        sendMagicLink: handleSendMagicLink,
        refreshSession: refresh,
        clearAuthError,
        showOnboarding: false, // Add default value
        completeOnboarding: () => { } // Add default function
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};