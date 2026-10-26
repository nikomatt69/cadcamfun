import { useState } from "react"
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native"
import Animated from "react-native-reanimated"
import { Plus, Search, X } from "lucide-react-native"
import { AdaptiveBlur } from "@/components/GlassView"
import { usePressScale } from "@/lib/animation"
import { haptic } from "@/lib/haptics"
import { hexToRgba, useTheme } from "@/lib/theme"
import { type as typeStyle } from "@/lib/typography"

/**
 * A glass search field and the screen's one primary action on a single row (nikcli's FloatingDock).
 * It sits in the page's flow under the list instead of floating over it, so it can never hide a row or
 * collide with the tab bar, and the screen's safe area carries it above the home indicator.
 */
export function SearchDock({ gutter, actionLabel, onAction, actionLoading = false, value, onChangeText, placeholder }: {
  gutter: number
  actionLabel: string
  onAction: () => void
  actionLoading?: boolean
  value: string
  onChangeText: (value: string) => void
  placeholder: string
}) {
  const { palette, isDark } = useTheme()
  const press = usePressScale()
  const [focused, setFocused] = useState(false)
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: gutter, paddingTop: 8, paddingBottom: 8 }}>
      <View
        style={{
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          borderRadius: 26,
          borderCurve: "continuous",
          borderWidth: 1,
          borderColor: hexToRgba(palette.ink, focused ? 0.22 : isDark ? 0.14 : 0.1),
          boxShadow: `0 4px 14px ${hexToRgba(palette.overlay, isDark ? 0.32 : 0.1)}`,
        }}
      >
        <AdaptiveBlur tint={isDark ? "dark" : "light"} intensity={isDark ? 80 : 70} style={StyleSheet.absoluteFill} fallbackColor={hexToRgba(palette.surface, 0.92)} opaqueFallbackColor={palette.surface} pointerEvents="none" />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: 16, paddingRight: 6, minHeight: 52 }}>
          <Search size={18} color={palette.muted} strokeWidth={2} />
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={palette.muted}
            selectionColor={palette.accent}
            keyboardAppearance={isDark ? "dark" : "light"}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel={placeholder}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={{ flex: 1, minWidth: 0, color: palette.ink, paddingVertical: 14, ...typeStyle(16) }}
          />
          {value.length > 0 ? (
            <Pressable onPress={() => { haptic("selection"); onChangeText("") }} accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={6} style={({ pressed }) => ({ width: 40, height: 40, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.5 : 1 })}>
              <X size={16} color={palette.muted} strokeWidth={2.4} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <Pressable
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        onPress={() => { haptic("selection"); onAction() }}
        disabled={actionLoading}
        accessibilityRole="button"
        accessibilityLabel={actionLabel}
        accessibilityState={{ disabled: actionLoading, busy: actionLoading }}
        hitSlop={4}
        style={{ flexShrink: 0 }}
      >
        <Animated.View
          style={[
            {
              minHeight: 52,
              paddingHorizontal: 16,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              borderRadius: 26,
              borderCurve: "continuous",
              backgroundColor: palette.accent,
              opacity: actionLoading ? 0.82 : 1,
              boxShadow: `0 6px 16px ${hexToRgba(palette.overlay, isDark ? 0.4 : 0.18)}`,
            },
            press.style,
          ]}
        >
          {actionLoading ? <ActivityIndicator size="small" color={palette.onAccent} /> : <Plus size={18} color={palette.onAccent} strokeWidth={2.4} />}
          <Text style={{ color: palette.onAccent, ...typeStyle(16, { weight: "600" }) }}>{actionLabel}</Text>
        </Animated.View>
      </Pressable>
    </View>
  )
}
