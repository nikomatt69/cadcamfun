import { useEffect, useRef, useState } from "react"
import { AccessibilityInfo, ActivityIndicator, Linking, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native"
import { CameraView, useCameraPermissions } from "expo-camera"
import { StatusBar } from "expo-status-bar"
import Animated, { FadeIn, FadeOut } from "react-native-reanimated"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Camera, CameraOff, Check, Flashlight, FlashlightOff, X } from "lucide-react-native"
import { GlassSurface } from "@/components/GlassView"
import { CapsuleButton } from "@/components/layout/CapsuleButton"
import { GlassChromeButton } from "@/components/layout/GlassChromeButton"
import { StatusPill } from "@/components/layout/StatusPill"
import { ActionButton } from "@/components/ui/ActionButton"
import { ErrorBanner } from "@/components/ui/ErrorBanner"
import { cameraAccess, SCAN_RETRY_MS, scannerHint } from "@/lib/camera-access"
import { EASE_OUT, usePrefersReducedMotion, usePrefersReducedTransparency } from "@/lib/animation"
import { haptic } from "@/lib/haptics"
import { layout } from "@/lib/layout"
import { PALETTES } from "@/lib/palette"
import { hexToRgba, useTheme } from "@/lib/theme"
import { type as typeStyle } from "@/lib/typography"

/** The camera is a black surface in both themes, so everything drawn on it comes from the dark palette. */
const CAMERA = PALETTES.dark

// Layout-animation builders live at module scope: building them in render re-creates them on every re-render.
const ENTER = FadeIn.duration(220).easing(EASE_OUT)
const EXIT = FadeOut.duration(150).easing(EASE_OUT)

/** The four corners of the viewfinder; open edges let the camera show through. */
function Corners({ size, color }: { size: number; color: string }) {
  const arm = Math.round(size * 0.16)
  const corner = { position: "absolute", width: arm, height: arm, borderColor: color, borderCurve: "continuous" } as const
  const stroke = 4
  const radius = 22
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={{ width: size, height: size }}>
      <View style={{ ...corner, top: 0, left: 0, borderTopWidth: stroke, borderLeftWidth: stroke, borderTopLeftRadius: radius }} />
      <View style={{ ...corner, top: 0, right: 0, borderTopWidth: stroke, borderRightWidth: stroke, borderTopRightRadius: radius }} />
      <View style={{ ...corner, bottom: 0, left: 0, borderBottomWidth: stroke, borderLeftWidth: stroke, borderBottomLeftRadius: radius }} />
      <View style={{ ...corner, bottom: 0, right: 0, borderBottomWidth: stroke, borderRightWidth: stroke, borderBottomRightRadius: radius }} />
    </View>
  )
}

/**
 * The pairing scanner: the live camera under glass chrome, in the language of the assistant's header and dock.
 * A round torch and close button flank the title, four corners frame the code, and one glass pill under them says what
 * is happening (point, connecting, failed, connected). A code that is not a CADCAMFUN pairing code pauses the scan
 * for a moment instead of buzzing at 30 frames a second.
 *
 * Without camera access the same screen explains why and offers the way back: the system prompt while iOS will
 * still ask, Settings once it never will, or manual entry either way.
 */
