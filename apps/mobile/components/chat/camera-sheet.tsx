import { useEffect, useRef, useState, type ReactNode } from "react"
import { AccessibilityInfo, ActivityIndicator, Linking, Modal, Text, View } from "react-native"
import { CameraView, useCameraPermissions } from "expo-camera"
import { Image } from "expo-image"
import { Camera, CameraOff, RotateCcw, SwitchCamera, X, Zap, ZapOff } from "lucide-react-native"
import { ActionButton } from "@/components/ui/ActionButton"
import { ErrorBanner } from "@/components/ui/ErrorBanner"
import { PressableScale } from "@/components/ui/PressableScale"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { hexToRgba, useTheme } from "@/lib/theme"
import { type as typeStyle } from "@/lib/typography"
import { haptic } from "@/lib/haptics"
import { usePrefersReducedMotion, usePrefersReducedTransparency } from "@/lib/animation"
import { layout } from "@/lib/layout"
import { photoName, type PendingAttachment } from "@/lib/attachments"
import { reviewPhoto } from "@/lib/photo-review"

/** The camera is always a black surface, so its chrome is white in both themes. */
const ON_CAMERA = "#FFFFFF"

type Flash = "off" | "auto" | "on"
const FLASH_NEXT: Record<Flash, Flash> = { off: "auto", auto: "on", on: "off" }
const FLASH_LABEL: Record<Flash, string> = { off: "Flash off", auto: "Flash automatic", on: "Flash on" }

/**
 * Take a photo for the assistant.
 *
 * The desktop's assistant reads images attached to a turn, so a picture of the part on the bench is a
 * first-class input. The photo travels as base64 in the prompt, which the gateway budgets for five
 * five-megabyte images; the phone refuses anything larger before it spends that budget.
 *
 * Picking from the photo library is not offered: `expo-image-picker` is not a dependency of the app.
 */
