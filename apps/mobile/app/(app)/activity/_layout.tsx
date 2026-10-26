import { TabStack } from "@/components/layout/tab-stack"

export default function Layout() {
  // Activity draws its own centred header, like the conversations list; hiding the native one here avoids a first-frame flash.
  return <TabStack title="Activity" largeTitle={false} hideHeader />
}
