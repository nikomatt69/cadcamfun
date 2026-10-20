import type { ReactNode } from "react"
import { Stack } from "expo-router"
import { useTheme } from "@/lib/theme"

/**
 * Every tab owns a native stack, so titles, status-bar insets and back gestures have one owner.
 * `children` registers the tab's own pushed screens (a list inside the tab, a detail sheet).
 */
export function TabStack({ title, largeTitle = true, children }: { title: string; largeTitle?: boolean; children?: ReactNode }) {
  const { palette } = useTheme()
  return (
    <Stack screenOptions={{
      headerStyle: { backgroundColor: palette.background },
      headerTintColor: palette.accent,
      headerTitleStyle: { color: palette.ink, fontWeight: "600" },
      headerLargeTitleStyle: { color: palette.ink, fontWeight: "700" },
      headerLargeTitle: largeTitle,
      headerShadowVisible: false,
      headerBackButtonDisplayMode: "minimal",
      contentStyle: { backgroundColor: palette.background },
    }}>
      <Stack.Screen name="index" options={{ title }} />
      {children}
    </Stack>
  )
}
