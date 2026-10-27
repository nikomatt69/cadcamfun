import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import type { AssistantDefaults, AssistantPreferences } from "./assistant-preferences"
import { DEFAULT_ASSISTANT_DEFAULTS, resolveAssistantPreferences } from "./assistant-preferences"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { DEFAULT_SECURITY, mergePersistedUI, type SecurityPreferences } from "./ui-preferences"

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
  security: SecurityPreferences
  assistantDefaults: AssistantDefaults
  /** Chat IDs belong to one paired desktop, independently of credential rotation. */
  assistantDesktopId: string | null
  /** The project selected from the project screen or assistant picker. */
  assistantProjectId: string | null
  /** Last chat session per project — resuming it continues the same desktop conversation. */
  assistantSessions: Record<string, string>
  assistantPreferences: Record<string, AssistantPreferences>
  /** Last thinking level per provider-qualified model key, across projects. */
  assistantModelVariants: Record<string, string>
  /** Queued assistant prompts waiting for the desktop to come back (SecureStore-backed). */
  offlineQueueCount: number
  offlineQueueRevision: number
  /** Unread updates on the desktop; the Activity tab shows it as a badge. */
  unreadCount: number
  /**
   * One-shot prompt handed off from a workspace preview. Not persisted: the composer
   * fills it so the user can confirm before anything is sent.
   */
  assistantDraft: AssistantDraft | null
  /**
   * The conversation the user opened from the conversation list. Not persisted: the assistant reads
   * its stored history once, so a reopened conversation shows the desktop's own past.
   */
  assistantOpened: AssistantOpened | null
  /** A conversation fills the assistant: the tab bar steps aside, like a pushed screen. Not persisted. */
  tabBarHidden: boolean
  setThemeMode: (mode: UIState["themeMode"]) => void
  setHaptics: (patch: Partial<UIState["haptics"]>) => void
  setSecurity: (patch: Partial<UIState["security"]>) => void
  setAssistantDesktop: (desktopId: string | null) => void
  setAssistantProject: (projectId: string | null) => void
  /** Drops the assistant's project, conversations and preferences for projects that are no longer in the desktop's list. */
  forgetMissingProjects: (existingIds: readonly string[]) => void
  setAssistantSession: (projectId: string, sessionId: string) => void
  setAssistantPreferences: (projectId: string, preferences: Partial<AssistantPreferences>) => void
  setAssistantDefaults: (patch: Partial<AssistantDefaults>) => void
  rememberModelVariant: (modelKey: string, variant: string | undefined) => void
  startAssistantConversation: (projectId: string) => void
  setAssistantDraft: (draft: AssistantDraft) => void
  clearAssistantDraft: () => void
  openAssistantConversation: (projectId: string, sessionId: string | null) => void
  setOfflineQueue: (count: number) => void
  setUnreadCount: (count: number) => void
  setTabBarHidden: (hidden: boolean) => void
  showToast: (message: string, kind?: "info" | "success" | "error") => void
}

export type AssistantDraftMode = "general" | "cad" | "cam" | "gcode" | "toolpath"

export interface AssistantDraft {
  readonly projectId: string
  readonly text: string
  readonly mode: AssistantDraftMode
}

export interface AssistantOpened {
  readonly projectId: string
  /** `null` starts a fresh conversation instead of opening a stored one. */
  readonly sessionId: string | null
  /** Changes on every open, so opening the same conversation twice still reloads it. */
  readonly token: number
}

