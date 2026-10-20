import { View } from "react-native"
import { Image } from "expo-image"
import { useTheme } from "@/lib/theme"
import { type } from "@/lib/typography"
import { Text } from "react-native"

const ICON = require("@/assets/icon.png")

/**
 * The brand: the app icon as the mark, the CADCAMFUN wordmark beside or below it.
 * One component so the icon, its continuous corner and the wordmark tracking stay
 * identical on the boot, pairing, lock and assistant hero surfaces.
 */
export function BrandMark({ size = 56, wordmark = true, stacked = true }: { size?: number; wordmark?: boolean; stacked?: boolean }) {
  const { palette } = useTheme()
  const radius = Math.round(size * 0.28)
  return (
    <View accessible accessibilityRole="image" accessibilityLabel="CADCAMFUN" style={{ alignItems: stacked ? "center" : "flex-start", flexDirection: stacked ? "column" : "row", gap: stacked ? 12 : 10 }}>
      <Image
        source={ICON}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ width: size, height: size, borderRadius: radius }}
        contentFit="cover"
      />
      {wordmark ? (
        <Text style={{ color: palette.ink, textAlign: stacked ? "center" : "left", ...type(Math.max(15, Math.round(size * 0.34)), { weight: "800", trackingBoost: 0.6 }) }}>
          CADCAMFUN
        </Text>
      ) : null}
    </View>
  )
}

/** The precise centred header title: the app icon alone, centred in the navigation bar. */
export function BrandHeaderTitle() {
  return (
    <View accessible accessibilityRole="image" accessibilityLabel="CADCAMFUN" style={{ alignItems: "center", justifyContent: "center" }}>
      <Image source={ICON} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 30, height: 30, borderRadius: 9 }} contentFit="cover" />
    </View>
  )
}
