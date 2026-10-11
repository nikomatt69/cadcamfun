import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import AsyncStorage from "@react-native-async-storage/async-storage"

/**
 * UI preferences, persisted locally. Not the pairing — that lives in the Keychain.
 * Theme mode, haptics toggles and the optional Face ID lock are phone-side choices.
 */
export interface UIState {
  themeMode: "system" | "light" | "dark"
  haptics: {
    enabled: boolean
    selection: boolean
    success: boolean
    errors: boolean
  }
  security: {
    biometricsEnabled: boolean
    lockOnBackground: boolean
  }
  /** Chat IDs belong to one paired desktop, independently of credential rotation. */
  assistantDesktopId: string | null
  /** The project selected from the project screen or assistant picker. */
  assistantProjectId: string | null
  /** Last chat session per project — resuming it continues the same desktop conversation. */
  assistantSessions: Record<string, string>
  /** Queued assistant prompts waiting for the desktop to come back (SecureStore-backed). */
  offlineQueueCount: number
  offlineQueueRevision: number
  setThemeMode: (mode: UIState["themeMode"]) => void
  setHaptics: (patch: Partial<UIState["haptics"]>) => void
  setSecurity: (patch: Partial<UIState["security"]>) => void
  setAssistantDesktop: (desktopId: string | null) => void
  setAssistantProject: (projectId: string | null) => void
  setAssistantSession: (projectId: string, sessionId: string) => void
  setOfflineQueue: (count: number) => void
  showToast: (message: string, kind?: "info" | "success" | "error") => void
}

let finishHydration: () => void = () => undefined
export const uiPreferencesReady = new Promise<void>((resolve) => { finishHydration = resolve })

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      themeMode: "system",
      haptics: { enabled: true, selection: true, success: true, errors: true },
      security: { biometricsEnabled: false, lockOnBackground: true },
      assistantDesktopId: null,
      assistantProjectId: null,
      assistantSessions: {},
      offlineQueueCount: 0,
      offlineQueueRevision: 0,
      setThemeMode: (themeMode) => set({ themeMode }),
      setHaptics: (patch) => set((s) => ({ haptics: { ...s.haptics, ...patch } })),
      setSecurity: (patch) => set((s) => ({ security: { ...s.security, ...patch } })),
      setAssistantDesktop: (assistantDesktopId) => set((state) => state.assistantDesktopId === assistantDesktopId ? {} : { assistantDesktopId, assistantProjectId: null, assistantSessions: {} }),
      setAssistantProject: (assistantProjectId) => set({ assistantProjectId }),
      setAssistantSession: (projectId, sessionId) =>
        set((s) => ({ assistantSessions: { ...s.assistantSessions, [projectId]: sessionId } })),
      setOfflineQueue: (offlineQueueCount) =>
        set((s) => ({ offlineQueueCount, offlineQueueRevision: s.offlineQueueRevision + 1 })),
      showToast: (message, kind = "info") => {
        // ToastHost owns rendering; lazy-require avoids a store→component import cycle.
        void import("@/components/ui/ToastHost").then(({ toast }) => toast(message, kind)).catch(() => undefined)
      },
    }),
    {
      name: "cadcamfun.ui.v1",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        themeMode: state.themeMode,
        haptics: state.haptics,
        security: state.security,
        assistantDesktopId: state.assistantDesktopId,
        assistantProjectId: state.assistantProjectId,
        assistantSessions: state.assistantSessions,
      }),
      onRehydrateStorage: () => () => finishHydration(),
    },
  ),
)
