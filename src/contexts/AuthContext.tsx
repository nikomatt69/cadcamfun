// src/contexts/AuthContext.tsx
import React, { createContext, useContext, ReactNode, useCallback, useMemo } from "react";
import { useRouter } from "next/router";
import {
  useSession,
  signIn,
  signUp,
  signOut,
  useTauriAuth,
  addPasskey,
  signInWithPasskey,

  sendMagicLink,
  verifyMagicLink,
  enableTwoFactor,
  disableTwoFactor,
  verifyTotp,
  sendTwoFactorOtp,
  verifyTwoFactorOtp,
  generateBackupCodes,
} from "@/src/lib/auth-client";

// Tipi estesi con plugin
interface AuthContextType {
  // Session data direttamente da Better Auth
  session: any;
  user: any;
  isLoading: boolean;
  isAuthenticated: boolean;

  // Metodi di autenticazione base
  handleSignIn: (email: string, password: string) => Promise<void>;
  handleSignUp: (name: string, email: string, password: string) => Promise<void>;
  handleSignOut: () => Promise<void>;

  // Social auth
  signInWithGitHub: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;

  // 🔐 Passkey functions
  handleSignInWithPasskey: () => Promise<void>;

  // 🔗 Magic Link functions
  handleSendMagicLink: (email: string, callbackURL?: string) => Promise<any>;
  handleVerifyMagicLink: (token: string) => Promise<any>;

  // 🛡️ Two-Factor functions (aligned with page usage)
  handleEnable2FA: () => Promise<any>;
  handleDisable2FA: () => Promise<any>;
  handleVerifyTOTP: (code: string) => Promise<any>;
  handleSendOTP: () => Promise<any>;
  handleVerifyOTP: (code: string) => Promise<any>;
  handleGenerateBackupCodes: () => Promise<any>;
  handleGet2FAStatus: () => Promise<any>;

  // Password reset (aligned with page usage)
  handleForgotPassword: (email: string, callbackURL?: string) => Promise<any>;
  handleResetPassword: (token: string, newPassword: string) => Promise<any>;

  // Email verification (aligned with page usage)
  handleSendEmailVerification: (email: string, callbackURL?: string) => Promise<any>;
  handleVerifyEmail: (token: string, callbackURL?: string) => Promise<any>;

  // Passkey management (additional functions needed)
  handleListPasskeys: () => Promise<any>;
  handleDeletePasskey: (id: string) => Promise<any>;
  handleAddPasskey: (name: string) => Promise<any>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { data: session, isPending: isLoading } = useSession();

  // Inizializza Tauri auth se necessario
  useTauriAuth();

  // ================================
  // METODI AUTENTICAZIONE BASE
  // ================================

  const handleSignIn = useCallback(async (email: string, password: string) => {
    await signIn.email({ email, password });
    router.push('/');
  }, [router]);

  const handleSignUp = useCallback(async (name: string, email: string, password: string) => {
    await signUp.email({ name, email, password });
    router.push('/');
  }, [router]);

  const handleSignOut = useCallback(async () => {
    await signOut();
    router.push('/auth/signin');
  }, [router]);

  const signInWithGitHub = useCallback(async () => {
    await signIn.social({
      provider: "github",
      callbackURL: "/",
    });
  }, []);

  const signInWithGoogle = useCallback(async () => {
    await signIn.social({
      provider: "google",
      callbackURL: "/",
    });
  }, []);

  // ================================
  // 🔐 PASSKEY FUNCTIONS
  // ================================

  const handleAddPasskey = useCallback(async (name: string) => {
    if (!addPasskey) throw new Error("Passkey not available");
    return await addPasskey(name);
  }, []);

  const handleSignInWithPasskey = useCallback(async () => {
    if (!signInWithPasskey) throw new Error("Passkey not available");
    await signInWithPasskey();
    router.push('/');
  }, [router]);

  const handleListPasskeys = useCallback(async () => {
    const response = await fetch('/api/auth/list-passkeys', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Failed to list passkeys');
    }

    return await response.json();
  }, []);

  const handleDeletePasskey = useCallback(async (id: string) => {
    const response = await fetch('/api/auth/delete-passkey', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Failed to delete passkey');
    }

    return await response.json();
  }, []);

  // ================================
  // 🔗 MAGIC LINK FUNCTIONS
  // ================================

  const handleSendMagicLink = useCallback(async (email: string, callbackURL = "/") => {
    if (!sendMagicLink) throw new Error("Magic link not available");
    return await sendMagicLink(email, callbackURL);
  }, []);

  const handleVerifyMagicLink = useCallback(async (token: string) => {
    if (!verifyMagicLink) throw new Error("Magic link not available");
    return await verifyMagicLink(token);
  }, []);

  // ================================
  // 🛡️ TWO-FACTOR FUNCTIONS
  // ================================

