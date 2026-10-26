import type { ReactNode } from "react"
import { Text, View } from "react-native"
import { useTheme } from "@/lib/theme"
import { toneChip, type Tone } from "@/lib/tones"
import { type } from "@/lib/typography"

export type PillTone = Tone

/**
 * A small status chip - PR state, workflow result, AI-authored marker, a count. Borderless soft pill: a
 * tinted fill with a medium-weight tabular label, exactly the assistant's InfoChip (both read their colors
 * from `lib/tones`, so a Pill beside a chat chip is the same object). Calm on purpose: it reads as a label,
 * not a button. Long text wraps instead of truncating, so a status never loses its last word at large sizes.
 */
export function Pill({ children, tone = "neutral", icon, accessibilityLabel }: {
  children: ReactNode
  tone?: Tone
  /** A small leading glyph (12-14pt lucide icon) drawn in the tone's color by the caller. */
  icon?: ReactNode
  accessibilityLabel?: string
}) {
  const { palette } = useTheme()
  const chip = toneChip(palette, tone)
  return (
    <View
      accessible={accessibilityLabel ? true : undefined}
      accessibilityLabel={accessibilityLabel}
      style={{
        alignSelf: "flex-start",
        maxWidth: "100%",
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
        borderCurve: "continuous",
        backgroundColor: chip.background,
      }}
    >
      {icon}
      <Text style={{ flexShrink: 1, color: chip.color, fontVariant: ["tabular-nums"], ...type(12, { weight: "500", leadingScale: 1.05 }) }}>{children}</Text>
    </View>
  )
}

/** Same chip with the label as a prop - the API of the assistant's InfoChip, for screens that share its call sites. */
export function InfoChip({ label, tone = "neutral", icon }: { label: string; tone?: Tone; icon?: ReactNode }) {
  return <Pill tone={tone} icon={icon}>{label}</Pill>
}
