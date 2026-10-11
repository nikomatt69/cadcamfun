import { useEffect, useState } from "react"
import { Pressable, Text, View } from "react-native"
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated"
import { SPRING, spring, usePrefersReducedMotion } from "@/lib/animation"
import { useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"

/**
 * The iOS segmented control — the tab switcher inside a project screen. Tabs are peers, so the
 * thumb glides rather than sliding content (no page slide: peers, not a hierarchy). The thumb is
 * an absolutely positioned pill with no children, so the translate animation never triggers a
 * layout pass. Selection ticks a haptic on the same frame.
 */
export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
}: {
  segments: ReadonlyArray<{ value: T; label: string }>
  value: T
  onChange: (value: T) => void
}) {
  const { palette } = useTheme()
  const reduced = usePrefersReducedMotion()
  const [width, setWidth] = useState(0)

  const count = segments.length
  const index = Math.max(0, segments.findIndex((segment) => segment.value === value))
  const inset = 4
  const thumbWidth = width > 0 ? (width - inset * 2) / count : 0
  const translateX = useSharedValue(0)

  useEffect(() => {
    if (reduced) translateX.set(index * thumbWidth + inset)
    else translateX.set(withSpring(index * thumbWidth + inset, spring(SPRING)))
  }, [index, thumbWidth, inset, reduced, translateX])

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.get() }] }))

  return (
    <View
      style={{
        height: 36,
        borderRadius: 9,
        backgroundColor: palette.panel,
        padding: inset,
        flexDirection: "row",
      }}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      <Animated.View
        style={[
          {
            position: "absolute",
            top: inset,
            left: inset,
            width: thumbWidth,
            height: 28,
            borderRadius: 7,
            backgroundColor: palette.surface,
            shadowColor: "#000",
            shadowOpacity: 0.12,
            shadowRadius: 4,
            shadowOffset: { width: 0, height: 1 },
            elevation: 2,
          },
          thumbStyle,
        ]}
      />
      {segments.map((segment) => {
        const active = segment.value === value
        return (
          <Pressable
            key={segment.value}
            onPress={() => {
              haptic("selection")
              onChange(segment.value)
            }}
            style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
          >
            <Text
              style={{
                color: active ? palette.ink : palette.soft,
                fontSize: 13,
                lineHeight: 18,
                fontWeight: "600",
                letterSpacing: active ? -0.003 : 0,
              }}
              numberOfLines={1}
            >
              {segment.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}
