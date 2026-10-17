import { expect, test } from "bun:test"
import { DEFAULT_SECURITY, mergePersistedUI } from "../lib/ui-preferences"

const current = { themeMode: "system", haptics: { enabled: true, selection: true }, security: DEFAULT_SECURITY, assistantDefaults: { permissionMode: "approve" as const, includeContext: true } }

test("preferences saved by an older build keep the new defaults", () => {
  const merged = mergePersistedUI({ themeMode: "dark", haptics: { enabled: false }, security: { biometricsEnabled: true, lockOnBackground: false } }, current)
  expect(merged.themeMode).toBe("dark")
  expect(merged.haptics).toEqual({ enabled: false, selection: true })
  expect(merged.security).toEqual({ biometricsEnabled: true, lockOnBackground: false, lockAfterSeconds: 0, privacyCover: true })
  expect(merged.assistantDefaults).toEqual(current.assistantDefaults)
})

test("corrupt or missing storage falls back to the current state", () => {
  expect(mergePersistedUI(null, current)).toBe(current)
  expect(mergePersistedUI({ security: ["broken"] }, current).security).toEqual(DEFAULT_SECURITY)
})
