import { useCallback, useRef, useState } from "react"
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native"
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context"
import { CameraView, useCameraPermissions } from "expo-camera"
import * as Clipboard from "expo-clipboard"
import { StatusBar } from "expo-status-bar"
import { Link2, MonitorSmartphone, ScanLine, ShieldCheck, X } from "lucide-react-native"
import Animated, { FadeIn, FadeOut } from "react-native-reanimated"
import { nativeAvailable } from "@/lib/native"
import { useServer } from "@/lib/server"
import { desktopLabel, parsePairingLink, type Pairing } from "@/lib/pairing"
import { useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"
import { ActionButton } from "@/components/ui/ActionButton"
import { BottomSheet } from "@/components/ui/BottomSheet"
import { TextField } from "@/components/ui/TextField"
import { ErrorBanner } from "@/components/ui/ErrorBanner"
import { SurfaceCard } from "@/components/ui/SurfaceCard"
import { IconTile } from "@/components/ui/icon-tile"
import { contentGutter } from "@/lib/layout"
import { usePrefersReducedMotion } from "@/lib/animation"

/**
 * The Pair screen — the phone's front door. Scan the QR shown on the desktop (Settings → Mobile
 * companion), paste a pairing link, or type the address + token + fingerprint by hand. On success
 * the pairing is sealed in the Keychain and the root gate drops the user into Projects.
 */
export default function ConnectScreen() {
  const { palette } = useTheme()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
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
        <ScrollView contentInsetAdjustmentBehavior="never" keyboardShouldPersistTaps="handled" style={{ flex: 1 }}
          contentContainerStyle={{ paddingLeft: Math.max(contentGutter(width), insets.left + 16), paddingRight: Math.max(contentGutter(width), insets.right + 16), paddingTop: insets.top + 28, paddingBottom: insets.bottom + 28, gap: 24 }}>
          <View style={{ gap: 24 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <IconTile size={36}><MonitorSmartphone size={20} color={palette.accent} /></IconTile>
              <Text style={{ color: palette.ink, fontSize: 15, fontWeight: "700", letterSpacing: 1 }}>CADCAMFUN</Text>
            </View>
            <View style={{ gap: 12, paddingTop: 12 }}>
              <Text style={{ color: palette.accent, fontSize: 12, fontWeight: "700", letterSpacing: 1.2 }}>YOUR WORK. WITH YOU.</Text>
              <Text accessibilityRole="header" style={{ color: palette.ink, fontSize: width < 375 ? 34 : 38, fontWeight: "700", letterSpacing: -1.1, lineHeight: width < 375 ? 40 : 44 }}>A closer connection to your workspace.</Text>
              <Text style={{ color: palette.soft, fontSize: 17, lineHeight: 25 }}>Review designs, check toolpaths and work with your assistant. Start by pairing with CADCAMFUN on your Mac.</Text>
            </View>
          </View>

          <SurfaceCard>
            <View style={{ gap: 20 }}>
              {[
                ["1", "Open your desktop", "Go to Settings → Mobile companion on your Mac."],
                ["2", "Show the pairing code", "Turn on the companion and display its QR code."],
                ["3", "Connect your iPhone", "Scan the code below while on the same network."],
              ].map(([step, title, detail]) => <View key={step} style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
                <IconTile size={30}><Text style={{ color: palette.accent, fontSize: 13, fontWeight: "700" }}>{step}</Text></IconTile>
                <View style={{ flex: 1, gap: 4 }}><Text style={{ color: palette.ink, fontSize: 15, fontWeight: "600" }}>{title}</Text><Text style={{ color: palette.muted, fontSize: 13, lineHeight: 19 }}>{detail}</Text></View>
              </View>)}
            </View>
          </SurfaceCard>

          <View style={{ gap: 10 }}>
            <ActionButton label={busy ? "Connecting to your desktop…" : "Scan pairing code"} icon={<ScanLine size={20} color={palette.onAccent} />} fullWidth loading={busy} onPress={() => void openScanner()} />
            <ActionButton label="Paste a pairing link" icon={<Link2 size={19} color={palette.accent} />} fullWidth variant="secondary" disabled={busy} onPress={() => void paste()} />
            <Pressable disabled={busy} accessibilityRole="button" onPress={() => {
              haptic("selection")
              if (!supported) { setError("Open the installed CADCAMFUN app to pair securely."); return }
              setManualOpen(true)
            }} style={({ pressed }) => ({ minHeight: 44, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.6 : 1 })}>
              <Text style={{ color: palette.accent, fontSize: 14, fontWeight: "600" }}>Enter connection details</Text>
            </Pressable>
          </View>

          {!supported ? <ErrorBanner message="Secure pairing requires the installed CADCAMFUN app. Expo Go does not include the native connection module." /> : null}
          {error || connectionError ? <ErrorBanner message={error ?? connectionError!} /> : null}
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, paddingHorizontal: 4 }}>
            <ShieldCheck size={20} color={palette.success} />
            <Text style={{ flex: 1, color: palette.muted, fontSize: 12, lineHeight: 19 }}>A private, encrypted connection to your Mac. Use the same Wi-Fi, Personal Hotspot or a private network such as Tailscale.</Text>
          </View>
        </ScrollView>
      )}

      <ManualSheet open={manualOpen} busy={busy} onClose={() => setManualOpen(false)} onPair={pair} />
    </View>
  )
}

