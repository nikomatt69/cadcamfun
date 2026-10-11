import { useState, type ReactNode } from "react"
import { Pressable, type PressableProps, type ViewStyle } from "react-native"
import Animated from "react-native-reanimated"
import { usePressScale } from "@/lib/animation"
import { hexToRgba, useTheme } from "@/lib/theme"

type IconCircleButtonProps = PressableProps & {
  children: ReactNode
  size?: number
  accessibilityLabel: string
  tone?: "surface" | "warm" | "inverse"
  style?: ViewStyle | ViewStyle[]
}

/** Circular header icon button (nikcli: IconCircleButton). 44pt hit target, theme-derived tones. */
export function IconCircleButton({ children, size = 44, accessibilityLabel, tone = "surface", style, onPressIn, onPressOut, ...props }: IconCircleButtonProps) {
  const { palette } = useTheme()
  const [pressed, setPressed] = useState(false)
  const press = usePressScale()
  const inverse = tone === "inverse"
  const warm = tone === "warm"

  return (
    <Animated.View style={[{ width: size, height: size }, press.style]}>
      <Pressable
        {...props}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ ...props.accessibilityState, disabled: Boolean(props.disabled) }}
        hitSlop={props.hitSlop ?? Math.max(8, (44 - size) / 2)}
        onPressIn={(event) => {
          setPressed(true)
          press.onPressIn()
          onPressIn?.(event)
        }}
        onPressOut={(event) => {
          setPressed(false)
          press.onPressOut()
          onPressOut?.(event)
        }}
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderCurve: "continuous",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: inverse ? "rgba(255,255,255,0.16)" : warm ? hexToRgba(palette.accent, 0.18) : palette.surface,
            borderWidth: 1,
            borderColor: inverse ? "rgba(255,255,255,0.22)" : hexToRgba(palette.ink, warm ? 0.06 : 0.12),
            opacity: props.disabled ? 0.45 : pressed ? 0.72 : 1,
          },
          ...(Array.isArray(style) ? style : style ? [style] : []),
        ]}
      >
        {children}
      </Pressable>
    </Animated.View>
  )
}
