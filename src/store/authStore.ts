import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface UserPreferences {
  // Authentication preferences
  biometricEnabled: boolean;
  autoLogin: boolean;
  rememberDevice: boolean;

  // UI preferences
  theme: 'light' | 'dark' | 'system';
  language: string;
  timezone: string;

  // Security preferences
  sessionTimeout: number; // minutes
  twoFactorEnabled: boolean;
  emailNotifications: boolean;

  // App preferences
  defaultView: '2d' | '3d';
  gridVisible: boolean;
  snapToGrid: boolean;
}

export interface PasskeyInfo {
  id: string;
  credentialID: string;
  transports: string[];
  counter: number;
  deviceType: string;
  lastUsed?: string;
  nickname?: string;
}

export interface AuthSession {
  isActive: boolean;
  expiresAt: Date | null;
  lastActivity: Date | null;
  deviceInfo: {
    browser: string;
    os: string;
    isMobile: boolean;
  };
}

interface AuthState {
  // User state (synced from NextAuth)
  user: any | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  // Session management
  session: AuthSession | null;
  sessionCheckInterval: NodeJS.Timeout | null;

  // Passkey state
  passkeys: PasskeyInfo[];
  passkeySupported: boolean;
  passkeyLoading: boolean;

  // UI state
  showLoginModal: boolean;
  showPasskeySetup: boolean;
  loginError: string | null;
  passkeyError: string | null;

  // User preferences (persisted locally)
  preferences: UserPreferences;

  // Device and security
  deviceTrusted: boolean;
  lastLoginMethod: 'password' | 'passkey' | 'oauth' | null;

  // Actions - Session sync (called from AuthContext)
  syncSession: (session: any) => void;
  clearSession: () => void;
  updateLastActivity: () => void;

  // Actions - UI state
  setLoginModal: (show: boolean) => void;
  setPasskeySetup: (show: boolean) => void;
  setLoginError: (error: string | null) => void;
  setPasskeyError: (error: string | null) => void;

  // Actions - Preferences
  updatePreferences: (updates: Partial<UserPreferences>) => void;
  resetPreferences: () => void;

  // Actions - Passkey management
  loadPasskeys: () => Promise<void>;
  addPasskey: (passkey: PasskeyInfo) => void;
  removePasskey: (id: string) => Promise<void>;
  updatePasskeyNickname: (id: string, nickname: string) => Promise<void>;
  checkPasskeySupport: () => Promise<void>;

  // Actions - Security
  setDeviceTrusted: (trusted: boolean) => void;
  recordLoginMethod: (method: 'password' | 'passkey' | 'oauth') => void;

  // Actions - Session monitoring
  startSessionMonitoring: () => void;
  stopSessionMonitoring: () => void;

  // Utility getters
  getTimeUntilExpiry: () => number | null;
  isSessionExpiringSoon: () => boolean;
  shouldShowPasskeyPrompt: () => boolean;
}

const defaultPreferences: UserPreferences = {
  // Authentication
  biometricEnabled: true,
  autoLogin: false,
  rememberDevice: true,

  // UI
  theme: 'system',
  language: 'en',
  timezone: typeof window !== 'undefined'
    ? Intl.DateTimeFormat().resolvedOptions().timeZone
    : 'UTC',

  // Security
  sessionTimeout: 480, // 8 hours
  twoFactorEnabled: false,
  emailNotifications: true,

  // App
  defaultView: '3d',
  gridVisible: true,
  snapToGrid: true,
};

