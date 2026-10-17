import { Stack } from "expo-router"
import { useTheme } from "@/lib/theme"

/** Every tab owns a native stack, so titles, status-bar insets and back gestures have one owner. */
export function TabStack({ title, largeTitle = true }: { title: string; largeTitle?: boolean }) {
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
    </Stack>
  )
}