let finishHydration: () => void = () => undefined
export const uiPreferencesReady = new Promise<void>((resolve) => { finishHydration = resolve })

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      themeMode: "system",
      haptics: { enabled: true, selection: true, success: true, errors: true },
      security: DEFAULT_SECURITY,
      assistantDefaults: DEFAULT_ASSISTANT_DEFAULTS,
      assistantDesktopId: null,
      assistantProjectId: null,
      assistantSessions: {},
      assistantPreferences: {},
      assistantModelVariants: {},
      offlineQueueCount: 0,
      offlineQueueRevision: 0,
      unreadCount: 0,
      assistantDraft: null,
      assistantOpened: null,
      tabBarHidden: false,
      setThemeMode: (themeMode) => set({ themeMode }),
      setHaptics: (patch) => set((s) => ({ haptics: { ...s.haptics, ...patch } })),
      setSecurity: (patch) => set((s) => ({ security: { ...s.security, ...patch } })),
      setAssistantDesktop: (assistantDesktopId) => set((state) => state.assistantDesktopId === assistantDesktopId || (assistantDesktopId !== null && state.assistantDesktopId?.endsWith(`|${assistantDesktopId}`)) ? { assistantDesktopId } : { assistantDesktopId, assistantProjectId: null, assistantSessions: {}, assistantPreferences: {} }),
      setAssistantProject: (assistantProjectId) => set({ assistantProjectId }),
      forgetMissingProjects: (existingIds) => set((state) => {
        const keep = new Set(existingIds)
        const only = <V,>(record: Record<string, V>) => Object.fromEntries(Object.entries(record).filter(([id]) => keep.has(id)))
        const missing = state.assistantProjectId !== null && !keep.has(state.assistantProjectId)
        if (!missing && Object.keys(state.assistantSessions).every((id) => keep.has(id)) && Object.keys(state.assistantPreferences).every((id) => keep.has(id))) return state
        return { assistantProjectId: missing ? null : state.assistantProjectId, assistantSessions: only(state.assistantSessions), assistantPreferences: only(state.assistantPreferences) }
      }),
      setAssistantSession: (projectId, sessionId) =>
        set((s) => ({ assistantSessions: { ...s.assistantSessions, [projectId]: sessionId } })),
      setAssistantPreferences: (projectId, preferences) => set((state) => ({ assistantPreferences: { ...state.assistantPreferences, [projectId]: { ...resolveAssistantPreferences(state.assistantPreferences[projectId], state.assistantDefaults), ...preferences } } })),
      setAssistantDefaults: (patch) => set((state) => ({ assistantDefaults: { ...state.assistantDefaults, ...patch } })),
      rememberModelVariant: (modelKey, variant) => set((state) => {
        const { [modelKey]: _previous, ...rest } = state.assistantModelVariants
        return { assistantModelVariants: variant ? { ...rest, [modelKey]: variant } : rest }
      }),
      startAssistantConversation: (projectId) => set((state) => ({ assistantSessions: Object.fromEntries(Object.entries(state.assistantSessions).filter(([id]) => id !== projectId)) })),
      setAssistantDraft: (assistantDraft) => set({ assistantDraft, assistantProjectId: assistantDraft.projectId }),
      clearAssistantDraft: () => set({ assistantDraft: null }),
      openAssistantConversation: (projectId, sessionId) =>
        set((state) => ({ assistantOpened: { projectId, sessionId, token: (state.assistantOpened?.token ?? 0) + 1 } })),
      setOfflineQueue: (offlineQueueCount) =>
        set((s) => ({ offlineQueueCount, offlineQueueRevision: s.offlineQueueRevision + 1 })),
      setUnreadCount: (unreadCount) => set((s) => (s.unreadCount === unreadCount ? s : { unreadCount })),
      setTabBarHidden: (tabBarHidden) => set((s) => (s.tabBarHidden === tabBarHidden ? s : { tabBarHidden })),
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
        assistantDefaults: state.assistantDefaults,
        assistantDesktopId: state.assistantDesktopId,
        assistantProjectId: state.assistantProjectId,
        assistantSessions: state.assistantSessions,
        assistantPreferences: state.assistantPreferences,
        assistantModelVariants: state.assistantModelVariants,
      }),
      // Nested preference objects saved by an older build lack newer keys: keep their defaults.
      merge: (persisted, current) => mergePersistedUI(persisted, current),
      onRehydrateStorage: () => () => finishHydration(),
    },
  ),
)
