import type { ReactNode } from "react"
import { Text, View } from "react-native"
import { hexToRgba, useTheme } from "@/lib/theme"
import { IconTile } from "./icon-tile"

export function EmptyState({ title, description, action, icon }: { title: string; description?: string; action?: ReactNode; icon?: ReactNode }) {
  const { palette } = useTheme()
  return <View style={{ alignItems: "center", gap: 12, paddingHorizontal: 24, paddingVertical: 36, borderRadius: 22, borderCurve: "continuous", borderWidth: 0.5, borderColor: hexToRgba(palette.ink, 0.08), backgroundColor: palette.surface }}>
    {icon ? <IconTile size={56}>{icon}</IconTile> : null}
    <Text accessibilityRole="header" selectable style={{ textAlign: "center", color: palette.ink, fontSize: 21, lineHeight: 28, fontWeight: "600", letterSpacing: -0.4 }}>{title}</Text>
    {description ? <Text selectable style={{ maxWidth: 360, textAlign: "center", color: palette.soft, fontSize: 15, lineHeight: 23 }}>{description}</Text> : null}
    {action ? <View style={{ paddingTop: 8, width: "100%" }}>{action}</View> : null}
  </View>
}
