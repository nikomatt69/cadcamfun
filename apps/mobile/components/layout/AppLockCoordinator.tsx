import { useCallback, useEffect, useRef, useState } from "react"
import { AppState, Modal, StyleSheet, Text, View } from "react-native"
import { usePathname, useRouter } from "expo-router"
import * as LocalAuthentication from "expo-local-authentication"
import { Lock } from "lucide-react-native"
import { useUIStore } from "@/lib/store"
import { useServer } from "@/lib/server"
import { hexToRgba, useTheme } from "@/lib/theme"
import { type } from "@/lib/typography"
import { biometricLabel, getBiometricCapability, type BiometricLabel } from "@/lib/biometrics"
import { coverWhenInactive, lockOnResume, lockWhenBackgrounded, unlockFailureMessage } from "@/lib/app-lock"
import { haptic } from "@/lib/haptics"
import { ActionButton } from "@/components/ui/ActionButton"
import { PageScroll } from "./page-scroll"
import { BrandMark } from "./BrandMark"
import { SafeAreaView } from "react-native-safe-area-context"

/**
 * The Face ID lock (nikcli: AppLockOverlay) — a full-screen overlay when a paired app returns from
 * the background after the chosen grace period (opt-in, Settings). The system Face ID sheet opens by
 * itself once per lock; the overlay behind it is a plain mark so nothing sensitive is visible.
 *
 * Independently of the lock, the privacy cover hides the app while iOS shows the app switcher. Both are native
 * full-screen modals: a plain overlay view would sit under an open sheet or the full-screen 3D viewer, which iOS
 * presents above the root view, and the snapshot would show them.
 */
export function AppLockCoordinator() {
  const { config, booting, clear } = useServer()
  const { palette } = useTheme()
  const security = useUIStore((state) => state.security)
  const pathname = usePathname()
  const router = useRouter()

  const [locked, setLocked] = useState(false)
  const [covered, setCovered] = useState(false)
  /** Bumped on every return to the foreground, so the automatic prompt can run then. */
  const [foreground, setForeground] = useState(0)
  const [checking, setChecking] = useState(false)
  const [label, setLabel] = useState<BiometricLabel>("Face ID")
  const [error, setError] = useState<string | null>(null)
  const initiallyLocked = useRef(false)
  const authenticating = useRef(false)
  const prompted = useRef(false)
  const backgroundedAt = useRef<number | undefined>(undefined)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  // Never lock before pairing or on the pair/boot screens.
  const skipLock = !config || booting || pathname === "/" || pathname === "/connect"

  useEffect(() => {
    if (!config || !security.biometricsEnabled) { initiallyLocked.current = false; setLocked(false) }
    else if (!skipLock && !initiallyLocked.current) { initiallyLocked.current = true; setLocked(true) }
  }, [config, skipLock, security.biometricsEnabled])

  useEffect(() => {
    void getBiometricCapability().then((capability) => { if (mounted.current) setLabel(biometricLabel(capability.types)) })
  }, [security.biometricsEnabled])

  const unlock = useCallback(async () => {
    if (authenticating.current) return
    authenticating.current = true
    setChecking(true)
    setError(null)
    try {
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: "Unlock CADCAMFUN", fallbackLabel: "Use passcode", disableDeviceFallback: false })
      if (!mounted.current) return
      if (result.success) {
        haptic("success")
        prompted.current = false
        setLocked(false)
      } else {
        setError(unlockFailureMessage(result.error) ?? null)
      }
    } catch {
      if (mounted.current) setError("Authentication is unavailable. Try again when the app is in the foreground.")
    } finally {
      authenticating.current = false
      if (mounted.current) setChecking(false)
    }
  }, [])

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      const policy = useUIStore.getState().security
      if (state === "active") {
        setCovered(false)
        setForeground((count) => count + 1)
        if (!skipLock && lockOnResume(policy, backgroundedAt.current, Date.now())) setLocked(true)
        backgroundedAt.current = undefined
        return
      }
      // `inactive` is the app switcher, Control Center or a system sheet (including Face ID itself).
      if (coverWhenInactive(policy) && !authenticating.current) setCovered(true)
      if (state !== "background" || skipLock) return
      backgroundedAt.current ??= Date.now()
      prompted.current = false
      if (lockWhenBackgrounded(policy)) setLocked(true)
    })
    return () => subscription.remove()
  }, [skipLock])

  // One automatic prompt per lock, and only in the foreground: iOS refuses Face ID otherwise.
  useEffect(() => {
    if (!locked || skipLock || prompted.current || AppState.currentState !== "active") return
    prompted.current = true
    void unlock()
  }, [locked, skipLock, foreground, unlock])

  const resetPairing = () => {
    void clear().then(() => {
      setLocked(false)
      router.replace("/connect")
    }).catch(() => setError("Could not remove the saved pairing."))
  }

  if (covered && !(locked && !skipLock)) {
    return <Modal visible transparent={false} animationType="none" presentationStyle="fullScreen" onRequestClose={() => undefined}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", backgroundColor: palette.background }]}>
        <View style={{ width: 64, height: 64, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: hexToRgba(palette.accent, 0.08) }}><Lock size={28} color={palette.accent} /></View>
      </View>
    </Modal>
  }

  if (!locked || skipLock) return null

  const needsReset = error !== null && error.includes("unpair")
  return (
    <Modal visible transparent={false} animationType="none" presentationStyle="fullScreen" onRequestClose={() => undefined}>
    <SafeAreaView accessibilityViewIsModal style={{ flex: 1, backgroundColor: palette.background }}>
      <PageScroll contentInsetAdjustmentBehavior="never" contentContainerStyle={{ flexGrow: 1, alignItems: "center", justifyContent: "center", gap: 20 }}>
        <BrandMark size={64} wordmark={false} />
        <View style={{ alignItems: "center", gap: 8 }}>
          <Text accessibilityRole="header" style={{ color: palette.ink, textAlign: "center", ...type(22, { weight: "600" }) }}>CADCAMFUN is locked</Text>
          <Text style={{ maxWidth: 300, color: palette.soft, textAlign: "center", ...type(15) }}>Unlock with {label} or your device passcode to continue.</Text>
        </View>
        <View style={{ alignSelf: "stretch", maxWidth: 360, width: "100%", gap: 10 }}>
          <ActionButton label={checking ? "Unlocking…" : `Unlock with ${label}`} loading={checking} onPress={() => void unlock()} />
          {needsReset ? <ActionButton label="Unpair this phone" variant="secondary" onPress={resetPairing} /> : null}
        </View>
        {error ? <Text selectable accessibilityLiveRegion="polite" style={{ maxWidth: 320, color: palette.danger, textAlign: "center", ...type(15) }}>{error}</Text> : null}
      </PageScroll>
    </SafeAreaView>
    </Modal>
  )
}