  const handleEnable2FA = useCallback(async () => {
    if (!enableTwoFactor) throw new Error("Two-factor not available");
    const result = await enableTwoFactor();
    return result;
  }, []);

  const handleDisable2FA = useCallback(async () => {
    if (!disableTwoFactor) throw new Error("Two-factor not available");
    return await disableTwoFactor();
  }, []);

  const handleVerifyTOTP = useCallback(async (code: string) => {
    if (!verifyTotp) throw new Error("Two-factor not available");
    const result = await verifyTotp(code);
    // After verification, the session is updated, and we can redirect.
    router.push('/');
    return result;
  }, [router]);

  const handleSendOTP = useCallback(async () => {
    if (!sendTwoFactorOtp) throw new Error("Two-factor not available");
    return await sendTwoFactorOtp();
  }, []);

  const handleVerifyOTP = useCallback(async (code: string) => {
    if (!verifyTwoFactorOtp) throw new Error("Two-factor not available");
    const result = await verifyTwoFactorOtp(code);
    // After verification, the session is updated, and we can redirect.
    router.push('/');
    return result;
  }, [router]);

  const handleGenerateBackupCodes = useCallback(async () => {
    if (!generateBackupCodes) throw new Error("Two-factor not available");
    return await generateBackupCodes();
  }, []);

  const handleGet2FAStatus = useCallback(async () => {
    if (!session?.user) return { enabled: false };
    // Better Auth include 2FA status nella sessione quando attivo
    return { enabled: !!(session as any).twoFactorVerified || false };
  }, [session]);

  // ================================
  // PASSWORD RESET & EMAIL VERIFICATION
  // ================================

  // ================================
  // PASSWORD RESET FUNCTIONS (production-ready)
  // ================================

  const handleForgotPassword = useCallback(async (email: string, callbackURL = "/auth/reset-password") => {
    const response = await fetch('/api/auth/forget-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        redirectTo: `${window.location.origin}${callbackURL}`
      })
    });

    if (!response.ok) {
      throw new Error('Failed to send password reset email');
    }

    return await response.json();
  }, []);

  const handleResetPassword = useCallback(async (token: string, newPassword: string) => {
    const response = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword })
    });

    if (!response.ok) {
      throw new Error('Failed to reset password');
    }

    const result = await response.json();
    if (result.session) {
      router.push('/');
    }

    return result;
  }, [router]);

  // ================================
  // EMAIL VERIFICATION FUNCTIONS (production-ready)
  // ================================

  const handleSendEmailVerification = useCallback(async (email: string, callbackURL = "/auth/verify-email") => {
    const response = await fetch('/api/auth/send-verification-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        callbackURL: `${window.location.origin}${callbackURL}`
      })
    });

    if (!response.ok) {
      throw new Error('Failed to send verification email');
    }

    return await response.json();
  }, []);

  const handleVerifyEmail = useCallback(async (token: string, callbackURL = "/") => {
    const response = await fetch('/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });

    if (!response.ok) {
      throw new Error('Failed to verify email');
    }

    const result = await response.json();
    if (result.session) {
      router.push(callbackURL);
    }

    return result;
  }, [router]);

  // ================================
  // CONTEXT VALUE
  // ================================

  const value: AuthContextType = useMemo(() => ({
    session,
    user: session?.user,
    isLoading,
    isAuthenticated: !!session?.user,

    // Base auth
    handleSignIn,
    handleSignUp,
    handleSignOut,
    signInWithGitHub,
    signInWithGoogle,

    // Passkey
    handleAddPasskey,
    handleSignInWithPasskey,
    handleListPasskeys,
    handleDeletePasskey,

    // Magic Link
    handleSendMagicLink,
    handleVerifyMagicLink,

    // Two-Factor (aligned with page usage)
    handleEnable2FA,
    handleDisable2FA,
    handleVerifyTOTP,
    handleSendOTP,
    handleVerifyOTP,
    handleGenerateBackupCodes,
    handleGet2FAStatus,

    // Password & Email (aligned with page usage)
    handleForgotPassword,
    handleResetPassword,
    handleSendEmailVerification,
    handleVerifyEmail,
  }), [
    session,
    isLoading,
    handleSignIn,
    handleSignUp,
    handleSignOut,
    signInWithGitHub,
    signInWithGoogle,
    handleAddPasskey,
    handleSignInWithPasskey,
    handleListPasskeys,
    handleDeletePasskey,
    handleSendMagicLink,
    handleVerifyMagicLink,
    handleEnable2FA,
    handleDisable2FA,
    handleVerifyTOTP,
    handleSendOTP,
    handleVerifyOTP,
    handleGenerateBackupCodes,
    handleGet2FAStatus,
    handleForgotPassword,
    handleResetPassword,
    handleSendEmailVerification,
    handleVerifyEmail,
  ]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
