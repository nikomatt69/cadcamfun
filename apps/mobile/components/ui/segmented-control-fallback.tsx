import { layout } from "@/lib/layout"
import { useEffect, useRef, useState } from "react"
import { Pressable, Text, View, useWindowDimensions } from "react-native"
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated"
import { SPRING, spring, usePrefersReducedMotion } from "@/lib/animation"
import { hexToRgba, useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"

export type SegmentedControlProps<T extends string> = {
  segments: ReadonlyArray<{ value: T; label: string }>
  value: T
  onChange: (value: T) => void
  accessibilityLabel?: string
}

/** Large text becomes a vertical choice group so no mode label is abbreviated. */
export function SegmentedControlFallback<T extends string>({ segments, value, onChange, accessibilityLabel }: SegmentedControlProps<T>) {
  const { palette } = useTheme()
  const { fontScale } = useWindowDimensions()
  const reduced = usePrefersReducedMotion()
  const [width, setWidth] = useState(0)
  const index = Math.max(0, segments.findIndex((segment) => segment.value === value))
  const inset = 4
  const stacked = fontScale > 1.5
  const thumbWidth = Math.max(0, (width - inset * 2) / Math.max(segments.length, 1))
  const x = useSharedValue(0)
  const previousThumbWidth = useRef(0)
  useEffect(() => {
    // Initial measurement and rotation establish geometry; only a change of choice moves it.
    const geometryChanged = previousThumbWidth.current !== thumbWidth
    previousThumbWidth.current = thumbWidth
    x.set(reduced || geometryChanged ? index * thumbWidth : withSpring(index * thumbWidth, spring(SPRING)))
  }, [index, thumbWidth, reduced, x])
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }))

  if (!segments.length) return null

  return (
    <View accessibilityRole="tablist" accessibilityLabel={accessibilityLabel} onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={{
      minHeight: 48, padding: inset, borderRadius: layout.controlRadius, borderCurve: "continuous", backgroundColor: palette.panel,
      flexDirection: stacked ? "column" : "row", gap: stacked ? 4 : 0,
    }}>
      {!stacked && width > 0 ? <Animated.View pointerEvents="none" style={[{
        position: "absolute", left: inset, top: inset, bottom: inset, width: thumbWidth,
        borderRadius: 12, borderCurve: "continuous", backgroundColor: palette.surface,
        boxShadow: "0 1px 3px rgba(15,23,42,0.12)",
      }, thumb]} /> : null}
      {segments.map((segment) => {
        const selected = segment.value === value
        return <Pressable key={segment.value} accessibilityRole="tab" accessibilityState={{ selected }}
          accessibilityLabel={segment.label}
          onPress={() => { if (!selected) { haptic("selection"); onChange(segment.value) } }}
          style={({ pressed }) => ({ flex: stacked ? undefined : 1, minWidth: 0, minHeight: layout.touchTarget, alignItems: "center", justifyContent: "center", paddingHorizontal: 6, paddingVertical: 8, borderRadius: 12, backgroundColor: stacked && selected ? palette.surface : pressed ? hexToRgba(palette.ink, 0.04) : undefined })}>
          <Text style={{ color: selected ? palette.ink : palette.soft, fontSize: 13, lineHeight: 18, fontWeight: selected ? "700" : "500", textAlign: "center" }}>{segment.label}</Text>
        </Pressable>
      })}
    </View>
  )
}
