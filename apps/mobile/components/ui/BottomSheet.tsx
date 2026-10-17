import type { PropsWithChildren, ReactNode } from "react"
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { X } from "lucide-react-native"
import { useTheme } from "@/lib/theme"
import { usePrefersReducedMotion } from "@/lib/animation"
import { ToastHost } from "./ToastHost"
import { useContentLayout } from "@/components/layout/use-content-layout"
import { layout } from "@/lib/layout"

/** A native presentation owns focus, dismissal, stacking above tabs and keyboard-safe scrolling. */
export function BottomSheet({ open, onClose, title, children, dragEnabled = true }: PropsWithChildren<{
  open: boolean
  onClose: () => void
  title?: ReactNode
  dragEnabled?: boolean
}>) {
  const { palette } = useTheme()
  const reduced = usePrefersReducedMotion()
  const content = useContentLayout()
  return <Modal visible={open} presentationStyle="pageSheet" animationType={reduced ? "fade" : "slide"}
    allowSwipeDismissal={dragEnabled} onRequestClose={onClose}>
    <SafeAreaView edges={["top", "bottom", "left", "right"]} style={{ flex: 1, backgroundColor: palette.background }}>
      <View onLayout={content.onLayout} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: content.gutter, paddingVertical: 12, gap: 12 }}>
        <Text accessibilityRole="header" style={{ flex: 1, minWidth: 0, color: palette.ink, fontSize: 22, lineHeight: 28, fontWeight: "700" }}>{title}</Text>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close sheet"
          style={({ pressed }) => ({ width: layout.touchTarget, height: layout.touchTarget, flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: 22, backgroundColor: palette.panel, opacity: pressed ? 0.6 : 1 })}>
          <X size={20} color={palette.soft} />
        </Pressable>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive"
          contentContainerStyle={{ paddingTop: 12, paddingBottom: 32, width: "100%", maxWidth: layout.contentWidth + layout.gutter * 2, alignSelf: "center" }}>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
      <ToastHost />
    </SafeAreaView>
  </Modal>
}
