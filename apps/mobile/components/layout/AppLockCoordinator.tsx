import { useEffect, useRef, useState } from "react"
import { AppState, Modal, Text, View } from "react-native"
import { usePathname } from "expo-router"
import * as LocalAuthentication from "expo-local-authentication"
import { Lock } from "lucide-react-native"
import { useUIStore } from "@/lib/store"
import { useServer } from "@/lib/server"
import { useTheme } from "@/lib/theme"
import { PressableScale } from "@/components/ui/PressableScale"

/**
 * The Face ID lock — a full-screen overlay that appears when a paired app returns from the
 * background (opt-in, Settings). The unlock prompt is the system Face ID sheet; the overlay
 * behind it is a plain mark + "Unlock" so nothing sensitive is visible while locked.
 */
export function AppLockCoordinator() {
  const { config, booting } = useServer()
  const { palette } = useTheme()
  const security = useUIStore((state) => state.security)
  const pathname = usePathname()

  const [locked, setLocked] = useState(false)
  const [checking, setChecking] = useState(false)
  const initiallyLocked = useRef(false)
  const authenticating = useRef(false)
  const mounted = useRef(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  // Never lock before pairing or on the pair/boot screens.
  const skipLock = !config || booting || pathname === "/" || pathname === "/connect"

  useEffect(() => {
    if (!config || !security.biometricsEnabled) { initiallyLocked.current = false; setLocked(false) }
    else if (!skipLock && !initiallyLocked.current) { initiallyLocked.current = true; setLocked(true) }
  }, [config, skipLock, security.biometricsEnabled])

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") return
      if (state !== "background" && state !== "inactive") return
      if (skipLock) return
      const latest = useUIStore.getState()
      if (!latest.security.biometricsEnabled || !latest.security.lockOnBackground) return
      setLocked(true)
    })
    return () => subscription.remove()
  }, [skipLock])

  const unlock = async () => {
    if (authenticating.current) return
    authenticating.current = true
    setChecking(true)
    setError(null)
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock CADCAMFUN",
        fallbackLabel: "Use passcode",
      })
      if (mounted.current && result.success) setLocked(false)
    } catch {
      if (mounted.current) setError("Authentication is unavailable. Try again when the app is in the foreground.")
    } finally {
      authenticating.current = false
      if (mounted.current) setChecking(false)
    }
  }

  if (!locked || skipLock) return null

  return (
    <Modal visible transparent={false} animationType="none" presentationStyle="fullScreen" onRequestClose={() => undefined}>
    <View accessibilityViewIsModal style={{ flex: 1, backgroundColor: palette.background }}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 20 }}>
        <View style={{ width: 64, height: 64, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: `${palette.accent}14` }}>
          <Lock size={28} color={palette.accent} />
        </View>
        <PressableScale disabled={checking} onPress={() => void unlock()} subtle accessibilityRole="button" accessibilityLabel="Unlock CADCAMFUN">
          <View
            style={{
              paddingHorizontal: 28,
              paddingVertical: 12,
              borderRadius: 999,
              backgroundColor: palette.accent,
            }}
          >
            <Text style={{ color: palette.onAccent, fontSize: 17, fontWeight: "600" }}>{checking ? "Unlocking…" : "Unlock"}</Text>
          </View>
        </PressableScale>
        {error ? <Text style={{ color: palette.danger, textAlign: "center", paddingHorizontal: 24 }}>{error}</Text> : null}
      </View>
    </View>
    </Modal>
  )
}
