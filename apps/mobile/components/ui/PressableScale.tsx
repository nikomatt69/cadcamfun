import { useState, type PropsWithChildren } from "react"
import { Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from "react-native"
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated"
import { PRESS_SPRING, spring, usePrefersReducedMotion, useStable } from "@/lib/animation"
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
    opacity: disabled ? 0.45 : opacity.get(),
  }))

  return (
    <AnimatedPressable
      accessibilityRole={rest.onPress ? "button" : undefined}
      pressRetentionOffset={12}
      hitSlop={4}
      disabled={disabled}
      onPressIn={(event) => {
        onPressIn?.(event)
        if (!interactive) return
        setPressed(true)
        if (!noScale) scale.set(reduced ? 1 : withSpring(subtle ? 0.985 : 0.97, pressSpring))
        if (dim) opacity.set(0.72)
      }}
      onPressOut={(event) => {
        onPressOut?.(event)
        setPressed(false)
        if (!noScale) scale.set(reduced ? 1 : withSpring(1, pressSpring))
        opacity.set(1)
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
