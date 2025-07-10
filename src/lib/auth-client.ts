// src/lib/auth-client.ts
import {
  createAuthClient,
  useSession as useBetterAuthSession,
} from "better-auth/react";
import { setupBetterAuthTauri } from "@daveyplate/better-auth-tauri";

// =================================================================
// ==              UNIFIED API URL RESOLUTION                     ==
// =================================================================
const getApiBaseUrl = (): string => {
  if (typeof window === "undefined") {
    return process.env.NEXTAUTH_URL || "http://localhost:3001";
  }
  const isDesktopEnv = window.navigator.userAgent.includes("Tauri") || window.location.protocol === "tauri:";
  if (isDesktopEnv) {
    return process.env.NODE_ENV === "production"
      ? process.env.NEXT_PUBLIC_API_URL || "https://cadcamfun.xyz"
      : "http://localhost:3001";
  }
  return window.location.origin;
};

const API_BASE_URL = getApiBaseUrl();
const isDesktop = typeof window !== 'undefined' && (window.navigator.userAgent.includes("Tauri") || window.location.protocol === "tauri:");

// =================================================================
// ==                 AUTH CLIENT SINGLETON                       ==
// =================================================================
export const authClient = createAuthClient({
  baseURL: API_BASE_URL,
});

// =================================================================
// ==           TAURI DESKTOP INITIALIZATION                    ==
// =================================================================
// This function must be called from _app.tsx to enable desktop OAuth
export const initializeTauriAuth = () => {
  if (isDesktop) {
    setupBetterAuthTauri({
      authClient,
      scheme: "cadcamfun",
      debugLogs: process.env.NODE_ENV === "development",
      onSuccess: async (callbackURL: any) => {
        console.log("Auth successful, refreshing session...");
        await authClient.getSession(true); // Force refresh
        window.location.href = callbackURL || "/";
      },
      onError: (error: any) => {
        console.error("Tauri Auth error:", error.message);
        window.location.href = `/auth/signin?error=${encodeURIComponent(error.message)}`;
      },
    });
  }
};

// =================================================================
// ==        UNIFIED AUTH FUNCTIONS & HOOKS EXPORTS               ==
// =================================================================
// This section provides a clean, consistent API for the rest of the app (e.g., AuthContext)

export const useSession = useBetterAuthSession;

export const signIn = (credentials: any) => {
  return authClient.signIn({
    provider: "credentials",
    data: credentials,
  });
};

export const signOut = () => {
  return authClient.signOut();
};

export const signUp = (data: any) => {
  return authClient.signUp({
    provider: "credentials",
    data: data,
  });
};

export const signInWithGitHub = (callbackURL?: string) => {
  return authClient.signIn({
    provider: "github",
    callbackURL: callbackURL || "/",
  });
};

export const linkGitHubAccount = (callbackURL?: string) => {
  return authClient.linkAccount({
    provider: "github",
    callbackURL: callbackURL || "/",
  });
};

export const signInWithPasskey = () => {
  return authClient.signIn({ provider: "passkey" });
};

export const addPasskey = () => {
  return authClient.linkAccount({ provider: "passkey" });
};

export const sendMagicLink = (email: string) => {
  return authClient.signIn({
    provider: "magiclink",
    data: { email },
  });
};

export const forgetPassword = async (email: string) => {
  // better-auth doesn't have a built-in forgetPassword client helper,
  // so we call the API endpoint directly.
  const res = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  return res.json();
};

export const resetPassword = async (token: string, password: string) => {
  const res = await fetch(`${API_BASE_URL}/api/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password }),
  });
  return res.json();
};

export const verifyEmail = async (token: string) => {
  // This is typically handled by the user clicking a link,
  // which is processed server-side. A client-side helper might not be needed
  // unless you want to trigger it manually.
  const res = await fetch(`${API_BASE_URL}/api/auth/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  return res.json();
};
