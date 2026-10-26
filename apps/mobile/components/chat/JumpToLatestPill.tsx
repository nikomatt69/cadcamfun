import { StyleSheet, Text, View } from "react-native"
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated"
import { ArrowDown } from "lucide-react-native"
import { hexToRgba, useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"
import { EASE_OUT, usePrefersReducedMotion } from "@/lib/animation"
import { type as typeStyle } from "@/lib/typography"
import { PressableScale } from "@/components/ui/PressableScale"

/**
 * Floating "back to the latest message" pill (nikcli JumpToLatestPill), shown while the user reads further up the
 * transcript. It counts what arrived meanwhile, so a long turn never scrolls the reader away from what they read.
 * It only exists once the reader is more than a screenful above the newest row, so it never covers the last message.
 */
export function JumpToLatestPill({ visible, count, onPress }: { visible: boolean; count: number; onPress(): void }) {
  const { palette } = useTheme()
  const reduced = usePrefersReducedMotion()
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, bottom: 12, alignItems: "center" }}>
      {visible ? <Animated.View entering={reduced ? undefined : FadeInDown.duration(180).easing(EASE_OUT)} exiting={reduced ? undefined : FadeOutDown.duration(140).easing(EASE_OUT)}>
        <PressableScale
          onPress={() => { haptic("selection"); onPress() }}
          accessibilityRole="button"
          accessibilityLabel={count > 0 ? `Scroll to latest messages, ${count} new ${count === 1 ? "update" : "updates"}` : "Scroll to latest messages"}
          hitSlop={8}
          dim
          style={{
            minHeight: 44,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingLeft: 14,
            paddingRight: 16,
            borderRadius: 16,
            borderCurve: "continuous",
            backgroundColor: hexToRgba(palette.ink, 0.92),
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: hexToRgba(palette.background, 0.14),
            boxShadow: `0 6px 16px ${hexToRgba(palette.overlay, 0.22)}`,
          }}
        >
          <ArrowDown size={14} color={palette.background} strokeWidth={2.6} />
          <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={{ color: palette.background, ...typeStyle(13, { weight: "600" }) }}>Latest messages</Text>
          {count > 0 ? (
            <View style={{ minWidth: 22, height: 20, borderRadius: 999, paddingHorizontal: 6, alignItems: "center", justifyContent: "center", backgroundColor: palette.background }}>
              <Text maxFontSizeMultiplier={1.2} style={{ color: palette.ink, fontVariant: ["tabular-nums"], ...typeStyle(11, { weight: "800", leadingScale: 0.88 }) }}>{count > 99 ? "99+" : count}</Text>
            </View>
          ) : null}
        </PressableScale>
      </Animated.View> : null}
    </View>
  )
}