export function PairingScanner({ busy, desktop, error, connectedTo, onScanned, onClose, onManual }: {
  busy: boolean
  /** The desktop being paired with, once the code has been read. */
  desktop?: string
  error: string | null
  /** Set when the pairing succeeded, for the last moment before the app opens Projects. */
  connectedTo?: string | null
  /** Resolves true when the pairing was saved; false keeps scanning after a short pause. */
  onScanned: (link: string) => Promise<boolean>
  onClose: () => void
  onManual: () => void
}) {
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const { palette } = useTheme()
  const reduced = usePrefersReducedMotion()
  const solid = usePrefersReducedTransparency()
  const [permission, requestPermission] = useCameraPermissions()
  const access = cameraAccess(permission)
  const [torch, setTorch] = useState(false)
  const [failed, setFailed] = useState(false)
  const [space, setSpace] = useState(0)
  /** iOS shows its prompt once; ask on opening, never in a loop. */
  const asked = useRef(false)
  const locked = useRef(false)
  const resume = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (resume.current) clearTimeout(resume.current) }, [])

  useEffect(() => {
    if (access !== "ask" || asked.current) return
    asked.current = true
    void requestPermission().catch(() => undefined)
  }, [access, requestPermission])

  const hint = connectedTo ? `Connected to ${connectedTo}` : scannerHint({ busy, failed, desktop })
  // A pill that merely changes is not read by VoiceOver (iOS has no live regions): say each state once.
  useEffect(() => { AccessibilityInfo.announceForAccessibility(hint) }, [hint])

  const handle = (data: string) => {
    if (locked.current || busy || connectedTo) return
    locked.current = true
    void onScanned(data).then((ok) => {
      if (ok) return
      setFailed(true)
      resume.current = setTimeout(() => { locked.current = false; setFailed(false) }, SCAN_RETRY_MS)
    }).catch(() => { locked.current = false })
  }

  const frame = Math.max(0, Math.min(280, width - insets.left - insets.right - 80, space))
  const frameColor = connectedTo ? CAMERA.success : failed ? CAMERA.danger : hexToRgba(CAMERA.ink, 0.92)
  const side = Math.max(layout.gutter, insets.left, insets.right)
  const granted = access === "granted"
  const blocked = access === "blocked"

  return (
    <Animated.View entering={reduced ? undefined : ENTER} exiting={reduced ? undefined : EXIT} accessibilityViewIsModal style={{ flex: 1, backgroundColor: palette.overlay }}>
      <StatusBar style="light" />
      {granted ? <CameraView style={StyleSheet.absoluteFill} facing="back" enableTorch={torch} barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={(result) => { if (result.type === "qr") handle(result.data) }} /> : null}

      <View pointerEvents="box-none" style={{ flex: 1, paddingTop: insets.top + 8, paddingBottom: Math.max(insets.bottom, 12) + 8, paddingLeft: side, paddingRight: side, gap: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", minHeight: 44 }}>
          <View style={{ width: 44, height: 44, alignItems: "flex-start", justifyContent: "center" }}>
            {granted ? (
              <GlassChromeButton over="camera" label={torch ? "Turn the torch off" : "Turn the torch on"} hint="Lights the code in a dark room" selected={torch} onPress={() => setTorch((on) => !on)}>
                {torch ? <FlashlightOff size={18} color={CAMERA.ink} strokeWidth={2.1} /> : <Flashlight size={18} color={CAMERA.ink} strokeWidth={2.1} />}
              </GlassChromeButton>
            ) : null}
          </View>
          <View style={{ flex: 1, minWidth: 0, marginHorizontal: 8, alignItems: "center", justifyContent: "center" }}>
            <Text accessibilityRole="header" numberOfLines={1} maxFontSizeMultiplier={1.4} style={{ color: CAMERA.ink, textAlign: "center", ...typeStyle(20, { weight: "700" }) }}>Scan pairing code</Text>
          </View>
          <View style={{ width: 44, height: 44, alignItems: "flex-end", justifyContent: "center" }}>
            <GlassChromeButton over="camera" label="Close scanner" hint="Returns to the pairing screen" onPress={onClose}>
              <X size={19} color={CAMERA.ink} strokeWidth={2.2} />
            </GlassChromeButton>
          </View>
        </View>

        {granted ? (
          <View pointerEvents="none" onLayout={(event) => setSpace(event.nativeEvent.layout.height)} style={{ flex: 1, minHeight: 0, alignItems: "center", justifyContent: "center" }}>
            <Corners size={frame} color={frameColor} />
          </View>
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 12 }}>
            {access === "pending" ? (
              <View accessible accessibilityLabel="Opening the camera"><ActivityIndicator color={CAMERA.ink} /></View>
            ) : (
              <>
                <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 72, height: 72, borderRadius: 22, borderCurve: "continuous", alignItems: "center", justifyContent: "center", backgroundColor: hexToRgba(CAMERA.ink, 0.12) }}>
                  {blocked ? <CameraOff size={30} color={CAMERA.ink} strokeWidth={1.8} /> : <Camera size={30} color={CAMERA.ink} strokeWidth={1.8} />}
                </View>
                <Text accessibilityRole="header" style={{ color: CAMERA.ink, textAlign: "center", ...typeStyle(20, { weight: "700" }) }}>{blocked ? "Camera access is off" : "Allow the camera"}</Text>
                <Text style={{ maxWidth: 340, color: hexToRgba(CAMERA.ink, 0.72), textAlign: "center", ...typeStyle(15, { leadingScale: 1.05 }) }}>
                  {blocked
                    ? "Turn the camera on for CADCAMFUN in iOS Settings to scan the pairing code, or enter the connection details by hand."
                    : "CADCAMFUN reads the pairing QR code on your Mac with the camera. Nothing is recorded or sent."}
                </Text>
                <View style={{ alignSelf: "stretch", gap: 10, paddingTop: 8 }}>
                  <ActionButton label={blocked ? "Open Settings" : "Allow camera"} onPress={() => { haptic("selection"); if (blocked) void Linking.openSettings(); else void requestPermission() }} />
                </View>
              </>
            )}
          </View>
        )}

        <ScrollView contentInsetAdjustmentBehavior="never" style={{ flexGrow: 0, maxHeight: "45%" }} contentContainerStyle={{ gap: 12 }} bounces={false} showsVerticalScrollIndicator={false}>
          {error ? <View style={{ borderRadius: layout.controlRadius, borderCurve: "continuous", overflow: "hidden", backgroundColor: palette.surface }}><ErrorBanner message={error} /></View> : null}
          {granted ? (
            <GlassSurface radius={22} over="camera" style={solid ? { backgroundColor: CAMERA.background } : undefined}>
              <View style={{ paddingHorizontal: 16, paddingVertical: 4 }}>
                <StatusPill
                  bare
                  fill
                  over="camera"
                  tone={connectedTo ? "success" : failed ? "danger" : busy ? "warning" : "muted"}
                  busy={busy && !connectedTo}
                  icon={connectedTo ? <Check size={14} color={CAMERA.success} strokeWidth={2.6} /> : undefined}
                  label={hint}
                />
              </View>
            </GlassSurface>
          ) : null}
          <CapsuleButton variant="glass" over="camera" label="Enter details instead" hint="Opens the form for the address, token and fingerprint" disabled={busy} onPress={onManual} />
        </ScrollView>
      </View>
    </Animated.View>
  )
}
