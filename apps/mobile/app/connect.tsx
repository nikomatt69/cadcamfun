import { useCallback, useRef, useState } from "react"
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { CameraView, useCameraPermissions } from "expo-camera"
import * as Clipboard from "expo-clipboard"
import { Link2, ScanLine, X } from "lucide-react-native"
import Animated, { FadeIn, FadeInDown, FadeOut } from "react-native-reanimated"
import { nativeAvailable } from "@/lib/native"
import { useServer } from "@/lib/server"
import { desktopLabel, parsePairingLink, type Pairing } from "@/lib/pairing"
import { useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"
import { ActionButton } from "@/components/ui/ActionButton"
import { BottomSheet } from "@/components/ui/BottomSheet"
import { TextField } from "@/components/ui/TextField"
import { ErrorBanner } from "@/components/ui/ErrorBanner"

/**
 * The Pair screen — the phone's front door. Scan the QR shown on the desktop (Settings → Mobile
 * companion), paste a pairing link, or type the address + token + fingerprint by hand. On success
 * the pairing is sealed in the Keychain and the root gate drops the user into Projects.
 */
export default function ConnectScreen() {
  const { palette } = useTheme()
  const insets = useSafeAreaInsets()
  const { save, connectionError } = useServer()
  const supported = Platform.OS === "web" || nativeAvailable
  const pairingBusy = useRef(false)

  const [scanning, setScanning] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [permission, requestPermission] = useCameraPermissions()

  const pair = useCallback(
    async (link: string): Promise<void> => {
      if (pairingBusy.current || !supported) return
      pairingBusy.current = true
      setBusy(true)
      setError(null)
      try {
        const pairing: Pairing = parsePairingLink(link)
        const ok = await save(pairing)
        if (!ok) {
          setError(`The desktop at ${desktopLabel(pairing)} did not answer. Join the same Wi-Fi or Personal Hotspot as the Mac, or type a Tailscale address. Is the companion gateway on?`)
          haptic("error")
          return
        }
        haptic("success")
        setScanning(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : "That is not a CADCAMFUN pairing link")
        haptic("error")
      } finally {
        pairingBusy.current = false
        setBusy(false)
      }
    },
    [save, supported],
  )

  const openScanner = async () => {
    haptic("selection")
    if (!supported) {
      setError("Open the installed CADCAMFUN app to pair securely. Expo Go cannot use the CompanionNet module.")
      return
    }
    try {
    if (!permission?.granted) {
      const next = await requestPermission()
      if (!next.granted) {
        setError("Camera permission is needed to scan the pairing QR code")
        return
      }
    }
    setScanning(true)
    } catch { setError("Could not open the camera. Paste the pairing link instead.") }
  }

  const paste = async () => {
    haptic("selection")
    if (!supported) {
      setError("Open the installed CADCAMFUN app to pair securely. Expo Go cannot use the CompanionNet module.")
      return
    }
    try {
      const text = await Clipboard.getStringAsync()
      if (text.trim()) await pair(text)
    } catch { setError("Could not read the clipboard. Enter the pairing link manually.") }
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      {scanning ? (
        <ScannerOverlay
          busy={busy}
          error={error}
          onScanned={pair}
          onClose={() => setScanning(false)}
        />
      ) : (
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingHorizontal: 24, paddingTop: insets.top + 56, paddingBottom: insets.bottom + 24 }}>
          <Animated.View entering={FadeInDown.duration(420)} style={{ alignItems: "center", gap: 8 }}>
            <Text style={{ color: palette.ink, fontSize: 34, fontWeight: "800", letterSpacing: -0.03, lineHeight: 37 }}>CADCAMFUN</Text>
            <Text style={{ color: palette.soft, fontSize: 17, lineHeight: 23, textAlign: "center", letterSpacing: -0.004 }}>
              Your projects, pull requests and workflows live on your Mac. Pair this phone to work with them anywhere on your network.
            </Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(90).duration(420)} style={{ gap: 12, marginTop: 40 }}>
            <ActionButton label="Scan the pairing QR code" icon={<ScanLine size={19} color={palette.onAccent} />} fullWidth disabled={busy} onPress={() => void openScanner()} />
            <ActionButton label="Paste a pairing link" icon={<Link2 size={19} color={palette.accent} />} fullWidth variant="secondary" disabled={busy} onPress={() => void paste()} />
            <Pressable disabled={busy} onPress={() => {
              haptic("selection")
              if (!supported) {
                setError("Open the installed CADCAMFUN app to pair securely. Expo Go cannot use the CompanionNet module.")
                return
              }
              setManualOpen(true)
            }} hitSlop={8} style={{ alignSelf: "center", paddingVertical: 12 }}>
              <Text style={{ color: palette.accent, fontSize: 15, fontWeight: "500" }}>Enter the address manually</Text>
            </Pressable>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(180).duration(420)} style={{ marginTop: 28 }}>
            {!supported ? <ErrorBanner message="Secure desktop pairing requires the CADCAMFUN development build. Expo Go does not include CompanionNet. Install the development build with bun run ios from apps/mobile, then open it instead of Expo Go." /> : null}
            {error || connectionError ? <ErrorBanner message={error ?? connectionError!} /> : null}
            <Text style={{ color: palette.muted, fontSize: 13, lineHeight: 18, textAlign: "center", marginTop: 24 }}>
              On your Mac: Settings → Mobile companion → turn it on and show the QR code. The phone and the Mac must share Wi-Fi, Personal Hotspot, or Tailscale — cellular 5G cannot reach the desktop.
            </Text>
          </Animated.View>
        </ScrollView>
      )}

      <ManualSheet open={manualOpen} busy={busy} onClose={() => setManualOpen(false)} onPair={pair} />
    </View>
  )
}

