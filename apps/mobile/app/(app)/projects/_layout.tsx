import { Stack } from "expo-router"
import { useTheme } from "@/lib/theme"

/**
 * The Projects stack: list → project → commit diff / pull request. The PR detail presents as a
 * native form sheet (UISheetPresentationController) — the platform's sheet, its detents and
 * grabber included — while commit diffs push so the back gesture follows the spatial path back.
 */
export default function ProjectsLayout() {
  const { palette } = useTheme()
  return (
    <Stack
      screenOptions={{
        headerLargeTitle: true,
        headerTintColor: palette.accent,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: palette.background },
        headerTitleStyle: { color: palette.ink },
        contentStyle: { backgroundColor: palette.background },
        headerBackButtonDisplayMode: "minimal",
      }}
    >
      <Stack.Screen name="index" options={{ title: "Projects" }} />
      <Stack.Screen name="[id]" />
      <Stack.Screen name="[id]/commit/[oid]" options={{ title: "Commit", headerLargeTitle: false }} />
      <Stack.Screen name="[id]/pulls/[number]" options={{ title: "Pull Request", presentation: "formSheet", headerLargeTitle: false }} />
    </Stack>
  )
}