export function CameraSheet({ open, onClose, onCapture }: {
  open: boolean
  onClose: () => void
  onCapture: (attachment: PendingAttachment) => void
}) {
  const { palette } = useTheme()
  const insets = useSafeAreaInsets()
  const reduced = usePrefersReducedMotion()
  const solid = usePrefersReducedTransparency()
  const [permission, requestPermission] = useCameraPermissions()
  const cameraRef = useRef<CameraView>(null)
  const [facing, setFacing] = useState<"back" | "front">("back")
  const [flash, setFlash] = useState<Flash>("off")
  const [capturing, setCapturing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shot, setShot] = useState<{ attachment: PendingAttachment; uri: string } | null>(null)
  /** The permission is asked once per opening: asking again in a loop would never end. */
  const asked = useRef(false)

  useEffect(() => {
    if (!open) {
      asked.current = false
      return
    }
    setError(null)
    setShot(null)
    if (asked.current || !permission || permission.granted || !permission.canAskAgain) return
    asked.current = true
    void requestPermission().then((next) => {
      if (!next.granted) setError("The camera is off for CADCAMFUN. Turn it on in iOS Settings to send a photo.")
    }).catch(() => setError("The camera could not be opened. You can still describe the part in words."))
  }, [open, permission, requestPermission])

  const capture = async () => {
    if (capturing || !cameraRef.current) return
    setCapturing(true)
    setError(null)
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.5, base64: true, skipProcessing: true })
      if (!photo?.base64) {
        haptic("error")
        setError("The photo could not be read. Try again.")
        return
      }
      setShot({ attachment: { name: photoName(), mime: "image/jpeg", data: photo.base64 }, uri: photo.uri })
      haptic("selection")
      AccessibilityInfo.announceForAccessibility("Photo taken. Review it, then use it or retake.")
    } catch (err) {
      haptic("error")
      setError(err instanceof Error ? err.message : "The photo could not be taken.")
    } finally {
      setCapturing(false)
    }
  }

  const review = shot ? reviewPhoto(shot.attachment) : null
  const use = () => {
    if (!shot || !review) return
    if (!review.sendable) { haptic("error"); return }
    haptic("success")
    onCapture(shot.attachment)
    onClose()
  }

  const granted = permission?.granted === true
  /** iOS asks only once: after a refusal the way back is Settings, and asking again would do nothing. */
  const needsSettings = permission !== null && !granted && !permission.canAskAgain
  // Reduce Transparency: the bars over the viewfinder become opaque black.
  const scrim = (alpha: number) => hexToRgba(palette.overlay, solid ? 1 : alpha)
  const sideInset = 20 + Math.max(insets.left, insets.right)
  const topInset = Math.max(insets.top, 20) + 8
  const bottomInset = 16 + Math.max(insets.bottom, 12)

  return (
    <Modal visible={open} animationType={reduced ? "fade" : "slide"} presentationStyle="fullScreen" supportedOrientations={["portrait", "landscape"]} onRequestClose={onClose}>
      <View accessibilityViewIsModal style={{ flex: 1, backgroundColor: palette.overlay }}>
        {shot && review ? (
          <>
            <Image source={{ uri: shot.uri }} style={{ flex: 1 }} contentFit="contain" accessibilityLabel="Photo preview" />
            <View style={{ gap: 14, paddingTop: 16, paddingHorizontal: sideInset, paddingBottom: bottomInset, backgroundColor: scrim(0.6) }}>
              {review.problem ? <View style={{ borderRadius: layout.controlRadius, borderCurve: "continuous", overflow: "hidden", backgroundColor: palette.surface }}><ErrorBanner message={review.problem} /></View>
                : <Text accessibilityLabel={`Photo size ${review.size}`} style={{ textAlign: "center", color: hexToRgba(ON_CAMERA, 0.72), fontVariant: ["tabular-nums"], ...typeStyle(13) }}>{review.size}</Text>}
              <View style={{ flexDirection: "row", gap: 12 }}>
                <ChromeButton
                  label="Retake" accessibilityLabel="Take another photo"
                  icon={<RotateCcw size={18} color={ON_CAMERA} />}
                  onPress={() => { haptic("selection"); setShot(null) }}
                />
                <ChromeButton
                  primary label="Use photo" accessibilityLabel={review.sendable ? "Send this photo to the assistant" : "This photo is too large to send"}
                  disabled={!review.sendable}
                  onPress={use}
                />
              </View>
            </View>
          </>
        ) : granted ? (
          <>
            <CameraView ref={cameraRef} style={{ flex: 1 }} facing={facing} flash={facing === "back" ? flash : "off"} accessibilityLabel="Camera viewfinder" />
            <View style={{ gap: 14, paddingTop: 20, paddingHorizontal: sideInset, paddingBottom: bottomInset, backgroundColor: scrim(0.55) }}>
              {error ? <View style={{ borderRadius: layout.controlRadius, borderCurve: "continuous", overflow: "hidden", backgroundColor: palette.surface }}><ErrorBanner message={error} /></View> : null}
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ width: 56 }} />
                <PressableScale
                  onPressIn={() => haptic("light")}
                  onPress={() => void capture()}
                  disabled={capturing}
                  disabledOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Take the photo"
                  accessibilityState={{ disabled: capturing, busy: capturing }}
                  style={{ width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center", borderWidth: 4, borderColor: hexToRgba(ON_CAMERA, 0.85) }}
                >
                  <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: ON_CAMERA, alignItems: "center", justifyContent: "center" }}>
                    {capturing ? <ActivityIndicator color={palette.overlay} /> : null}
                  </View>
                </PressableScale>
                <View style={{ width: 56, alignItems: "flex-end" }}>
                  <RoundButton
                    label="Switch camera" hint={facing === "back" ? "Uses the front camera" : "Uses the back camera"}
                    onPress={() => { haptic("selection"); setFacing((current) => (current === "back" ? "front" : "back")) }}
                  ><SwitchCamera size={22} color={ON_CAMERA} /></RoundButton>
                </View>
              </View>
            </View>
            <View pointerEvents="box-none" style={{ position: "absolute", top: topInset, right: sideInset }}>
              {facing === "back" ? <RoundButton
                label={FLASH_LABEL[flash]} hint="Changes the flash setting"
                onPress={() => { haptic("selection"); setFlash((current) => FLASH_NEXT[current]) }}
              >
                {flash === "off" ? <ZapOff size={20} color={ON_CAMERA} /> : <Zap size={20} color={flash === "on" ? "#FFD60A" : ON_CAMERA} fill={flash === "on" ? "#FFD60A" : "none"} />}
                {flash === "auto" ? <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: "absolute", bottom: 5, color: ON_CAMERA, ...typeStyle(9, { weight: "700" }) }}>A</Text> : null}
              </RoundButton> : null}
            </View>
          </>
        ) : permission === null ? (
          <View accessible accessibilityLabel="Opening the camera" style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={ON_CAMERA} />
          </View>
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 28, paddingTop: topInset + 44, paddingBottom: bottomInset }}>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 72, height: 72, borderRadius: 22, borderCurve: "continuous", alignItems: "center", justifyContent: "center", backgroundColor: hexToRgba(ON_CAMERA, 0.12) }}>
              {needsSettings ? <CameraOff size={30} color={ON_CAMERA} strokeWidth={1.8} /> : <Camera size={30} color={ON_CAMERA} strokeWidth={1.8} />}
            </View>
            <Text accessibilityRole="header" style={{ color: ON_CAMERA, textAlign: "center", ...typeStyle(20, { weight: "700" }) }}>{needsSettings ? "Camera access is off" : "Allow the camera"}</Text>
            <Text style={{ maxWidth: 340, color: hexToRgba(ON_CAMERA, 0.72), textAlign: "center", ...typeStyle(15, { leadingScale: 1.05 }) }}>
              {needsSettings
                ? "Turn the camera on for CADCAMFUN in iOS Settings to photograph a part or a drawing for the assistant."
                : "CADCAMFUN uses the camera to photograph a part or a drawing and send it to the assistant."}
            </Text>
            {error ? <View style={{ alignSelf: "stretch", borderRadius: layout.controlRadius, borderCurve: "continuous", overflow: "hidden", backgroundColor: palette.surface }}><ErrorBanner message={error} /></View> : null}
            <View style={{ alignSelf: "stretch", gap: 10, paddingTop: 8 }}>
              <ActionButton label={needsSettings ? "Open Settings" : "Allow camera"} onPress={() => { haptic("selection"); if (needsSettings) void Linking.openSettings(); else void requestPermission() }} />
              <View style={{ flexDirection: "row" }}><ChromeButton label="Not now" accessibilityLabel="Close the camera" onPress={onClose} /></View>
            </View>
          </View>
        )}

        <RoundButton
          label="Close the camera"
          onPress={onClose}
          style={{ position: "absolute", top: topInset, left: sideInset }}
        ><X size={20} color={ON_CAMERA} /></RoundButton>
      </View>
    </Modal>
  )
}