/** Full-bleed camera with a rounded viewfinder; a QR hit goes straight to pairing. */
function ScannerOverlay({ busy, error, onScanned, onClose }: { busy: boolean; error: string | null; onScanned: (link: string) => Promise<void>; onClose: () => void }) {
  const { palette } = useTheme()
  const insets = useSafeAreaInsets()
  const [handled, setHandled] = useState(false)

  return (
    <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(150)} style={{ flex: 1 }}>
      <CameraView
        style={StyleSheet.absoluteFill}
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={(result) => {
          if (handled || busy || result.type !== "qr") return
          setHandled(true)
          void onScanned(result.data).finally(() => setHandled(false))
        }}
      />
      {/* Viewfinder: a rounded rect with corner brackets drawn as a border frame. */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
        <View style={{ width: 260, height: 260, borderRadius: 24, borderWidth: 2.5, borderColor: "#FFFFFFCC", backgroundColor: "transparent" }} />
      </View>
      <View style={{ position: "absolute", top: insets.top + 12, right: 16 }}>
        <Pressable
          onPress={onClose}
          hitSlop={10}
          style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.4)" }}
        >
          <X size={18} color="#FFFFFF" />
        </Pressable>
      </View>
      {error ? <View style={{ position: "absolute", bottom: insets.bottom + 90, left: 16, right: 16 }}><ErrorBanner message={error} /></View> : null}
      <Text style={{ position: "absolute", bottom: insets.bottom + 48, left: 0, right: 0, textAlign: "center", color: "#FFFFFF", fontSize: 15, fontWeight: "600" }}>
        Point at the QR code on your Mac
      </Text>
    </Animated.View>
  )
}

/** Advanced pairing: type the gateway address, scoped token and certificate fingerprint. */
function ManualSheet({ open, busy, onClose, onPair }: { open: boolean; busy: boolean; onClose: () => void; onPair: (link: string) => void }) {
  const { palette } = useTheme()
  const [host, setHost] = useState("")
  const [token, setToken] = useState("")
  const [fingerprint, setFingerprint] = useState("")

  const submit = () => {
    const url = new URLSearchParams({ host, token, fp: fingerprint, name: "Desktop" })
    onPair(`cadcamfun://pair?${url}`)
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Manual pairing">
      <View style={{ paddingHorizontal: 20, gap: 12 }}>
        <TextField value={host} onChangeText={setHost} placeholder="https://192.168.1.10:8443" autoCapitalize="none" autoCorrect={false} keyboardType="url" />
        <TextField value={token} onChangeText={setToken} placeholder="Pairing token (shown once, inside the QR)" autoCapitalize="none" autoCorrect={false} secureTextEntry />
        <TextField value={fingerprint} onChangeText={setFingerprint} placeholder="Certificate fingerprint (64 hex chars)" autoCapitalize="none" autoCorrect={false} />
        <ActionButton label="Pair" fullWidth disabled={busy || !host.trim() || !token.trim() || !fingerprint.trim()} onPress={submit} />
      </View>
    </BottomSheet>
  )
}
