import type { AssistantDefaults } from "./assistant-preferences"

/** Phone-side security choices (Settings → Privacy & security). */
export interface SecurityPreferences {
  biometricsEnabled: boolean
  lockOnBackground: boolean
  /** Grace period before the lock engages after leaving the app; 0 = immediately. */
  lockAfterSeconds: number
  /** Cover the app in the app switcher, even when the lock is off. */
  privacyCover: boolean
}

export const DEFAULT_SECURITY: SecurityPreferences = { biometricsEnabled: false, lockOnBackground: true, lockAfterSeconds: 0, privacyCover: true }

interface NestedPreferences {
  haptics: object
  security: SecurityPreferences
  assistantDefaults: AssistantDefaults
}

const plainObject = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}

/**
 * Rehydration merge: nested preference objects saved by an older build lack newer keys, and a
 * shallow merge would drop their defaults (an undefined `lockAfterSeconds`, a missing toggle).
 */
export function mergePersistedUI<T extends NestedPreferences>(persisted: unknown, current: T): T {
  if (!persisted || typeof persisted !== "object") return current
  const saved = persisted as Partial<Record<keyof T, unknown>>
  return {
    ...current,
    ...saved,
    haptics: { ...current.haptics, ...plainObject(saved.haptics) },
    security: { ...current.security, ...plainObject(saved.security) },
    assistantDefaults: { ...current.assistantDefaults, ...plainObject(saved.assistantDefaults) },
  }
}
