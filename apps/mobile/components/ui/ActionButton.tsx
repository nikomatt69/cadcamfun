import { layout } from "@/lib/layout"
import type { ReactNode } from "react"
import { ActivityIndicator, Text, View } from "react-native"
import { PressableScale } from "./PressableScale"
import { haptic } from "@/lib/haptics"
import { hexToRgba, useTheme, type Palette } from "@/lib/theme"
import { type } from "@/lib/typography"

export type ActionButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "tinted"
export type ActionButtonSize = "small" | "regular" | "large"

type ActionButtonProps = {
  label: string
  /** Leading glyph inside the control (lucide icon element). */
  icon?: ReactNode
  loading?: boolean
  disabled?: boolean
  /**
   * primary: solid accent. secondary: raised surface + hairline. ghost: transparent + hairline.
   * danger: red wash with red label (destructive, not alarming). tinted: accent wash with accent label.
   */
  variant?: ActionButtonVariant
  /** Legacy shorthand for `size="small"`. */
  small?: boolean
  /** small 44pt (inline, in rows and sheets), regular 52pt (the form action), large 56pt (the screen's one main action). */
  size?: ActionButtonSize
  fullWidth?: boolean
  /** "rounded" (continuous 16pt corners, default) or "pill" (capsule, like the search dock's action). */
  shape?: "rounded" | "pill"
  /** Haptic fired on press. Default "selection"; use "none" when the handler fires its own result haptic. */
  haptic?: "selection" | "light" | "none"
  /** Replaces the spoken label while `loading` (for example "Saving"). The visible label keeps its width. */
  loadingLabel?: string
  /** What happens on activation, when the label alone does not say it. */
  accessibilityHint?: string
  testID?: string
  onPress?: () => void
}

type ButtonTone = { backgroundColor: string; borderColor: string; textColor: string; borderWidth: number }

/** Colors of each variant. Exported for tests and for components that must match a button's material. */
export function buttonTone(variant: ActionButtonVariant, palette: Palette): ButtonTone {
  switch (variant) {
    case "secondary":
      return { backgroundColor: palette.surfaceRaised, borderColor: palette.border, textColor: palette.ink, borderWidth: 1 }
    case "ghost":
      return { backgroundColor: "transparent", borderColor: palette.border, textColor: palette.ink, borderWidth: 1 }
    case "danger":
      return { backgroundColor: hexToRgba(palette.danger, 0.1), borderColor: hexToRgba(palette.danger, 0.22), textColor: palette.danger, borderWidth: 1 }
    case "tinted":
      return { backgroundColor: hexToRgba(palette.accent, 0.12), borderColor: hexToRgba(palette.accent, 0.24), textColor: palette.accentStrong, borderWidth: 1 }
    default:
      return { backgroundColor: palette.accent, borderColor: "transparent", textColor: palette.onAccent, borderWidth: 0 }
  }
}

const SIZES: Record<ActionButtonSize, { minHeight: number; paddingHorizontal: number; paddingVertical: number; fontSize: number }> = {
  small: { minHeight: layout.touchTarget, paddingHorizontal: 16, paddingVertical: 8, fontSize: 14 },
  regular: { minHeight: layout.controlHeight, paddingHorizontal: 20, paddingVertical: 12, fontSize: 16 },
  large: { minHeight: 56, paddingHorizontal: 24, paddingVertical: 14, fontSize: 17 },
}

/**
 * Rounded action button. Primary is a solid accent fill with contrasting text; the other variants sit on
 * raised surface or a tinted wash with a hairline border. All colors derive from the active palette.
 *
 * Loading keeps the label laid out (invisible) under a centred spinner, so the button never changes width and
 * the row around it never jumps. Pressed state dims to 0.88 (the lowest opacity that keeps the primary label
 * above 4.5:1 in both themes, measured) and scales - the same feedback as every other pressable, so the app
 * reads as one material. The label wraps instead of truncating at large Dynamic Type sizes, and the control
 * grows with it (minHeight, never a fixed height).
 */
export function ActionButton({
  label, icon, loading, disabled, variant = "primary", small = false, size, fullWidth = true, shape = "rounded",
  haptic: hapticKind = "selection", loadingLabel, accessibilityHint, testID, onPress,
}: ActionButtonProps) {
  const { palette } = useTheme()
  const inactive = Boolean(disabled || loading)
  const metrics = SIZES[size ?? (small ? "small" : "regular")]
  const tone = buttonTone(variant, palette)

  return (
    <PressableScale
      onPress={onPress ? () => { if (hapticKind !== "none") haptic(hapticKind); onPress() } : undefined}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={loading && loadingLabel ? loadingLabel : label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: Boolean(loading) }}
      testID={testID}
      dim
      dimOpacity={0.88}
      disabledOpacity={loading ? 0.85 : 0.45}
      style={{
        minHeight: metrics.minHeight,
        alignSelf: fullWidth ? "stretch" : "center",
        paddingHorizontal: metrics.paddingHorizontal,
        paddingVertical: metrics.paddingVertical,
        borderRadius: shape === "pill" ? metrics.minHeight / 2 : layout.controlRadius,
        borderCurve: "continuous",
        borderWidth: tone.borderWidth,
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
        <Text style={{ flexShrink: 1, color: tone.textColor, textAlign: "center", ...type(metrics.fontSize, { weight: "600" }) }}>{label}</Text>
      </View>
      {loading ? (
        <View pointerEvents="none" style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={tone.textColor} />
        </View>
      ) : null}
    </PressableScale>
  )
}
