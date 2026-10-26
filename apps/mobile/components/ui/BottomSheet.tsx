import { useEffect, useState, type PropsWithChildren, type ReactNode } from "react"
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { X } from "lucide-react-native"
import { hexToRgba, useTheme } from "@/lib/theme"
import { usePrefersReducedMotion } from "@/lib/animation"
import { ToastHost } from "./ToastHost"
import { useContentLayout } from "@/components/layout/use-content-layout"
import { layout } from "@/lib/layout"
import { type } from "@/lib/typography"

/**
 * A native page-sheet presentation: iOS owns the card, its corner radius, the dimmed parent, swipe
 * to dismiss, stacking above the tab bar and keyboard-safe scrolling.
 *
 * What this component adds on top of the bare Modal:
 *  - a grabber (36x5 capsule, 6pt from the top edge) — the affordance that says "this is a sheet";
 *  - a header row with the title and a 44pt close button, both on the shared 16pt gutter;
 *  - bottom safe area and keyboard avoidance, so the last field never hides behind the home bar;
 *  - `padded`: wrap the body in the same 16pt gutter with a 16pt vertical rhythm, so callers stop
 *    re-deriving the sheet padding themselves.
 *
 * Detents: React Native 0.86's Modal exposes no UISheetPresentationController detents (only
 * `pageSheet` / `formSheet` presentation), so this sheet is always the full-height page sheet. A sheet
 * that must rest at a half-height detent has to be a route with `presentation: "formSheet"` instead
 * (see the pull-request screen).
 */
export function BottomSheet({ open, onClose, title, children, dragEnabled = true, padded = false }: PropsWithChildren<{
  open: boolean
  onClose: () => void
  title?: ReactNode
  dragEnabled?: boolean
  /** Wrap the body in the 16pt gutter with 16pt between children. Off by default for existing callers that pad themselves. */
  padded?: boolean
}>) {
  const { palette } = useTheme()
  const reduced = usePrefersReducedMotion()
  const content = useContentLayout()
  const { fontScale } = useWindowDimensions()
  // The header gets a hairline only once content scrolls beneath it (nikcli's sheet header rule).
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => { if (!open) setScrolled(false) }, [open])
  return <Modal visible={open} presentationStyle="pageSheet" animationType={reduced ? "fade" : "slide"}
    allowSwipeDismissal={dragEnabled} onRequestClose={onClose}>
    <SafeAreaView accessibilityViewIsModal edges={["top", "bottom", "left", "right"]} style={{ flex: 1, backgroundColor: palette.background }}>
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden pointerEvents="none"
        style={{ alignSelf: "center", width: 36, height: 5, marginTop: 6, borderRadius: 3, backgroundColor: hexToRgba(palette.muted, 0.5) }} />
      <View onLayout={content.onLayout} style={{ flexDirection: "row", alignItems: "center", minHeight: layout.touchTarget + 16, paddingHorizontal: content.gutter, paddingVertical: 8, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: scrolled ? palette.border : "transparent" }}>
        <Text accessibilityRole="header" numberOfLines={fontScale > 1.3 ? undefined : 2} style={{ flex: 1, minWidth: 0, color: palette.ink, ...type(20, { weight: "700" }) }}>{title}</Text>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close sheet"
          style={({ pressed }) => ({ width: layout.touchTarget, height: layout.touchTarget, flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: layout.touchTarget / 2, borderCurve: "continuous", backgroundColor: pressed ? hexToRgba(palette.ink, 0.12) : palette.panel })}>
          <X size={20} color={palette.soft} />
        </Pressable>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive"
          scrollEventThrottle={32} onScroll={(event) => { const next = event.nativeEvent.contentOffset.y > 2; setScrolled((current) => current === next ? current : next) }}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 32, width: "100%", maxWidth: layout.contentWidth + layout.gutter * 2, alignSelf: "center" }}>
          {padded ? <View style={{ paddingHorizontal: content.gutter, gap: 16 }}>{children}</View> : children}
        </ScrollView>
      </KeyboardAvoidingView>
      <ToastHost />
    </SafeAreaView>
  </Modal>
}
