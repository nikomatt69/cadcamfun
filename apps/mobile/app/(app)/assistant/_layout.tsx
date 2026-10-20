import { Stack } from "expo-router"
import { TabStack } from "@/components/layout/tab-stack"

export default function Layout() {
  return (
    <TabStack title="Assistant" largeTitle={false}>
      <Stack.Screen name="conversations" options={{ title: "Conversations", headerLargeTitle: false }} />
    </TabStack>
  )
}
