import { ActivityIndicator, Text } from "react-native"
import { useTheme } from "@/lib/theme"
import { type } from "@/lib/typography"
import { PageScroll } from "@/components/layout/page-scroll"
import { BrandMark } from "@/components/layout/BrandMark"
import { SafeAreaView } from "react-native-safe-area-context"

/**
 * The boot screen. It lives for the few hundred milliseconds the stored pairing is being tried:
 * a mark and a spinner, nothing else — perceived speed (Emil: a fast spinner makes the app feel
 * faster than it is). Redirect: no pairing → the Pair screen; paired → Projects.
 */
export default function IndexScreen() {
  const { palette } = useTheme()
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.background }}>
      <PageScroll contentInsetAdjustmentBehavior="never" contentContainerStyle={{ flexGrow: 1, alignItems: "center", justifyContent: "center", gap: 14 }}>
        <BrandMark size={72} />
        <ActivityIndicator color={palette.accent} accessibilityLabel="Loading your workspace" />
      </PageScroll>
    </SafeAreaView>
  )
}
