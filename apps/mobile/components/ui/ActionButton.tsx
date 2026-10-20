import { layout } from "@/lib/layout"
import type { ReactNode } from "react"
import { ActivityIndicator, Text, View } from "react-native"
import { PressableScale } from "./PressableScale"
import { hexToRgba, useTheme } from "@/lib/theme"
import { type } from "@/lib/typography"

type ActionButtonProps = {
  label: string
  /** Leading glyph inside the control (lucide icon element). */
  icon?: ReactNode
  loading?: boolean
  disabled?: boolean
  variant?: "primary" | "secondary" | "ghost" | "danger"
  small?: boolean
  fullWidth?: boolean
  onPress?: () => void
}

/**
 * Rounded action button. Primary is a solid accent fill with contrasting text;
 * the other variants sit on raised surface with a hairline border. All colors derive from the
 * active palette. Loading preserves the label's geometry under a spinner. Pressed state dims to 0.72
 * and scales — the same feedback as every other pressable, so the app reads as one material.
 */
export function ActionButton({ label, icon, loading, disabled, variant = "primary", small = false, fullWidth = true, onPress }: ActionButtonProps) {
  const { palette } = useTheme()
  const inactive = Boolean(disabled || loading)

  const tone =
    variant === "secondary"
      ? { backgroundColor: palette.surface, borderColor: palette.border, textColor: palette.ink }
      : variant === "ghost"
        ? { backgroundColor: "transparent", borderColor: palette.border, textColor: palette.ink }
        : variant === "danger"
          ? { backgroundColor: hexToRgba(palette.danger, 0.1), borderColor: hexToRgba(palette.danger, 0.22), textColor: palette.danger }
          : { backgroundColor: palette.accent, borderColor: "transparent", textColor: palette.onAccent }

  return (
    <PressableScale
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: Boolean(loading) }}
      dim
      disabledOpacity={loading ? 0.85 : 0.45}
      style={{
        minHeight: small ? layout.touchTarget : 52,
        alignSelf: fullWidth ? "stretch" : "center",
        paddingHorizontal: small ? 16 : 20,
        paddingVertical: small ? 8 : 12,
        borderRadius: layout.controlRadius,
        borderCurve: "continuous",
        borderWidth: variant === "primary" ? 0 : 1,
        borderColor: tone.borderColor,
        backgroundColor: tone.backgroundColor,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 8,
      }}
    >
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, flexShrink: 1, minWidth: 0, opacity: loading ? 0 : 1 }}>
          {icon}
          <Text style={{ flexShrink: 1, color: tone.textColor, textAlign: "center", ...type(small ? 14 : 16, { weight: "600" }) }}>{label}</Text>
      </View>
      {loading ? <View pointerEvents="none" style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={tone.textColor} /></View> : null}
    </PressableScale>
  )
}
