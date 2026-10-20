import { useEffect } from "react"
import { View, type ViewStyle } from "react-native"
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from "react-native-reanimated"
import { usePrefersReducedMotion } from "@/lib/animation"
import { useTheme } from "@/lib/theme"

/** Loading never steals attention or ignores the user's Reduce Motion preference. */
export function Skeleton({ style }: { style?: ViewStyle | ViewStyle[] }) {
  const { palette } = useTheme()
  const reduced = usePrefersReducedMotion()
  const opacity = useSharedValue(0.35)
  useEffect(() => {
    if (reduced) { opacity.set(0.35); return }
    opacity.set(withRepeat(withTiming(0.7, { duration: 900, easing: Easing.inOut(Easing.ease) }), -1, true))
    return () => cancelAnimation(opacity)
  }, [reduced, opacity])
  const pulse = useAnimatedStyle(() => ({ opacity: opacity.get() }))
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[{ backgroundColor: palette.panel, borderRadius: 16, borderCurve: "continuous", overflow: "hidden" }, style]}>
    <Animated.View style={[{ position: "absolute", inset: 0, backgroundColor: palette.border }, pulse]} />
  </View>
}
