import { Pressable, StyleSheet, Text, View } from "react-native"
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated"
import { ArrowDown } from "lucide-react-native"
import { hexToRgba, useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"
import { EASE_OUT, usePrefersReducedMotion } from "@/lib/animation"

/**
 * Floating "back to the latest message" pill (nikcli JumpToLatestPill), shown while the user reads further up the
 * transcript. It counts what arrived meanwhile, so a long turn never scrolls the reader away from what they read.
 */
export function JumpToLatestPill({ visible, count, onPress }: { visible: boolean; count: number; onPress(): void }) {
  const { palette } = useTheme()
  const reduced = usePrefersReducedMotion()
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, bottom: 12, alignItems: "center" }}>
      {visible ? <Animated.View entering={reduced ? undefined : FadeInDown.duration(180).easing(EASE_OUT)} exiting={reduced ? undefined : FadeOutDown.duration(140)}>
        <Pressable
          onPress={() => { haptic("selection"); onPress() }}
          accessibilityRole="button"
          accessibilityLabel={count > 0 ? `Scroll to latest, ${count} new ${count === 1 ? "update" : "updates"}` : "Scroll to latest"}
          hitSlop={8}
          style={({ pressed }) => ({
            minHeight: 44,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingLeft: 16,
            paddingRight: count > 0 ? 10 : 16,
            borderRadius: 22,
            borderCurve: "continuous",
            backgroundColor: hexToRgba(palette.ink, 0.9),
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: hexToRgba(palette.background, 0.14),
            boxShadow: "0 6px 16px rgba(0,0,0,0.22)",
            opacity: pressed ? 0.82 : 1,
            transform: [{ scale: pressed ? 0.97 : 1 }],
          })}
        >
          <ArrowDown size={14} color={palette.background} strokeWidth={2.6} />
          <Text style={{ color: palette.background, fontSize: 13, lineHeight: 18, fontWeight: "600" }}>Latest</Text>
          {count > 0 ? (
            <View style={{ minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 6, alignItems: "center", justifyContent: "center", backgroundColor: palette.background }}>
              <Text style={{ color: palette.ink, fontSize: 11, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{count > 99 ? "99+" : count}</Text>
            </View>
          ) : null}
        </Pressable>
      </Animated.View> : null}
    </View>
  )
}
