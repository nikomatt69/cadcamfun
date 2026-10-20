import { useEffect } from "react"
import { View, type ViewStyle } from "react-native"
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from "react-native-reanimated"
import { usePrefersReducedMotion } from "@/lib/animation"
import { useTheme } from "@/lib/theme"

/**
 * Loading never steals attention or ignores the user's Reduce Motion preference. The sheen pulses the
 * border tone over the panel tone (0.5 to 1.0): the old 0.35 to 0.7 range left the block at roughly
 * 1.1:1 against the light background, close to invisible.
 */
export function Skeleton({ style }: { style?: ViewStyle | ViewStyle[] }) {
  const { palette } = useTheme()
  const reduced = usePrefersReducedMotion()
  const opacity = useSharedValue(0.5)
  useEffect(() => {
    if (reduced) { opacity.set(0.5); return }
    opacity.set(withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }), -1, true))
    return () => cancelAnimation(opacity)
  }, [reduced, opacity])
  const pulse = useAnimatedStyle(() => ({ opacity: opacity.get() }))
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[{ backgroundColor: palette.panel, borderRadius: 16, borderCurve: "continuous", overflow: "hidden" }, style]}>
    <Animated.View style={[{ position: "absolute", inset: 0, backgroundColor: palette.border }, pulse]} />
  </View>
}
