import type { ReactNode } from "react"
import { Text, View } from "react-native"
import { useTheme } from "@/lib/theme"

/** The iOS hairline: 1 logical pixel, `inset` points from the left edge. */
export function Divider({ inset = 0 }: { inset?: number }) {
  const { palette } = useTheme()
  return <View style={{ height: 0.5, marginLeft: inset, backgroundColor: palette.border }} />
}

/** An iOS grouped-list section header: small caps label with the section's tracking. */
export function SectionHeader({ children, padded = true }: { children: ReactNode; padded?: boolean }) {
  const { palette } = useTheme()
  return (
    <View style={{ paddingHorizontal: padded ? 16 : 0, paddingTop: 22, paddingBottom: 7 }}>
      <Text style={{ color: palette.muted, fontSize: 13, lineHeight: 18, letterSpacing: 0.13, textTransform: "uppercase", fontWeight: "600" }}>{children}</Text>
    </View>
  )
}
