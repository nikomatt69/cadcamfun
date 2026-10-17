import type { ReactNode } from "react"
import { View } from "react-native"
import { hexToRgba, useTheme } from "@/lib/theme"

export function IconTile({ children, color, size = 44 }: { children: ReactNode; color?: string; size?: number }) {
  const { palette } = useTheme()
  return <View style={{ width: size, height: size, flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: size * 0.3, borderCurve: "continuous", backgroundColor: hexToRgba(color ?? palette.accent, 0.1) }}>{children}</View>
}
