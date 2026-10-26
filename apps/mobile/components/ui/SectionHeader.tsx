import type { ReactNode } from "react"
import { StyleSheet, Text, View } from "react-native"
import { hexToRgba, useTheme } from "@/lib/theme"
import { caps, type } from "@/lib/typography"

/** The iOS hairline: 1 logical pixel, `inset` points from the left edge. */
export function Divider({ inset = 0, inkAlpha }: { inset?: number; /** Draw with ink at this alpha instead of the palette border (nikcli's 6% list separator). */ inkAlpha?: number }) {
  const { palette } = useTheme()
  return <View style={{ height: StyleSheet.hairlineWidth, marginLeft: inset, backgroundColor: inkAlpha === undefined ? palette.border : hexToRgba(palette.ink, inkAlpha) }} />
}

export type SectionHeaderVariant = "title" | "muted" | "caps"

/**
 * A grouped-list section title. Three registers, one per kind of list:
 *  - "title" (default): 18pt semibold ink, 24pt above and 8pt below - a chapter inside a long detail page;
 *  - "muted": 15pt medium in the muted tone, 16pt above and 8pt below - the date groups of the conversations list
 *    and every list that should read like it (quiet, the rows are the content);
 *  - "caps": 11pt small-caps eyebrow - the settings groups and the assistant's sheet sections.
 * `action` puts a control (a "See all" button, a count pill) at the trailing edge, `count` appends a tabular count.
 */
export function SectionHeader({ children, padded = true, variant = "title", action, count }: {
  children: ReactNode
  padded?: boolean
  variant?: SectionHeaderVariant
  action?: ReactNode
  count?: number
}) {
  const { palette } = useTheme()
  const text =
    variant === "muted" ? { color: palette.muted, ...type(15, { weight: "500" }) }
      : variant === "caps" ? { color: palette.muted, ...caps(11) }
        : { color: palette.ink, ...type(18, { weight: "600" }) }
  const spacing = variant === "title" ? { paddingTop: 24, paddingBottom: 8 } : variant === "muted" ? { paddingTop: 16, paddingBottom: 8 } : { paddingTop: 20, paddingBottom: 8 }
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: padded ? 4 : 0, ...spacing }}>
      <Text accessibilityRole="header" style={{ flexShrink: 1, ...text }}>
        {children}
        {count === undefined ? null : <Text style={{ fontVariant: ["tabular-nums"], color: palette.muted }}>{`  ${count}`}</Text>}
      </Text>
      {action ? <View style={{ flexShrink: 0 }}>{action}</View> : null}
    </View>
  )
}
