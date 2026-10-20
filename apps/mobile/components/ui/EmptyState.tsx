import type { ReactNode } from "react"
import { Text, View } from "react-native"
import { useTheme } from "@/lib/theme"
import { layout } from "@/lib/layout"
import { type } from "@/lib/typography"
import { IconTile } from "./icon-tile"

export function EmptyState({ title, description, action, icon }: { title: string; description?: string; action?: ReactNode; icon?: ReactNode }) {
  const { palette } = useTheme()
  return <View style={{ alignItems: "center", gap: 12, paddingHorizontal: 24, paddingVertical: 32, borderRadius: layout.cardRadius, borderCurve: "continuous", borderWidth: 0.5, borderColor: palette.border, backgroundColor: palette.surface }}>
    {icon ? <IconTile size={56}>{icon}</IconTile> : null}
    <Text accessibilityRole="header" selectable style={{ textAlign: "center", color: palette.ink, ...type(21, { weight: "600" }) }}>{title}</Text>
    {description ? <Text selectable style={{ maxWidth: 360, textAlign: "center", color: palette.soft, ...type(15, { leadingScale: 1.05 }) }}>{description}</Text> : null}
    {action ? <View style={{ paddingTop: 8, width: "100%" }}>{action}</View> : null}
  </View>
}