/** A 44pt round control over the viewfinder: black glass, white glyph. */
function RoundButton({ label, hint, onPress, children, style }: { label: string; hint?: string; onPress: () => void; children: ReactNode; style?: object }) {
  const { palette } = useTheme()
  const solid = usePrefersReducedTransparency()
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      hitSlop={6}
      style={{ width: layout.touchTarget, height: layout.touchTarget, borderRadius: layout.touchTarget / 2, alignItems: "center", justifyContent: "center", backgroundColor: hexToRgba(palette.overlay, solid ? 0.9 : 0.55), ...style }}
    >
      {children}
    </PressableScale>
  )
}

/** A wide control on the camera's black bar: a translucent white fill, or the accent for the primary action. */
function ChromeButton({ label, accessibilityLabel, icon, primary, disabled, onPress }: { label: string; accessibilityLabel?: string; icon?: ReactNode; primary?: boolean; disabled?: boolean; onPress: () => void }) {
  const { palette } = useTheme()
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={{ flex: 1, minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 16, borderRadius: layout.controlRadius, borderCurve: "continuous", backgroundColor: primary ? palette.accent : hexToRgba(ON_CAMERA, 0.16) }}
    >
      {icon}
      <Text style={{ color: primary ? palette.onAccent : ON_CAMERA, ...typeStyle(16, { weight: primary ? "700" : "600" }) }}>{label}</Text>
    </PressableScale>
  )
}
