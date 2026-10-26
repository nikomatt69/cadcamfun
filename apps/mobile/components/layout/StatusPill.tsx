import type { ReactNode } from "react"
import { ActivityIndicator, StyleSheet, Text, View } from "react-native"
import { PressableScale } from "@/components/ui/PressableScale"
import { PALETTES } from "@/lib/palette"
import { haptic } from "@/lib/haptics"
import { hexToRgba, useTheme } from "@/lib/theme"
import { type as typeStyle } from "@/lib/typography"
import type { StatusTone } from "@/lib/connection-banner"

export interface StatusPillAction {
  readonly label: string
  readonly hint?: string
  readonly onPress: () => void
}

/**
 * The status pill language of the assistant's session line, for the entry flow and app chrome: a dot (or a
 * spinner, or a glyph), one line of text and at most one action. The fill is a whisper of the tone, the edge
 * a hairline, the corners continuous.
 *
 * - `over="camera"` draws it on the black viewfinder with the dark palette in both themes.
 * - `bare` drops the frame, for the native tab accessory that already brings its own glass capsule.
 * - Without an action the pill is one accessibility element; with one, the text and the button stay separate
 *   so VoiceOver can reach the button.
 */
export function StatusPill({ tone, label, busy = false, icon, action, over = "page", bare = false, fill = false, maxLines = 2 }: {
  tone: StatusTone
  label: string
  busy?: boolean
  icon?: ReactNode
  action?: StatusPillAction | null
  over?: "page" | "camera"
  bare?: boolean
  /** Stretch to the width of the container instead of hugging the text. */
  fill?: boolean
  maxLines?: number
}) {
  const theme = useTheme()
  const palette = over === "camera" ? PALETTES.dark : theme.palette
  const dark = over === "camera" || theme.isDark
  const color = tone === "success" ? palette.success : tone === "warning" ? palette.warning : tone === "danger" ? palette.danger : palette.soft
  const tinted = tone !== "muted"

  const frame = bare ? null : {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tinted ? hexToRgba(color, 0.22) : dark ? hexToRgba(palette.ink, 0.1) : hexToRgba(palette.border, 0.72),
    backgroundColor: tinted ? hexToRgba(color, 0.08) : hexToRgba(palette.ink, dark ? 0.04 : 0.03),
  } as const

  const body = (
    <>
      <View style={{ width: 16, flexShrink: 0, alignItems: "center", justifyContent: "center" }}>
        {busy ? <ActivityIndicator size="small" color={color} style={{ transform: [{ scale: 0.7 }] }} /> : icon ?? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />}
      </View>
      <Text numberOfLines={maxLines} maxFontSizeMultiplier={1.5} style={{ flexShrink: 1, color, ...typeStyle(13, { weight: "500" }) }}>
        {label}
      </Text>
    </>
  )
  const row = {
    minHeight: bare ? 44 : 28,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: fill ? "stretch" : "flex-start",
    maxWidth: "100%",
    ...frame,
  } as const

  if (!action) {
    return <View accessible accessibilityRole="text" accessibilityLabel={label} style={row}>{body}</View>
  }
  return (
    <View style={row}>
      <View accessible accessibilityRole="text" accessibilityLabel={label} style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 8 }}>{body}</View>
      <PressableScale
        onPress={() => { haptic("selection"); action.onPress() }}
        tint
        tintStrength={0.08}
        accessibilityRole="button"
        accessibilityLabel={action.label}
        accessibilityHint={action.hint}
        // The pill is 28pt tall to sit quietly in the page; the touch area still reaches 44pt.
        hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
        style={{ minHeight: bare ? 44 : 28, minWidth: 44, flexShrink: 0, alignItems: "center", justifyContent: "center", paddingHorizontal: 10, borderRadius: 14, borderCurve: "continuous" }}
      >
        <Text maxFontSizeMultiplier={1.5} style={{ color, ...typeStyle(13, { weight: "700" }) }}>{action.label}</Text>
      </PressableScale>
    </View>
  )
}
