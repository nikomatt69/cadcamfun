import type { PropsWithChildren, ReactNode } from "react"
import { Modal, Platform, Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useTheme } from "@/lib/theme"
import { type } from "@/lib/typography"
import { BottomSheet } from "./BottomSheet"

/**
 * Modal sheet shell (nikcli: SheetShell, CADCAMFUN theme).
 *
 * BottomSheet owns the gesture/physics; SheetShell owns the modal contract:
 * keyboard avoidance, safe-area padding, title block and a consistent content
 * width. New sheets use this; existing BottomSheet call sites keep working.
 */
export function SheetShell({
  open,
  onClose,
  title,
  description,
  children,
}: PropsWithChildren<{ open: boolean; onClose: () => void; title: string; description?: string }>) {
  const { palette } = useTheme()
  const insets = useSafeAreaInsets()

  return (
    <Modal
      transparent
      visible={open}
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
      presentationStyle={Platform.OS === "ios" ? "overFullScreen" : "fullScreen"}
    >
      <BottomSheet open={open} onClose={onClose} title={undefined}>
        <View style={{ paddingHorizontal: 20, paddingBottom: Math.max(insets.bottom, 16), gap: 4 }}>
          <Text style={{ color: palette.ink, textAlign: "center", ...type(17, { weight: "600" }) }}>{title}</Text>
          {description ? (
            <Text style={{ color: palette.soft, textAlign: "center", ...type(13) }}>{description}</Text>
          ) : null}
          <View style={{ paddingTop: 12 }}>{children as ReactNode}</View>
        </View>
      </BottomSheet>
    </Modal>
  )
}
