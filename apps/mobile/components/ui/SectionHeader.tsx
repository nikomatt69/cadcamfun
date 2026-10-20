import type { ReactNode } from "react"
import { StyleSheet, Text, View } from "react-native"
import { useTheme } from "@/lib/theme"
import { type } from "@/lib/typography"

/** The iOS hairline: 1 logical pixel, `inset` points from the left edge. */
export function Divider({ inset = 0 }: { inset?: number }) {
  const { palette } = useTheme()
  return <View style={{ height: StyleSheet.hairlineWidth, marginLeft: inset, backgroundColor: palette.border }} />
}

/** An iOS grouped-list section header: small caps label with the section's tracking. */
export function SectionHeader({ children, padded = true }: { children: ReactNode; padded?: boolean }) {
  const { palette } = useTheme()
  return (
    <View style={{ paddingHorizontal: padded ? 4 : 0, paddingTop: 24, paddingBottom: 10 }}>
      <Text accessibilityRole="header" style={{ color: palette.ink, ...type(18, { weight: "600" }) }}>{children}</Text>
    </View>
  )
}
