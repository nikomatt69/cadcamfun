import { Stack } from "expo-router"
import { TabStack } from "@/components/layout/tab-stack"

export default function Layout() {
  // The assistant draws its own glass header; hiding the native one here avoids a first-frame flash.
  return (
    <TabStack title="Assistant" largeTitle={false} hideHeader>
      <Stack.Screen name="conversations" options={{ title: "Conversations", headerLargeTitle: false }} />
    </TabStack>
  )
}
