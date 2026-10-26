import type { ReactNode } from "react"
import { Text, View } from "react-native"
import { useTheme } from "@/lib/theme"
import { type as typeStyle } from "@/lib/typography"

/**
 * The in-content header of a screen that hides the native bar (nikcli's CenteredScreenHeader): one 44pt
 * slot per side and the screen's name centred between them. The slots keep their width when empty, so the
 * title never drifts toward a side that has a control.
 */
export function CenteredScreenHeader({ title, subtitle, left, right }: { title: string; subtitle?: string; left?: ReactNode; right?: ReactNode }) {
  const { palette } = useTheme()
  return (
    <View style={{ flexDirection: "row", alignItems: "center", minHeight: 44 }}>
      <View style={{ width: 44, height: 44, alignItems: "flex-start", justifyContent: "center" }}>{left}</View>
      <View style={{ flex: 1, minWidth: 0, marginHorizontal: 8, alignItems: "center", justifyContent: "center" }}>
        <Text accessibilityRole="header" numberOfLines={1} style={{ color: palette.ink, textAlign: "center", ...typeStyle(20, { weight: "700" }) }}>{title}</Text>
        {subtitle ? <Text numberOfLines={1} style={{ color: palette.muted, textAlign: "center", ...typeStyle(13) }}>{subtitle}</Text> : null}
      </View>
      <View style={{ width: 44, height: 44, alignItems: "flex-end", justifyContent: "center" }}>{right}</View>
    </View>
  )
}
