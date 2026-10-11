import { useState, type PropsWithChildren } from "react"
import { Pressable, type PressableProps, type ViewStyle } from "react-native"
import Animated, { useSharedValue, withSpring } from "react-native-reanimated"
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
export type PressableScaleProps = PressableProps &
  PropsWithChildren<{
    style?: ViewStyle | ViewStyle[]
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

  const animatedStyle = useStable(() => ({
    transform: [{ scale }],
    opacity,
  }))

  return (
    <Pressable
      disabled={disabled}
      onPressIn={(event) => {
        onPressIn?.(event)
        setPressed(true)
        if (!noScale) scale.set(reduced ? 1 : withSpring(subtle ? 0.985 : 0.97, pressSpring))
        if (dim) opacity.set(0.72)
      }}
      onPressOut={(event) => {
        onPressOut?.(event)
        setPressed(false)
        if (!noScale) scale.set(withSpring(1, pressSpring))
        opacity.set(1)
      }}
      {...rest}
    >
      <Animated.View
        style={[
          style,
          { backgroundColor: tint && pressed ? hexToRgba(palette.ink, tintStrength) : undefined },
          animatedStyle,
        ]}
      >
        {children}
      </Animated.View>
    </Pressable>
  )
}
