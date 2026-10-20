import { useEffect } from "react"
import { View } from "react-native"
import Animated, { FadeIn, FadeOut, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from "react-native-reanimated"
import { EASE_IN_OUT, EASE_OUT, usePrefersReducedMotion } from "@/lib/animation"
import { useTheme } from "@/lib/theme"

const STEP = 160

function Dot({ index, color, still }: { index: number; color: string; still: boolean }) {
  const opacity = useSharedValue(still ? 0.6 : 0.3)
  useEffect(() => {
    if (still) { opacity.set(0.6); return }
    // Opacity only, staggered by 160ms: a quiet "the desktop is thinking" until the first token arrives.
    opacity.set(withDelay(index * STEP, withRepeat(withSequence(
      withTiming(1, { duration: 420, easing: EASE_IN_OUT }),
      withTiming(0.3, { duration: 420, easing: EASE_IN_OUT }),
    ), -1)))
    return () => cancelAnimation(opacity)
  }, [index, still, opacity])
  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }))
  return <Animated.View style={[{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: color }, style]} />
}

/**
 * Shown at the foot of the transcript between sending a prompt and the desktop's first reply row (reasoning, tool,
 * text). Once anything arrives the row is gone, so it never competes with real content. Under Reduce Motion the dots
 * hold still; VoiceOver hears the state once through the screen's announcement, not a looping animation.
 */
export function TypingRow() {
  const { palette } = useTheme()
  const reduced = usePrefersReducedMotion()
  return (
    <Animated.View
      entering={reduced ? undefined : FadeIn.duration(180).easing(EASE_OUT)}
      exiting={reduced ? undefined : FadeOut.duration(120).easing(EASE_OUT)}
      accessible
      accessibilityRole="text"
      accessibilityLabel="Assistant is working"
      style={{ minHeight: 44, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, marginBottom: 4 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
        {[0, 1, 2].map((index) => <Dot key={index} index={index} color={palette.muted} still={reduced} />)}
      </View>
    </Animated.View>
  )
}
