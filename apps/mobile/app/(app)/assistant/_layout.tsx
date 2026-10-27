import { Stack } from "expo-router"
import { TabStack } from "@/components/layout/tab-stack"

export default function Layout() {
  // The list and the conversation draw their own headers; hiding the native one here avoids a first-frame flash.
  return (
    <TabStack title="Assistant" largeTitle={false} hideHeader>
      <Stack.Screen name="chat" options={{ title: "Conversation", headerShown: false }} />
    </TabStack>
  )
}
