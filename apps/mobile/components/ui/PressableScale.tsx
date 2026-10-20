import { useState, type PropsWithChildren } from "react"
import { Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from "react-native"
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated"
import { DIM_IN_MS, DIM_OUT_MS, EASE_OUT, PRESS_SPRING, spring, usePrefersReducedMotion, useStable } from "@/lib/animation"
import { hexToRgba, useTheme } from "@/lib/theme"

/**
 * The one pressable the whole app builds on (Apple §1 — feedback on the press, not the release;
 * Emil — buttons must feel responsive).
 *
 * Press-in: scale 0.97 (~160ms) + a faint ink tint where `tint` is set — the same feedback the
 * row, the chip and the big button all share, so anything pressable feels identical. Under
 * Reduce Motion the scale is skipped and only the tint remains.
 */
export type PressableScaleProps = Omit<PressableProps, "style" | "children"> &
  PropsWithChildren<{
    style?: StyleProp<ViewStyle>
    /** Paint an ink tint over the pressed surface (rows, list items, cards). */
    tint?: boolean
    /** Pressed tint strength; defaults to 4% ink. */
    tintStrength?: number
    /** Subtler scale for rows inside scrollables (0.985). */
    subtle?: boolean
    /** Turn the scale off entirely (the tint still fires). */
    noScale?: boolean
    /** Dim the whole surface on press (buttons); rows only tint. */
    dim?: boolean
    /** Opacity while dimmed (default 0.72). Pass a higher value where the label must stay AA-readable mid-press. */
    dimOpacity?: number
    /**
     * Extra tap area around the surface. Defaults to 4pt for free-standing controls and 0 for
     * `tint`/`subtle` surfaces (rows, cards), which are large and stacked edge to edge: a slop there
     * would steal taps from the neighbour.
     */
    hitSlop?: PressableProps["hitSlop"]
    /** Opacity while disabled (default 0.45); a busy-but-not-dead control reads better closer to 1. */
    disabledOpacity?: number
  }>

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

export function PressableScale({
  children,
  onPressIn,
  onPressOut,
  disabled,
  style,
  tint = false,
  tintStrength = 0.04,
  subtle = false,
  noScale = false,
  dim = false,
  dimOpacity = 0.72,
  hitSlop,
  disabledOpacity = 0.45,
  ...rest
}: PressableScaleProps) {
  const { palette } = useTheme()
  const reduced = usePrefersReducedMotion()
  const scale = useSharedValue(1)
  const opacity = useSharedValue(1)
  const pressSpring = useStable(() => spring(PRESS_SPRING))
  const [pressed, setPressed] = useState(false)
  const interactive = Boolean(rest.onPress || rest.onLongPress || onPressIn || onPressOut)

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.get() }],
    opacity: disabled ? disabledOpacity : opacity.get(),
  }))

  return (
    <AnimatedPressable
      accessibilityRole={rest.onPress ? "button" : undefined}
      pressRetentionOffset={12}
      hitSlop={hitSlop ?? (tint || subtle ? 0 : 4)}
      disabled={disabled}
      accessibilityState={{ disabled: Boolean(disabled) }}
      onPressIn={(event) => {
        onPressIn?.(event)
        if (!interactive) return
        setPressed(true)
        if (!noScale) scale.set(reduced ? 1 : withSpring(subtle ? 0.985 : 0.97, pressSpring))
        if (dim) opacity.set(withTiming(dimOpacity, { duration: DIM_IN_MS, easing: EASE_OUT }))
      }}
      onPressOut={(event) => {
        onPressOut?.(event)
        setPressed(false)
        if (!noScale) scale.set(reduced ? 1 : withSpring(1, pressSpring))
        if (dim) opacity.set(withTiming(1, { duration: DIM_OUT_MS, easing: EASE_OUT }))
      }}
      {...rest}
      style={[style, animatedStyle]}
    >
      {tint && pressed ? (
        <View pointerEvents="none" style={{
          position: "absolute",
          inset: 0,
          borderRadius: StyleSheet.flatten(style)?.borderRadius,
          borderCurve: "continuous",
          backgroundColor: hexToRgba(palette.ink, tintStrength),
        }} />
      ) : null}
      {children}
    </AnimatedPressable>
  )
}
