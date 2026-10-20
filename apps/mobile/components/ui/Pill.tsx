import type { ReactNode } from "react"
import { Text, View } from "react-native"
import { hexToRgba, useTheme } from "@/lib/theme"
import { STATUS_FILL_ALPHA } from "@/lib/palette"
import { type } from "@/lib/typography"

type Tone = "neutral" | "accent" | "success" | "danger" | "warning" | "info"

export type PillTone = Tone

const toneOf = (tone: Tone, palette: ReturnType<typeof useTheme>["palette"]): string => {
  switch (tone) {
    case "accent":
      return palette.accent
    case "success":
      return palette.success
    case "danger":
      return palette.danger
    case "warning":
      return palette.warning
    case "info":
      return palette.info
    default:
      return palette.soft
  }
}

/**
 * A small status chip — PR state, workflow result, AI-authored marker. Color is carried on the
 * text and the border; the fill stays a translucent tint so the chip reads as a label, not a
 * button (materials: light translucent surfaces draw attention; here we want calm).
 */
export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  const { palette } = useTheme()
  const color = toneOf(tone, palette)
  return (
    <View
      style={{
        alignSelf: "flex-start",
        maxWidth: "100%",
        paddingHorizontal: 8,
        paddingVertical: 2.5,
        borderRadius: 999,
        borderWidth: 0.5,
        borderColor: tone === "neutral" ? palette.border : hexToRgba(color, 0.55),
        borderCurve: "continuous",
        backgroundColor: hexToRgba(color, STATUS_FILL_ALPHA),
      }}
    >
      <Text style={{ color, ...type(11, { weight: "600", leadingScale: 1.1 }) }}>{children}</Text>
    </View>
  )
}