const detectDeviceInfo = () => {
  if (typeof window === 'undefined') {
    return { browser: 'unknown', os: 'unknown', isMobile: false };
  }

  const userAgent = navigator.userAgent;
  const isMobile = /Mobile|Android|iPhone|iPad/.test(userAgent);

  let browser = 'unknown';
  if (userAgent.includes('Chrome')) browser = 'Chrome';
  else if (userAgent.includes('Firefox')) browser = 'Firefox';
  else if (userAgent.includes('Safari')) browser = 'Safari';
  else if (userAgent.includes('Edge')) browser = 'Edge';

  let os = 'unknown';
  if (userAgent.includes('Windows')) os = 'Windows';
  else if (userAgent.includes('Mac')) os = 'macOS';
  else if (userAgent.includes('Linux')) os = 'Linux';
  else if (userAgent.includes('Android')) os = 'Android';
  else if (userAgent.includes('iOS')) os = 'iOS';

  return { browser, os, isMobile };
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      isAuthenticated: false,
      isLoading: false,

      session: null,
      sessionCheckInterval: null,

      passkeys: [],
      passkeySupported: false,
      passkeyLoading: false,

      showLoginModal: false,
      showPasskeySetup: false,
      loginError: null,
      passkeyError: null,

      preferences: defaultPreferences,

      deviceTrusted: false,
      lastLoginMethod: null,

      // Session sync
      syncSession: (session) => {
        const deviceInfo = detectDeviceInfo();

        set({
          user: session?.user || null,
          isAuthenticated: !!session?.user,
          isLoading: false,
          session: session ? {
            isActive: true,
            expiresAt: session.expires ? new Date(session.expires) : null,
            lastActivity: new Date(),
            deviceInfo
          } : null,
          loginError: null
        });

        // Start session monitoring if authenticated
        if (session?.user) {
          get().startSessionMonitoring();
        } else {
          get().stopSessionMonitoring();
        }
      },

      clearSession: () => {
        get().stopSessionMonitoring();
        set({
          user: null,
          isAuthenticated: false,
          session: null,
          showLoginModal: false,
          loginError: null,
          lastLoginMethod: null
        });
      },

      updateLastActivity: () => {
        const { session } = get();
        if (session) {
          set({
            session: {
              ...session,
              lastActivity: new Date()
            }
          });
        }
      },

      // UI actions
      setLoginModal: (show) => set({ showLoginModal: show }),
      setPasskeySetup: (show) => set({ showPasskeySetup: show }),
      setLoginError: (error) => set({ loginError: error }),
      setPasskeyError: (error) => set({ passkeyError: error }),

      // Preferences
      updatePreferences: (updates) => {
        set(state => ({
          preferences: { ...state.preferences, ...updates }
        }));
      },

      resetPreferences: () => set({ preferences: defaultPreferences }),

      // Passkey management
      loadPasskeys: async () => {
        set({ passkeyLoading: true, passkeyError: null });

        try {
          const response = await fetch(`${process.env.NEXTAUTH_URL}/api/auth/passkey/list`);
          if (response.ok) {
            const data = await response.json();
            const passkeys = data.passkeys?.map((p: any) => ({
              id: p.id,
              credentialID: p.credentialID,
              transports: p.transports || [],
              counter: p.counter,
              deviceType: getDeviceType(p.transports || []),
              lastUsed: p.lastUsed,
              nickname: p.nickname
            })) || [];

            set({ passkeys, passkeyLoading: false });
          } else {
            throw new Error('Failed to load passkeys');
          }
        } catch (error) {
          set({
            passkeyError: error instanceof Error ? error.message : 'Failed to load passkeys',
            passkeyLoading: false
          });
        }
      },

      addPasskey: (passkey) => {
        set(state => ({
          passkeys: [...state.passkeys, passkey]
        }));
      },

      removePasskey: async (id) => {
        try {
          const response = await fetch(`${process.env.NEXTAUTH_URL}/api/auth/passkey/delete`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ passkeyId: id })
          });

          if (response.ok) {
            set(state => ({
              passkeys: state.passkeys.filter(p => p.id !== id)
            }));
          } else {
            throw new Error('Failed to remove passkey');
          }
        } catch (error) {
          set({ passkeyError: error instanceof Error ? error.message : 'Failed to remove passkey' });
        }
      },

      updatePasskeyNickname: async (id, nickname) => {
        // Update locally first
        set(state => ({
          passkeys: state.passkeys.map(p =>
            p.id === id ? { ...p, nickname } : p
          )
        }));

        // Could add API call here if backend supports nicknames
      },

      checkPasskeySupport: async () => {
        if (typeof window !== 'undefined' && window.PublicKeyCredential) {
          try {
            const available = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
            set({ passkeySupported: available });
          } catch {
            set({ passkeySupported: false });
          }
        } else {
          set({ passkeySupported: false });
        }
      },

      // Security
      setDeviceTrusted: (trusted) => set({ deviceTrusted: trusted }),

      recordLoginMethod: (method) => set({ lastLoginMethod: method }),

      // Session monitoring
      startSessionMonitoring: () => {
        const { sessionCheckInterval } = get();
        if (sessionCheckInterval) return; // Already monitoring

        const interval = setInterval(() => {
          const { session, preferences } = get();
          if (!session?.isActive) return;

          const now = new Date();
          const lastActivity = session.lastActivity;

          if (lastActivity) {
            const minutesSinceActivity = (now.getTime() - lastActivity.getTime()) / (1000 * 60);

            if (minutesSinceActivity > preferences.sessionTimeout) {
              // Session expired due to inactivity
              get().clearSession();
              return;
            }
          }

          // Check if session expired
          if (session.expiresAt && now > session.expiresAt) {
            get().clearSession();
          }
        }, 60000); // Check every minute

        set({ sessionCheckInterval: interval });
      },

      stopSessionMonitoring: () => {
        const { sessionCheckInterval } = get();
        if (sessionCheckInterval) {
          clearInterval(sessionCheckInterval);
          set({ sessionCheckInterval: null });
        }
      },

      // Utility getters
      getTimeUntilExpiry: () => {
        const { session } = get();
        if (!session?.expiresAt) return null;

        const now = new Date();
        const expiry = session.expiresAt;
        return Math.max(0, expiry.getTime() - now.getTime());
      },

      isSessionExpiringSoon: () => {
        const timeUntilExpiry = get().getTimeUntilExpiry();
        if (!timeUntilExpiry) return false;

        // Consider session as expiring soon if less than 30 minutes
        return timeUntilExpiry < (30 * 60 * 1000);
      },

      shouldShowPasskeyPrompt: () => {
        const { passkeySupported, passkeys, preferences, lastLoginMethod } = get();
        return passkeySupported &&
          passkeys.length === 0 &&
          preferences.biometricEnabled &&
          lastLoginMethod === 'password';
      }
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        // Only persist non-sensitive data
        preferences: state.preferences,
        deviceTrusted: state.deviceTrusted,
        lastLoginMethod: state.lastLoginMethod,
        passkeySupported: state.passkeySupported
      })
    }
  )
);

