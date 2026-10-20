import type { ReactNode } from "react"
import { StyleSheet, Text, View } from "react-native"
import { useTheme } from "@/lib/theme"
import { type } from "@/lib/typography"

/** The iOS hairline: 1 logical pixel, `inset` points from the left edge. */
export function Divider({ inset = 0 }: { inset?: number }) {
  const { palette } = useTheme()
  return <View style={{ height: StyleSheet.hairlineWidth, marginLeft: inset, backgroundColor: palette.border }} />
}

/** A grouped-list section title: 18pt semibold on the size-derived tracking, 24pt above and 8pt below so it binds to the group it names. */
export function SectionHeader({ children, padded = true }: { children: ReactNode; padded?: boolean }) {
  const { palette } = useTheme()
  return (
    <View style={{ paddingHorizontal: padded ? 4 : 0, paddingTop: 24, paddingBottom: 8 }}>
      <Text accessibilityRole="header" style={{ color: palette.ink, ...type(18, { weight: "600" }) }}>{children}</Text>
    </View>
  )
}
