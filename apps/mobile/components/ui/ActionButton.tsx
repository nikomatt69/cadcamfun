import type { ReactNode } from "react"
import { ActivityIndicator, Text } from "react-native"
import { PressableScale } from "./PressableScale"
import { hexToRgba, useTheme } from "@/lib/theme"
import { type } from "@/lib/typography"

type ActionButtonProps = {
  label: string
  /** Leading glyph inside the pill (lucide icon element). */
  icon?: ReactNode
  loading?: boolean
  disabled?: boolean
  variant?: "primary" | "secondary" | "ghost" | "danger"
  small?: boolean
  fullWidth?: boolean
  onPress?: () => void
}

/**
 * Pill-shaped action button (nikcli-grade). Primary is a solid accent fill with inverted text;
 * the other variants sit on raised surface with a hairline border. All colors derive from the
 * active palette. Loading swaps the label for a spinner in place. Pressed state dims to 0.72
 * and scales — the same feedback as every other pressable, so the app reads as one material.
 */
export function ActionButton({ label, icon, loading, disabled, variant = "primary", small = false, fullWidth = true, onPress }: ActionButtonProps) {
  const { palette } = useTheme()
  const inactive = Boolean(disabled || loading)

  const tone =
    variant === "secondary"
      ? { backgroundColor: palette.surface, borderColor: hexToRgba(palette.ink, 0.12), textColor: palette.ink }
      : variant === "ghost"
        ? { backgroundColor: "transparent", borderColor: hexToRgba(palette.ink, 0.08), textColor: palette.ink }
        : variant === "danger"
          ? { backgroundColor: hexToRgba(palette.danger, 0.1), borderColor: hexToRgba(palette.danger, 0.22), textColor: palette.danger }
          : { backgroundColor: palette.accent, borderColor: "transparent", textColor: palette.onAccent }

  return (
    <PressableScale
      onPress={onPress}
      disabled={inactive}
      dim
      style={{
        minHeight: small ? 38 : 48,
        alignSelf: fullWidth ? "stretch" : "center",
        paddingHorizontal: small ? 16 : 20,
        paddingVertical: small ? 8 : 12,
        borderRadius: 999,
        borderCurve: "continuous",
        borderWidth: variant === "primary" ? 0 : 1,
        borderColor: tone.borderColor,
        backgroundColor: tone.backgroundColor,
        opacity: inactive ? 0.5 : 1,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 8,
      }}
    >
      {loading ? (
        <ActivityIndicator color={tone.textColor} />
      ) : (
        <>
          {icon}
          <Text style={{ color: tone.textColor, textAlign: "center", ...type(small ? 14 : 15, { weight: "600" }) }}>{label}</Text>
        </>
      )}
    </PressableScale>
  )
}
