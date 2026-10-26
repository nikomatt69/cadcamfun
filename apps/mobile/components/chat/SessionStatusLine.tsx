import { useEffect } from "react"
import { StyleSheet, Text } from "react-native"
import Animated, { Easing, FadeIn, FadeOut, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated"
import { Sparkles } from "lucide-react-native"
import { EASE_OUT, usePrefersReducedMotion } from "@/lib/animation"
import { hexToRgba, useTheme } from "@/lib/theme"
import { type as typeStyle } from "@/lib/typography"

/**
 * The live footer of the transcript (nikcli's session status line): what the desktop is doing right now,
 * in one quiet pill above the composer. The spark turns while the turn runs and holds still under Reduce
 * Motion; a stop request turns the pill red so a turn that is ending is never mistaken for one that is working.
 */
export function SessionStatusLine({ label, stopping = false }: { label: string; stopping?: boolean }) {
  const { palette, isDark } = useTheme()
  const reduced = usePrefersReducedMotion()
  const turn = useSharedValue(0)
  const spinning = !reduced && !stopping
  useEffect(() => {
    if (!spinning) { cancelAnimation(turn); turn.value = 0; return }
    turn.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.linear }), -1)
    return () => cancelAnimation(turn)
  }, [spinning, turn])
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 360}deg` }] }))
  const color = stopping ? palette.danger : palette.warning

  return (
    <Animated.View
      entering={reduced ? undefined : FadeIn.duration(160).easing(EASE_OUT)}
      exiting={reduced ? undefined : FadeOut.duration(120).easing(EASE_OUT)}
      accessible
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
      accessibilityLabel={label}
      style={{
        alignSelf: "flex-start",
        maxWidth: "100%",
        minHeight: 28,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        marginBottom: 6,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 14,
        borderCurve: "continuous",
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: stopping ? hexToRgba(palette.danger, 0.22) : hexToRgba(palette.ink, isDark ? 0.1 : 0.12),
        backgroundColor: stopping ? hexToRgba(palette.danger, 0.08) : hexToRgba(palette.ink, isDark ? 0.04 : 0.03),
      }}
    >
      <Animated.View style={[{ flexShrink: 0 }, spin]}>
        <Sparkles size={13} color={color} strokeWidth={2.2} />
      </Animated.View>
      <Text numberOfLines={2} style={{ flexShrink: 1, color, fontVariant: ["tabular-nums"], ...typeStyle(13, { weight: "500" }) }}>
        {label}
      </Text>
    </Animated.View>
  )
}
