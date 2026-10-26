import { ActivityIndicator, View } from "react-native"
import { useTheme } from "@/lib/theme"
import { BrandMark } from "@/components/layout/BrandMark"
import { EntryScreen } from "@/components/layout/EntryScreen"

/**
 * The boot screen. It lives for the few hundred milliseconds the stored pairing is being tried:
 * a mark and a spinner, nothing else — perceived speed (Emil: a fast spinner makes the app feel
 * faster than it is). Redirect: no pairing → the Pair screen; paired → Projects.
 */
export default function IndexScreen() {
  const { palette } = useTheme()
  return (
    <EntryScreen centered>
      <View style={{ alignItems: "center", gap: 14 }}>
        <BrandMark size={72} />
        <ActivityIndicator color={palette.accent} accessibilityLabel="Loading your workspace" />
      </View>
    </EntryScreen>
  )
}