/** Full-bleed camera with a rounded viewfinder; a QR hit goes straight to pairing. */
function ScannerOverlay({ busy, error, onScanned, onClose }: { busy: boolean; error: string | null; onScanned: (link: string) => Promise<void>; onClose: () => void }) {
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const reduced = usePrefersReducedMotion()
  const [handled, setHandled] = useState(false)
  const [viewfinderSpace, setViewfinderSpace] = useState(0)
  const frameSize = Math.max(0, Math.min(260, width - insets.left - insets.right - 64, viewfinderSpace))

  return (
    <Animated.View entering={reduced ? undefined : FadeIn.duration(220)} exiting={reduced ? undefined : FadeOut.duration(150)} style={{ flex: 1, backgroundColor: "#000000" }}>
      <StatusBar style="light" />
      <CameraView
        style={StyleSheet.absoluteFill}
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={(result) => {
          if (handled || busy || result.type !== "qr") return
          setHandled(true)
          void onScanned(result.data).finally(() => setHandled(false))
        }}
      />
      <SafeAreaView style={{ flex: 1, paddingHorizontal: 20, paddingVertical: 12, gap: 16 }}>
      <View style={{ alignItems: "flex-end" }}>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close scanner"
          style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.6)", opacity: pressed ? 0.65 : 1 })}
        >
          <X size={18} color="#FFFFFF" />
        </Pressable>
      </View>
      <View pointerEvents="none" onLayout={(event) => setViewfinderSpace(event.nativeEvent.layout.height)} style={{ flex: 1, minHeight: 0, alignItems: "center", justifyContent: "center" }}>
        <View style={{ width: frameSize, height: frameSize, borderRadius: 24, borderCurve: "continuous", borderWidth: 2.5, borderColor: "#FFFFFFCC" }} />
      </View>
      <ScrollView contentInsetAdjustmentBehavior="never" style={{ flexGrow: 0, maxHeight: "38%" }} contentContainerStyle={{ gap: 12 }}>
        {error ? <ErrorBanner message={error} /> : null}
        <View style={{ backgroundColor: "rgba(0,0,0,0.72)", borderRadius: 18, borderCurve: "continuous", padding: 16, gap: 10, alignItems: "center" }}>
          {busy ? <ActivityIndicator color="#FFFFFF" accessibilityLabel="Connecting to desktop" /> : null}
          <Text accessibilityLiveRegion="polite" style={{ textAlign: "center", color: "#FFFFFF", fontSize: 15, lineHeight: 22, fontWeight: "600" }}>
            {busy ? "Connecting to your desktop…" : "Point at the QR code on your Mac"}
          </Text>
        </View>
      </ScrollView>
      </SafeAreaView>
    </Animated.View>
  )
}

/** Advanced pairing: type the gateway address, scoped token and certificate fingerprint. */
function ManualSheet({ open, busy, onClose, onPair }: { open: boolean; busy: boolean; onClose: () => void; onPair: (link: string) => void }) {
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
        <TextField label="Desktop address" value={host} onChangeText={setHost} placeholder="https://192.168.1.10:8443" autoCapitalize="none" autoCorrect={false} keyboardType="url" editable={!busy} />
        <TextField label="Pairing token" value={token} onChangeText={setToken} placeholder="Token from your desktop" autoCapitalize="none" autoCorrect={false} secureTextEntry editable={!busy} />
        <TextField label="Certificate fingerprint" value={fingerprint} onChangeText={setFingerprint} placeholder="64 hexadecimal characters" autoCapitalize="none" autoCorrect={false} editable={!busy} />
        <ActionButton label="Pair" fullWidth loading={busy} disabled={busy || !host.trim() || !token.trim() || !fingerprint.trim()} onPress={submit} />
      </View>
    </BottomSheet>
  )
}
