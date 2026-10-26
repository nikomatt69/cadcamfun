import { useEffect } from "react"
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from "react-native"
import Animated, { Easing, FadeIn, FadeOut, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated"
import { Sparkles } from "lucide-react-native"
import { EASE_OUT, usePrefersReducedMotion } from "@/lib/animation"
import { haptic } from "@/lib/haptics"
import { hexToRgba, useTheme } from "@/lib/theme"
import { type as typeStyle } from "@/lib/typography"

// Layout-animation builders live at module scope: building them in render re-creates them on every re-render.
const ENTER = FadeIn.duration(160).easing(EASE_OUT)
const EXIT = FadeOut.duration(120).easing(EASE_OUT)

/**
 * The live footer of the transcript (nikcli's session status line): what the desktop is doing right now,
 * in one quiet pill above the composer. The spark turns while the turn runs and holds still under Reduce
 * Motion; a stop request turns the pill red so a turn that is ending is never mistaken for one that is working.
 */
export function SessionStatusLine({ label, stopping = false, onPress }: {
  label: string
  stopping?: boolean
  /** Opens what the turn is doing in detail (the assistant's controls and activity). The pill is plain text without it. */
  onPress?: () => void
}) {
  const { palette, isDark } = useTheme()
  const reduced = usePrefersReducedMotion()
  const turn = useSharedValue(0)
  const spinning = !reduced && !stopping
  useEffect(() => {
    if (!spinning) { cancelAnimation(turn); turn.value = 0; return }
    turn.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.linear }), -1)
    return () => cancelAnimation(turn)
  }, [spinning, turn])
  // A pill that merely appears is not read by VoiceOver (iOS has no live regions): say once that the turn started.
  useEffect(() => { AccessibilityInfo.announceForAccessibility("The assistant is working") }, [])
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 360}deg` }] }))
  const color = stopping ? palette.danger : palette.warning

  const pill = (
    <>
      <Animated.View style={[{ flexShrink: 0 }, spin]}>
        <Sparkles size={13} color={color} strokeWidth={2.2} />
      </Animated.View>
      <Text numberOfLines={2} maxFontSizeMultiplier={1.5} style={{ flexShrink: 1, color, fontVariant: ["tabular-nums"], ...typeStyle(13, { weight: "500" }) }}>
        {label}
      </Text>
    </>
  )
  const frame = {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: stopping ? hexToRgba(palette.danger, 0.22) : isDark ? hexToRgba(palette.ink, 0.1) : hexToRgba(palette.border, 0.72),
    backgroundColor: stopping ? hexToRgba(palette.danger, 0.08) : hexToRgba(palette.ink, isDark ? 0.04 : 0.03),
  } as const

  return (
    <Animated.View
      entering={reduced ? undefined : ENTER}
      exiting={reduced ? undefined : EXIT}
      style={{ alignSelf: "flex-start", maxWidth: "100%", marginBottom: 4 }}
    >
      {onPress ? (
        <Pressable
          onPress={() => { haptic("selection"); onPress() }}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityHint="Opens the assistant's controls and activity"
          // The pill is 28pt tall to sit quietly above the composer; the touch area still reaches 44pt.
          hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
          style={({ pressed }) => ({ ...frame, opacity: pressed ? 0.7 : 1 })}
        >
          {pill}
        </Pressable>
      ) : (
        <View accessible accessibilityRole="text" accessibilityLiveRegion="polite" accessibilityLabel={label} style={frame}>
          {pill}
        </View>
      )}
    </Animated.View>
  )
}
