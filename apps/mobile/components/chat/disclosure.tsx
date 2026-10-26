import { useEffect, type PropsWithChildren, type ReactNode } from "react"
import { Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from "react-native"
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated"
import { ChevronRight } from "lucide-react-native"
import { EASE_OUT, usePrefersReducedMotion } from "@/lib/animation"
import { haptic } from "@/lib/haptics"
import { useTheme } from "@/lib/theme"
import { type as typeStyle } from "@/lib/typography"
import { PressableScale } from "@/components/ui/PressableScale"

/**
 * Shared disclosure motion for the transcript cards (tool calls, tool runs, reasoning): the chevron
 * turns a quarter turn and the revealed content fades in. Ease-out, under 200ms, opacity and
 * transform only; under Reduce Motion the content still appears, just without the movement.
 */
export function DisclosureChevron({ open, size = 15, color }: { open: boolean; size?: number; color: string }) {
  const reduced = usePrefersReducedMotion()
  const turn = useSharedValue(open ? 1 : 0)
  useEffect(() => {
    turn.set(reduced ? (open ? 1 : 0) : withTiming(open ? 1 : 0, { duration: 180, easing: EASE_OUT }))
  }, [open, reduced, turn])
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.get() * 90}deg` }] }))
  return (
    <Animated.View style={style}>
      <ChevronRight size={size} color={color} />
    </Animated.View>
  )
}

export function Reveal({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const reduced = usePrefersReducedMotion()
  return (
    <Animated.View
      entering={reduced ? undefined : FadeIn.duration(180).easing(EASE_OUT)}
      exiting={reduced ? undefined : FadeOut.duration(120).easing(EASE_OUT)}
      style={style}
    >
      {children}
    </Animated.View>
  )
}

/**
 * nikcli's DisclosureRow: one recessive line between messages ("Ran 5 commands") that opens the detail behind it. The
 * lead-in reads in ink and the rest stays quiet; a quarter-turn chevron says it opens. Deliberately not a card.
 */
export function DisclosureRow({ emphasis, label, detail, detailTone = "muted", open, onPress, accessibilityLabel, icon }: {
  emphasis?: string
  label: string
  /** A quieter tail on the same line ("· CAD · CAM"). */
  detail?: string
  detailTone?: "muted" | "danger"
  open: boolean
  onPress(): void
  accessibilityLabel: string
  icon?: ReactNode
}) {
  const { palette } = useTheme()
  const { fontScale } = useWindowDimensions()
  return (
    <PressableScale
      subtle
      tint
      onPress={() => { haptic("selection"); onPress() }}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={accessibilityLabel}
      style={{ marginHorizontal: 16, minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 9, borderRadius: 12 }}
    >
      {icon}
      <View style={{ flexShrink: 1, flexDirection: "row", alignItems: "center", gap: 5 }}>
        {emphasis ? <Text numberOfLines={1} style={{ color: palette.ink, ...typeStyle(15, { weight: "500" }) }}>{emphasis}</Text> : null}
        <Text numberOfLines={fontScale > 1.3 ? 2 : 1} style={{ flexShrink: 1, color: palette.muted, ...typeStyle(15) }}>
          {label}
          {detail ? <Text style={{ color: detailTone === "danger" ? palette.danger : palette.muted }}>{` · ${detail}`}</Text> : null}
        </Text>
      </View>
      <DisclosureChevron open={open} size={16} color={palette.muted} />
    </PressableScale>
  )
}
