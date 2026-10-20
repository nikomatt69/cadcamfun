import { useEffect, type PropsWithChildren } from "react"
import type { StyleProp, ViewStyle } from "react-native"
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated"
import { ChevronRight } from "lucide-react-native"
import { EASE_OUT, usePrefersReducedMotion } from "@/lib/animation"

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
      exiting={reduced ? undefined : FadeOut.duration(120)}
      style={style}
    >
      {children}
    </Animated.View>
  )
}
