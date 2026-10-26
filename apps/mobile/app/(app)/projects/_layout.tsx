import { Stack } from "expo-router"
import { TabStack } from "@/components/layout/tab-stack"

/**
 * The Projects stack: list → project → commit diff / pull request / workspace pages. Every screen draws its
 * own centred header (the shape of the conversations screen), so the native bar is hidden here, not in the
 * screens — hiding it in the screen would flash it for a frame. Back swipes still work without the bar.
 *
 * The pull request presents as a native form sheet (UISheetPresentationController) — the platform's sheet, its
 * detents and grabber included — while commit diffs push so the back gesture follows the spatial path back.
 */
export default function ProjectsLayout() {
  return (
    <TabStack title="Projects" largeTitle={false} hideHeader>
      <Stack.Screen name="[id]" options={{ headerShown: false }} />
      <Stack.Screen name="[id]/commit/[oid]" options={{ title: "Commit", headerShown: false }} />
      <Stack.Screen name="[id]/pulls/[number]" options={{ title: "Pull Request", headerShown: false, presentation: "formSheet", sheetGrabberVisible: true, sheetAllowedDetents: [0.9, 1] }} />
      <Stack.Screen name="[id]/workspace/drawings" options={{ title: "Designs", headerShown: false }} />
      <Stack.Screen name="[id]/workspace/drawings/[drawingId]" options={{ title: "Design", headerShown: false }} />
      <Stack.Screen name="[id]/workspace/components" options={{ title: "Components", headerShown: false }} />
      <Stack.Screen name="[id]/workspace/components/[componentId]" options={{ title: "Component", headerShown: false }} />
      <Stack.Screen name="[id]/workspace/toolpaths" options={{ title: "Toolpaths", headerShown: false }} />
      <Stack.Screen name="[id]/workspace/toolpaths/[toolpathId]" options={{ title: "Toolpath", headerShown: false }} />
      <Stack.Screen name="[id]/workspace/library" options={{ title: "Library", headerShown: false }} />
    </TabStack>
  )
}
