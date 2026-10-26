import type { ReactNode } from "react"
import { ActivityIndicator, Text, View } from "react-native"
import { GlassSurface } from "@/components/GlassView"
import { PressableScale } from "@/components/ui/PressableScale"
import { PALETTES } from "@/lib/palette"
import { haptic } from "@/lib/haptics"
import { hexToRgba, useTheme } from "@/lib/theme"
import { type as typeStyle } from "@/lib/typography"

/**
 * The dock capsule (the "New" of the conversations dock, the send of the composer): a 52pt pill, accent for the
 * screen's one primary action, glass for the others. Loading keeps the label's geometry under a spinner so
 * the dock never changes size mid-tap.
 */
export function CapsuleButton({ label, icon, variant = "primary", over = "page", loading = false, disabled = false, hint, onPress }: {
  label: string
  icon?: ReactNode
  variant?: "primary" | "glass"
  /** `camera` puts the glass variant on the black viewfinder: dark material, white label, in both themes. */
  over?: "page" | "camera"
  loading?: boolean
  disabled?: boolean
  hint?: string
  onPress: () => void
}) {
  const { palette, isDark } = useTheme()
  const inactive = disabled || loading
  const primary = variant === "primary"
  const ink = primary ? palette.onAccent : over === "camera" ? PALETTES.dark.ink : palette.ink

  const content = (
    <View style={{ minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 20, paddingVertical: 10 }}>
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, flexShrink: 1, minWidth: 0, opacity: loading ? 0 : 1 }}>
        {icon}
        <Text numberOfLines={2} maxFontSizeMultiplier={1.4} style={{ flexShrink: 1, color: ink, textAlign: "center", ...typeStyle(16, { weight: "600" }) }}>{label}</Text>
      </View>
      {loading ? <View pointerEvents="none" style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={ink} /></View> : null}
    </View>
  )

  return (
    <PressableScale
      onPress={() => { haptic("selection"); onPress() }}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      dim={primary}
      dimOpacity={0.88}
      tint={!primary}
      disabledOpacity={loading ? 0.85 : 0.45}
      style={{
        alignSelf: "stretch",
        borderRadius: 26,
        borderCurve: "continuous",
        ...(primary ? { backgroundColor: palette.accent, boxShadow: `0 6px 16px ${hexToRgba(palette.overlay, isDark ? 0.4 : 0.18)}` } : null),
      }}
    >
      {primary ? content : <GlassSurface radius={26} over={over}>{content}</GlassSurface>}
    </PressableScale>
  )
}
