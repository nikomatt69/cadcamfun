import { useState, type ReactNode } from "react"
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native"
import Animated from "react-native-reanimated"
import { Search, X } from "lucide-react-native"
import { AdaptiveBlur } from "@/components/GlassView"
import { usePressScale } from "@/lib/animation"
import { haptic } from "@/lib/haptics"
import { hexToRgba, useTheme } from "@/lib/theme"
import { type as typeStyle } from "@/lib/typography"

/**
 * The Activity screen's dock: SearchDock's glass search field with the screen's primary action beside it, but
 * the action carries its own glyph and only appears when there is something to do. SearchDock's action is
 * always a "plus", which would misname "Read all"; this keeps the same geometry (52pt field, 26pt radius) so
 * the two docks are indistinguishable at rest.
 */
export function ActivityDock({ gutter, value, onChangeText, placeholder, action }: {
  gutter: number
  value: string
  onChangeText: (value: string) => void
  placeholder: string
  action?: { label: string; icon: ReactNode; loading?: boolean; hint?: string; onPress: () => void }
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

      {action ? (
        <Pressable
          onPressIn={press.onPressIn}
          onPressOut={press.onPressOut}
          onPress={() => { haptic("selection"); action.onPress() }}
          disabled={action.loading}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          accessibilityHint={action.hint}
          accessibilityState={{ disabled: Boolean(action.loading), busy: Boolean(action.loading) }}
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
                opacity: action.loading ? 0.82 : 1,
                boxShadow: `0 6px 16px ${hexToRgba(palette.overlay, isDark ? 0.4 : 0.18)}`,
              },
              press.style,
            ]}
          >
            {action.loading ? <ActivityIndicator size="small" color={palette.onAccent} /> : action.icon}
            <Text style={{ color: palette.onAccent, ...typeStyle(16, { weight: "600" }) }}>{action.label}</Text>
          </Animated.View>
        </Pressable>
      ) : null}
    </View>
  )
}
