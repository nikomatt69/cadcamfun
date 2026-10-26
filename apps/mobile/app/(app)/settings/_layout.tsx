import { Stack } from "expo-router"
import { TabStack } from "@/components/layout/tab-stack"

/**
 * The Settings stack. Every screen draws its own centred header (the shape of the conversations screen), so the
 * native bar is hidden here rather than in the screens, where hiding it would flash it for a frame.
 */
export default function Layout() {
  return (
    <TabStack title="Settings" largeTitle={false} hideHeader>
      <Stack.Screen name="costs" options={{ title: "Production costs", headerShown: false }} />
      <Stack.Screen name="organizations" options={{ title: "Organizations", headerShown: false }} />
      <Stack.Screen name="organization" options={{ title: "Organization", headerShown: false }} />
      <Stack.Screen name="resources" options={{ title: "Resources", headerShown: false }} />
      <Stack.Screen name="resource" options={{ title: "Resource", headerShown: false }} />
    </TabStack>
  )
}
