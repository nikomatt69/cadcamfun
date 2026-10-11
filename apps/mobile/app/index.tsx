import { ActivityIndicator, Text, View } from "react-native"
import { useTheme } from "@/lib/theme"

/**
 * The boot screen. It lives for the few hundred milliseconds the stored pairing is being tried:
 * a mark and a spinner, nothing else — perceived speed (Emil: a fast spinner makes the app feel
 * faster than it is). Redirect: no pairing → the Pair screen; paired → Projects.
 */
export default function IndexScreen() {
  const { palette } = useTheme()
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 14, backgroundColor: palette.background }}>
      <Text style={{ color: palette.ink, fontSize: 30, fontWeight: "800", letterSpacing: -0.03, lineHeight: 33 }}>CADCAMFUN</Text>
      <ActivityIndicator color={palette.accent} />
    </View>
  )
}
