import { useEffect, useRef, useState } from "react"
import { ActivityIndicator, Modal, Text, View } from "react-native"
import { CameraView, useCameraPermissions } from "expo-camera"
import { Image } from "expo-image"
import { RotateCcw, X } from "lucide-react-native"
import { ActionButton } from "@/components/ui/ActionButton"
import { ErrorBanner } from "@/components/ui/ErrorBanner"
import { PressableScale } from "@/components/ui/PressableScale"
import { useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"
import { photoName, type PendingAttachment } from "@/lib/attachments"

/**
 * Take a photo for the assistant.
 *
 * The desktop's assistant reads images attached to a turn, so a picture of the part on the bench is a
 * first-class input. The photo travels as base64 in the prompt, which the gateway budgets for five
 * five-megabyte images; the phone refuses anything larger before it spends that budget.
 */
export function CameraSheet({ open, onClose, onCapture }: {
  open: boolean
  onClose: () => void
  onCapture: (attachment: PendingAttachment) => void
}) {
  const { palette } = useTheme()
  const [permission, requestPermission] = useCameraPermissions()
  const cameraRef = useRef<CameraView>(null)
  const [facing, setFacing] = useState<"back" | "front">("back")
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
        setError("The photo could not be read. Try again.")
        return
      }
      setShot({ attachment: { name: photoName(), mime: "image/jpeg", data: photo.base64 }, uri: photo.uri })
      haptic("selection")
    } catch (err) {
      setError(err instanceof Error ? err.message : "The photo could not be taken.")
    } finally {
      setCapturing(false)
    }
  }

  const use = () => {
    if (!shot) return
    haptic("success")
    onCapture(shot.attachment)
    onClose()
  }

  const granted = permission?.granted === true

  return (
    <Modal visible={open} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#000000" }}>
        {shot ? (
          <>
            <Image source={{ uri: shot.uri }} style={{ flex: 1 }} contentFit="contain" accessibilityLabel="Photo to send" />
            <View style={{ flexDirection: "row", gap: 12, padding: 20, paddingBottom: 36, backgroundColor: "rgba(0,0,0,0.6)" }}>
              <PressableScale
                onPress={() => { haptic("selection"); setShot(null) }}
                accessibilityRole="button"
                accessibilityLabel="Take another photo"
                style={{ flex: 1, minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.16)" }}
              >
                <RotateCcw size={18} color="#FFFFFF" />
                <Text style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "600" }}>Retake</Text>
              </PressableScale>
              <PressableScale
                onPress={use}
                accessibilityRole="button"
                accessibilityLabel="Send this photo to the assistant"
                style={{ flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: palette.accent }}
              >
                <Text style={{ color: palette.onAccent, fontSize: 15, fontWeight: "700" }}>Use photo</Text>
              </PressableScale>
            </View>
          </>
        ) : granted ? (
          <>
            <CameraView ref={cameraRef} style={{ flex: 1 }} facing={facing} />
            <View style={{ alignItems: "center", gap: 18, paddingTop: 18, paddingBottom: 40, backgroundColor: "rgba(0,0,0,0.55)" }}>
              {error ? <View style={{ paddingHorizontal: 20, width: "100%" }}><ErrorBanner message={error} /></View> : null}
              <PressableScale
                onPress={() => void capture()}
                disabled={capturing}
                accessibilityRole="button"
                accessibilityLabel="Take the photo"
                style={{ width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", borderWidth: 4, borderColor: "rgba(255,255,255,0.85)" }}
              >
                <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" }}>
                  {capturing ? <ActivityIndicator color="#000000" /> : null}
                </View>
              </PressableScale>
              <PressableScale
                onPress={() => { haptic("selection"); setFacing((current) => (current === "back" ? "front" : "back")) }}
                accessibilityRole="button"
                accessibilityLabel="Switch camera"
                style={{ minHeight: 44, paddingHorizontal: 18, alignItems: "center", justifyContent: "center" }}
              >
                <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "600" }}>Switch camera</Text>
              </PressableScale>
            </View>
          </>
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 28 }}>
            <Text style={{ color: "#FFFFFF", fontSize: 17, fontWeight: "600", textAlign: "center" }}>CADCAMFUN needs the camera to take a photo.</Text>
            {error ? <ErrorBanner message={error} /> : null}
            <ActionButton label="Allow camera" onPress={() => void requestPermission()} />
          </View>
        )}

        <PressableScale
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close the camera"
          style={{ position: "absolute", top: 56, left: 20, width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.55)" }}
        >
          <X size={20} color="#FFFFFF" />
        </PressableScale>
      </View>
    </Modal>
  )
}
