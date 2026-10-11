import { Animated, Easing, View, type ViewStyle } from "react-native"
import { useEffect, useRef } from "react"
import { useTheme } from "@/lib/theme"

/**
 * A shimmering placeholder block for list content while it loads. A faster shimmer makes the app
 * feel faster than it is (Emil: perceived performance). The sweep animates only `transform` on the
 * native driver, and stops entirely under Reduce Motion (AccessibilityInfo gate in the caller).
 */
export function Skeleton({ style }: { style?: ViewStyle | ViewStyle[] }) {
  const { palette } = useTheme()
  const progress = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 1200,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    )
    animation.start()
    return () => animation.stop()
  }, [progress])

  return (
    <View style={[{ backgroundColor: palette.panel, borderRadius: 8, overflow: "hidden" }, style]}>
      <Animated.View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: `${palette.muted}22`,
          transform: [
            {
              translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-400, 400] }),
            },
          ],
        }}
      />
    </View>
  )
}