// Helper function
const getDeviceType = (transports: string[]): string => {
  if (transports.includes('internal')) return 'Built-in authenticator';
  if (transports.includes('usb')) return 'USB Security Key';
  if (transports.includes('nfc')) return 'NFC Security Key';
  if (transports.includes('ble')) return 'Bluetooth Security Key';
  return 'Security Key';
};

// Convenience hooks
export const useAuthSession = () => {
  const store = useAuthStore();
  return {
    user: store.user,
    isAuthenticated: store.isAuthenticated,
    isLoading: store.isLoading,
    session: store.session,
    syncSession: store.syncSession,
    clearSession: store.clearSession,
    updateLastActivity: store.updateLastActivity
  };
};

export const useAuthUI = () => {
  const store = useAuthStore();
  return {
    showLoginModal: store.showLoginModal,
    showPasskeySetup: store.showPasskeySetup,
    loginError: store.loginError,
    passkeyError: store.passkeyError,
    setLoginModal: store.setLoginModal,
    setPasskeySetup: store.setPasskeySetup,
    setLoginError: store.setLoginError,
    setPasskeyError: store.setPasskeyError
  };
};

export const useAuthPreferences = () => {
  const store = useAuthStore();
  return {
    preferences: store.preferences,
    updatePreferences: store.updatePreferences,
    resetPreferences: store.resetPreferences
  };
};

export const useAuthPasskeys = () => {
  const store = useAuthStore();
  return {
    passkeys: store.passkeys,
    passkeySupported: store.passkeySupported,
    passkeyLoading: store.passkeyLoading,
    passkeyError: store.passkeyError,
    loadPasskeys: store.loadPasskeys,
    addPasskey: store.addPasskey,
    removePasskey: store.removePasskey,
    updatePasskeyNickname: store.updatePasskeyNickname,
    checkPasskeySupport: store.checkPasskeySupport,
    shouldShowPasskeyPrompt: store.shouldShowPasskeyPrompt
  };
};

export const useAuthSecurity = () => {
  const store = useAuthStore();
  return {
    deviceTrusted: store.deviceTrusted,
    lastLoginMethod: store.lastLoginMethod,
    setDeviceTrusted: store.setDeviceTrusted,
    recordLoginMethod: store.recordLoginMethod,
    getTimeUntilExpiry: store.getTimeUntilExpiry,
    isSessionExpiringSoon: store.isSessionExpiringSoon
  };
}; 