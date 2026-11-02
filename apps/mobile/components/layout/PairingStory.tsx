import { useEffect } from "react"
import { Text, View } from "react-native"
import Animated, { Easing, cancelAnimation, interpolate, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated"
import { Check, Folder, Wrench } from "lucide-react-native"
import { usePrefersReducedMotion } from "@/lib/animation"
import { BEATS, STORY_MS } from "@/lib/pairing-story"
import { hexToRgba, useTheme } from "@/lib/theme"
import { type } from "@/lib/typography"

const STAGE_HEIGHT = 212
const PANEL_HEIGHT = 320

/**
 * The connect screen's hero: a phone screen coming up from the foot of the page (no plate behind it, cropped by the
 * stage) in which the phone finds the Mac and the work arrives. Six real strings, filler bars only at the edges, one
 * accent. Under Reduce Motion it is the poster frame: connected, both rows on screen.
 */
export function PairingStory() {
  const { palette } = useTheme()
  const reduced = usePrefersReducedMotion()
  const clock = useSharedValue(reduced ? BEATS.hold - 1 : 0)

  useEffect(() => {
    if (reduced) { cancelAnimation(clock); clock.set(BEATS.hold - 1); return }
    clock.set(0)
    clock.set(withRepeat(withTiming(STORY_MS, { duration: STORY_MS, easing: Easing.linear }), -1, false))
    return () => cancelAnimation(clock)
  }, [reduced, clock])

  // One amount per layer, from the same beat table the tests check.
  const amount = (time: number, span: readonly [number, number], drop: readonly [number, number]) => {
    "worklet"
    return interpolate(time, [span[0], span[1], drop[0], drop[1]], [0, 1, 1, 0], "clamp")
  }
  const connectedOn = useAnimatedStyle(() => ({ opacity: amount(clock.get(), BEATS.connected, BEATS.drop) }))
  const searchingOn = useAnimatedStyle(() => ({ opacity: 1 - amount(clock.get(), BEATS.connected, BEATS.drop) }))
  const row = (span: readonly [number, number]) => ({
    opacity: amount(clock.get(), span, BEATS.drop),
    transform: [{ translateY: (1 - amount(clock.get(), span, BEATS.drop)) * 14 }],
  })
  const rowAStyle = useAnimatedStyle(() => row(BEATS.rowA))
  const rowBStyle = useAnimatedStyle(() => row(BEATS.rowB))

  const bar = (width: `${number}%`, tone = 0.1) => <View style={{ height: 8, width, borderRadius: 4, backgroundColor: hexToRgba(palette.ink, tone) }} />

  const tile = (children: React.ReactNode) => (
    <View style={{ width: 36, height: 36, borderRadius: 10, borderCurve: "continuous", alignItems: "center", justifyContent: "center", backgroundColor: hexToRgba(palette.accent, 0.12) }}>{children}</View>
  )

  return (
    <View accessible accessibilityRole="image" accessibilityLabel="Your phone connects to your Mac and its projects and toolpaths appear"
      style={{ height: STAGE_HEIGHT, width: "100%", maxWidth: 358, alignSelf: "center", overflow: "hidden" }}>
      <View style={{
        height: PANEL_HEIGHT, paddingHorizontal: 16, paddingTop: 16, gap: 14,
        borderTopLeftRadius: 28, borderTopRightRadius: 28, borderCurve: "continuous", borderWidth: 0.5, borderColor: palette.border, backgroundColor: palette.surface,
      }}>
        {/* Status: the one thing that changes on its own pill; both words keep their place. */}
        <View style={{ height: 32, alignSelf: "flex-start", justifyContent: "center", paddingHorizontal: 12, borderRadius: 16, borderCurve: "continuous", backgroundColor: palette.panel }}>
          <Animated.View style={[{ position: "absolute", left: 12, flexDirection: "row", alignItems: "center", gap: 8 }, searchingOn]}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: palette.muted }} />
            <Text style={{ color: palette.soft, ...type(13, { weight: "600" }) }}>Searching…</Text>
          </Animated.View>
          <Animated.View style={[{ flexDirection: "row", alignItems: "center", gap: 8 }, connectedOn]}>
            <Check size={14} color={palette.success} strokeWidth={3} />
            <Text style={{ color: palette.success, ...type(13, { weight: "600" }) }}>Connected</Text>
          </Animated.View>
          {/* The invisible longest word sizes the pill, so it never resizes mid-story. */}
          <Text style={{ opacity: 0, height: 0, ...type(13, { weight: "600" }) }}>Searching…  ✓</Text>
        </View>

        {bar("34%", 0.08)}

        <Animated.View style={[{ flexDirection: "row", alignItems: "center", gap: 12 }, rowAStyle]}>
          {tile(<Folder size={17} color={palette.accent} fill={palette.accent} strokeWidth={1.6} />)}
          <Text numberOfLines={1} style={{ flex: 1, color: palette.ink, ...type(15, { weight: "600" }) }}>Gripper assembly</Text>
          <Text style={{ color: palette.muted, ...type(13) }}>Just now</Text>
        </Animated.View>

        <Animated.View style={[{ flexDirection: "row", alignItems: "center", gap: 12 }, rowBStyle]}>
          {tile(<Wrench size={17} color={palette.accent} fill={palette.accent} strokeWidth={1.6} />)}
          <Text numberOfLines={1} style={{ flex: 1, color: palette.ink, ...type(15, { weight: "600" }) }}>Finishing pass</Text>
          <Text style={{ color: palette.success, ...type(13, { weight: "600" }) }}>Ready</Text>
        </Animated.View>

        {/* Filler lives at the edge, where the crop takes it. */}
        <View style={{ gap: 14, opacity: 0.9 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: hexToRgba(palette.ink, 0.06) }} />
            {bar("46%")}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: hexToRgba(palette.ink, 0.06) }} />
            {bar("58%")}
          </View>
        </View>
      </View>
    </View>
  )
}
